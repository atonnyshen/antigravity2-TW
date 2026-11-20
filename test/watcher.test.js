'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkAndLocalizeApp, exchangeAsar, waitForStableFile, acquireLock, digest, safeReplaceFile, ensureAccessibleDir, recipeHash } = require('../auto_localize_watcher');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-watcher-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const appPath = path.join(root, 'App with spaces');
    fs.mkdirSync(appPath);
    const asarPath = path.join(appPath, 'app.asar');
    fs.writeFileSync(asarPath, 'official-v1');
    const stateDir = path.join(root, 'state');
    let builds = 0;
    const options = {
        stateDir, recipe: 'recipe-v1', wait() {}, sign() {},
        build(stage) {
            builds++;
            fs.appendFileSync(path.join(stage, 'app.asar'), '\n命令選擇區');
        }
    };
    return { appInfo: { appPath, asarPath }, asarPath, stateDir, options,
        run: (extra = {}) => checkAndLocalizeApp({ appPath, asarPath }, { ...options, ...extra }),
        read: () => fs.readFileSync(asarPath, 'utf8'), builds: () => builds };
}

function recoveryReceipt(f) {
    return path.join(f.stateDir, digest(f.appInfo.appPath) + '.pending-recovery.json');
}

test('native ASAR exchange retains byte-identical displaced file on this platform', t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-exchange-native-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const live = path.join(root, 'app.asar');
    const candidate = path.join(root, 'candidate.asar');
    const previous = path.join(root, 'previous.asar');
    fs.writeFileSync(live, 'official-v1');
    fs.writeFileSync(candidate, 'translated-v2');
    const displaced = exchangeAsar(candidate, live, previous);
    assert.equal(fs.readFileSync(live, 'utf8'), 'translated-v2');
    assert.equal(fs.readFileSync(displaced, 'utf8'), 'official-v1');
    if (process.platform === 'win32') {
        assert.equal(displaced, previous, 'ReplaceFileW must create its atomic backup');
    } else {
        assert.equal(displaced, candidate, 'native exchange must keep old data at candidate path');
    }
});

test('official update: backup, apply, persist receipt, then skip unchanged archive', t => {
    const f = fixture(t);
    assert.equal(f.run(), true);
    assert.equal(fs.readFileSync(f.asarPath + '.bak', 'utf8'), 'official-v1');
    assert.equal(f.run(), false);
    assert.equal(f.builds(), 1);
    const receipt = JSON.parse(fs.readFileSync(path.join(f.stateDir, digest(f.appInfo.appPath) + '.json')));
    assert.equal(receipt.output, digest(fs.readFileSync(f.asarPath)));
    fs.writeFileSync(f.asarPath, 'official-v2');
    assert.equal(f.run(), true);
    assert.equal(fs.readFileSync(f.asarPath + '.bak', 'utf8'), 'official-v2');
});

test('recipe update reapplies localized input without restoring stale backup', t => {
    const f = fixture(t);
    f.run();
    fs.writeFileSync(f.asarPath + '.bak', 'stale-official');
    assert.equal(f.run({ recipe: 'recipe-v2' }), true);
    assert.equal(f.builds(), 2);
    assert.match(f.read(), /^official-v1/);
    assert.equal(fs.readFileSync(f.asarPath + '.bak', 'utf8'), 'stale-official');
});

for (const failure of ['builder', 'validation']) {
    test(failure + ' failure preserves live archive and releases lock', t => {
        const f = fixture(t);
        assert.throws(() => f.run({ build() { if (failure === 'builder') throw Error('build failed'); } }));
        assert.equal(f.read(), 'official-v1');
        assert.deepEqual(fs.readdirSync(f.stateDir), []);
        assert.equal(fs.existsSync(f.asarPath + '.bak'), false);
    });
}

test('updater racing the build keeps its new official archive', t => {
    const f = fixture(t);
    assert.throws(() => f.run({ build(stage) {
        f.options.build(stage);
        fs.writeFileSync(f.asarPath, 'official-v2');
    } }), /官方包已改變/);
    assert.equal(f.read(), 'official-v2');
});

test('signing failure rolls back bytes and does not record success', t => {
    const f = fixture(t);
    let calls = 0;
    assert.throws(() => f.run({ sign() { if (++calls === 1) throw Error('sign denied'); } }), /sign denied/);
    assert.equal(calls, 2);
    assert.equal(f.read(), 'official-v1');
    assert.deepEqual(fs.readdirSync(f.stateDir), []);
});

test('failed atomic rollback preserves original ASAR in recovery directory and reports failure', t => {
    const f = fixture(t);
    let exchanges = 0;
    assert.throws(() => f.run({
        exchange(source, destination, previous) {
            if (++exchanges === 2) {
                const error = new Error('simulated rollback write denial');
                error.code = 'EPERM';
                throw error;
            }
            return exchangeAsar(source, destination, previous);
        },
        sign() { throw new Error('simulated signing failure'); }
    }), /simulated signing failure/);
    assert.equal(exchanges, 2);
    const recoveryDirs = fs.readdirSync(f.stateDir).filter(name => name.startsWith('recovery-'));
    assert.equal(recoveryDirs.length, 1);
    assert.equal(fs.readFileSync(path.join(f.stateDir, recoveryDirs[0], 'previous-app.asar'), 'utf8'), 'official-v1');
    assert.equal(JSON.parse(fs.readFileSync(recoveryReceipt(f), 'utf8')).recoverHash, digest('official-v1'));
    assert.equal(fs.existsSync(path.join(f.stateDir, digest(f.appInfo.appPath) + '.json')), false);
});

test('live ASAR refuses non-atomic copy fallback when rename is denied', t => {
    const f = fixture(t);
    fs.writeFileSync(f.asarPath + '.bak', 'official-v1');
    const originalCopy = fs.copyFileSync;
    let unsafeCopies = 0;
    fs.copyFileSync = (source, destination, ...rest) => {
        if (destination === f.asarPath) unsafeCopies++;
        return originalCopy(source, destination, ...rest);
    };
    try {
        assert.throws(() => f.run({ exchange() {
            const error = new Error('Simulated EPERM during native atomic exchange');
            error.code = 'EPERM';
            throw error;
        } }), /Simulated EPERM/);
        assert.equal(unsafeCopies, 0);
        assert.equal(f.read(), 'official-v1');
        assert.equal(fs.readFileSync(f.asarPath + '.bak', 'utf8'), 'official-v1');
        assert.deepEqual(fs.readdirSync(f.stateDir), []);
    } finally {
        fs.copyFileSync = originalCopy;
    }
});

test('ShipIt replace immediately before native exchange preserves newer official ASAR', t => {
    const f = fixture(t);
    let exchanges = 0;
    assert.throws(() => f.run({ exchange(source, destination, previous) {
        if (++exchanges === 1) fs.writeFileSync(destination, 'official-v2-from-ShipIt');
        return exchangeAsar(source, destination, previous);
    } }), /原子置換期間官方 ASAR 已更新/);
    assert.equal(exchanges, 2);
    assert.equal(f.read(), 'official-v2-from-ShipIt');
    assert.equal(fs.readFileSync(f.asarPath + '.bak', 'utf8'), 'official-v1');
    assert.equal(fs.readdirSync(f.stateDir).filter(x => x.endsWith('.json')).length, 0);
    assert.equal(f.run(), true);
    assert.equal(fs.readFileSync(f.asarPath + '.bak', 'utf8'), 'official-v2-from-ShipIt');
});

test('backup ENOSPC blocks any live ASAR replacement, rather than logging success', t => {
    const f = fixture(t);
    const originalRename = fs.renameSync;
    let attempts = 0;
    fs.renameSync = (source, destination) => {
        if (destination === f.asarPath + '.bak') {
            attempts++;
            const error = new Error('Injected ENOSPC in backup promotion');
            error.code = 'ENOSPC';
            throw error;
        }
        return originalRename(source, destination);
    };
    try {
        assert.throws(() => f.run(), /無法以原子置換更新 app\.asar\.bak/);
        assert.equal(attempts, 1);
        assert.equal(f.read(), 'official-v1');
        assert.equal(fs.existsSync(f.asarPath + '.bak'), false);
        assert.deepEqual(fs.readdirSync(f.stateDir), []);
    } finally {
        fs.renameSync = originalRename;
    }
});

test('backup fsync failure aborts before replacing live ASAR', t => {
    const f = fixture(t);
    const open = fs.openSync;
    const fsync = fs.fsyncSync;
    let backupFd = null;
    let rejected = 0;
    fs.openSync = (file, ...args) => {
        const fd = open(file, ...args);
        if (String(file).endsWith('official.bak')) backupFd = fd;
        return fd;
    };
    fs.fsyncSync = (fd) => {
        if (fd === backupFd) {
            rejected++;
            const error = new Error('Injected backup flush failure');
            error.code = 'EIO';
            throw error;
        }
        return fsync(fd);
    };
    try {
        assert.throws(() => f.run(), /Injected backup flush failure/);
        assert.equal(rejected, 1);
        assert.equal(f.read(), 'official-v1');
        assert.equal(fs.existsSync(f.asarPath + '.bak'), false);
        assert.deepEqual(fs.readdirSync(f.stateDir), []);
    } finally {
        fs.openSync = open;
        fs.fsyncSync = fsync;
    }
});

test('Windows backup flush handle failure is never silently ignored', { skip: process.platform !== 'win32' }, t => {
    const f = fixture(t);
    const open = fs.openSync;
    let rejected = 0;
    fs.openSync = (file, ...args) => {
        if (String(file).endsWith('official.bak') && args[0] === 'r+') {
            rejected++;
            const error = new Error('Injected Windows FlushFileBuffers handle denial');
            error.code = 'EPERM';
            throw error;
        }
        return open(file, ...args);
    };
    try {
        assert.throws(() => f.run(), /Injected Windows FlushFileBuffers handle denial/);
        assert.equal(rejected, 1);
        assert.equal(f.read(), 'official-v1');
        assert.equal(fs.existsSync(f.asarPath + '.bak'), false);
    } finally {
        fs.openSync = open;
    }
});

test('backup promotion must be read back and verified before touching the live ASAR', t => {
    const f = fixture(t);
    const rename = fs.renameSync;
    fs.renameSync = (source, destination) => {
        const result = rename(source, destination);
        if (destination === f.asarPath + '.bak') {
            fs.writeFileSync(destination, 'invalid-partial-backup');
        }
        return result;
    };
    try {
        assert.throws(() => f.run(), /官方 app\.asar 備份驗證失敗/);
        assert.equal(f.read(), 'official-v1');
        assert.equal(fs.readFileSync(f.asarPath + '.bak', 'utf8'), 'invalid-partial-backup');
    } finally {
        fs.renameSync = rename;
    }
});

test('failed atomic recovery retains ShipIt newest official ASAR for manual restoration', t => {
    const f = fixture(t);
    let exchanges = 0;
    assert.throws(() => f.run({ exchange(source, destination, previous) {
        if (++exchanges === 1) fs.writeFileSync(destination, 'official-v2-from-ShipIt');
        if (exchanges === 2) throw new Error('simulated denial during race recovery');
        return exchangeAsar(source, destination, previous);
    } }), /自動回復失敗/);
    assert.equal(exchanges, 2);
    assert.equal(f.read(), 'official-v1\n命令選擇區');
    const retained = fs.readdirSync(f.appInfo.appPath).find(n => n.startsWith('.autolocalize-'));
    assert.ok(retained, 'unresolved native race must retain its recovery staging directory');
    const retainedFile = process.platform === 'win32'
        ? path.join(f.appInfo.appPath, retained, 'previous.asar')
        : path.join(f.appInfo.appPath, retained, 'app.asar');
    assert.equal(fs.readFileSync(retainedFile, 'utf8'),
        'official-v2-from-ShipIt');
    const record = JSON.parse(fs.readFileSync(recoveryReceipt(f), 'utf8'));
    assert.equal(record.expectedLiveHash, digest('official-v1\n命令選擇區'));
    assert.equal(record.recoverHash, digest('official-v2-from-ShipIt'));
});

test('next scheduled run restores preserved ShipIt archive and reapplies localization', t => {
    const f = fixture(t);
    let exchanges = 0;
    assert.throws(() => f.run({ exchange(source, destination, previous) {
        if (++exchanges === 1) fs.writeFileSync(destination, 'official-v2-from-ShipIt');
        if (exchanges === 2) throw new Error('temporary recovery permission denial');
        return exchangeAsar(source, destination, previous);
    } }), /自動回復失敗/);
    assert.ok(fs.existsSync(recoveryReceipt(f)));
    assert.equal(f.read(), 'official-v1\n命令選擇區');
    assert.equal(f.run(), true);
    assert.equal(f.read(), 'official-v2-from-ShipIt\n命令選擇區');
    assert.equal(fs.readFileSync(f.asarPath + '.bak', 'utf8'), 'official-v2-from-ShipIt');
    assert.equal(fs.existsSync(recoveryReceipt(f)), false);
});

test('scheduled recovery retries after permission denial without rewriting the live ASAR', t => {
    const f = fixture(t);
    let exchanges = 0;
    assert.throws(() => f.run({
        sign() { throw Error('signing failed'); },
        exchange(source, destination, previous) {
            if (++exchanges === 2) throw Error('rollback failed');
            return exchangeAsar(source, destination, previous);
        }
    }), /signing failed/);
    const pending = recoveryReceipt(f);
    assert.ok(fs.existsSync(pending));
    const live = f.read();
    const builds = f.builds();
    assert.throws(() => f.run({ exchange() {
        const error = new Error('still denied');
        error.code = 'EPERM';
        throw error;
    } }), /still denied/);
    assert.equal(f.read(), live);
    assert.equal(f.builds(), builds);
    assert.ok(fs.existsSync(pending));
    assert.equal(f.run(), true);
    assert.equal(fs.existsSync(pending), false);
    assert.equal(f.read(), 'official-v1\n命令選擇區');
});

test('scheduled recovery refuses changed live ASAR and retains recovery evidence', t => {
    const f = fixture(t);
    let exchanges = 0;
    assert.throws(() => f.run({ exchange(source, destination, previous) {
        if (++exchanges === 1) fs.writeFileSync(destination, 'official-v2-from-ShipIt');
        if (exchanges === 2) throw Error('recovery blocked');
        return exchangeAsar(source, destination, previous);
    } }), /自動回復失敗/);
    const pending = recoveryReceipt(f);
    const builds = f.builds();
    fs.writeFileSync(f.asarPath, 'official-v3-from-ShipIt');
    assert.throws(() => f.run(), /正式 ASAR 已被其他程序更新/);
    assert.equal(f.read(), 'official-v3-from-ShipIt');
    assert.equal(f.builds(), builds);
    assert.ok(fs.existsSync(pending));
});

test('scheduled recovery refuses tampered recovery bytes', t => {
    const f = fixture(t);
    let exchanges = 0;
    assert.throws(() => f.run({ exchange(source, destination, previous) {
        if (++exchanges === 1) fs.writeFileSync(destination, 'official-v2-from-ShipIt');
        if (exchanges === 2) throw Error('recovery blocked');
        return exchangeAsar(source, destination, previous);
    } }), /自動回復失敗/);
    const record = JSON.parse(fs.readFileSync(recoveryReceipt(f), 'utf8'));
    fs.writeFileSync(path.join(f.stateDir, record.recoveryDir, 'previous-app.asar'), 'corrupted');
    const builds = f.builds();
    assert.throws(() => f.run(), /復原檔與原始 SHA-256 不符/);
    assert.equal(f.builds(), builds);
    assert.ok(fs.existsSync(recoveryReceipt(f)));
});

test('scheduled recovery holds when another ShipIt update cannot be restored', t => {
    const f = fixture(t);
    let exchanges = 0;
    assert.throws(() => f.run({ exchange(source, destination, previous) {
        if (++exchanges === 1) fs.writeFileSync(destination, 'official-v2-from-ShipIt');
        if (exchanges === 2) throw Error('initial recovery blocked');
        return exchangeAsar(source, destination, previous);
    } }), /自動回復失敗/);
    let restoreCalls = 0;
    assert.throws(() => f.run({ exchange(source, destination, previous) {
        if (++restoreCalls === 1) fs.writeFileSync(destination, 'official-v3-from-ShipIt');
        if (restoreCalls === 2) throw Error('newer recovery blocked');
        return exchangeAsar(source, destination, previous);
    } }), /自動回復失敗/);
    assert.equal(restoreCalls, 2);
    assert.equal(JSON.parse(fs.readFileSync(recoveryReceipt(f), 'utf8')).manualRequired, true);
    const live = f.read();
    const builds = f.builds();
    assert.throws(() => f.run(), /無法確認最新版/);
    assert.equal(f.read(), live);
    assert.equal(f.builds(), builds);
});

test('scheduled recovery recognizes an already restored official ASAR', t => {
    const f = fixture(t);
    let exchanges = 0;
    assert.throws(() => f.run({ exchange(source, destination, previous) {
        if (++exchanges === 1) fs.writeFileSync(destination, 'official-v2-from-ShipIt');
        if (exchanges === 2) throw Error('recovery blocked');
        return exchangeAsar(source, destination, previous);
    } }), /自動回復失敗/);
    const record = JSON.parse(fs.readFileSync(recoveryReceipt(f), 'utf8'));
    const saved = fs.readFileSync(path.join(f.stateDir, record.recoveryDir, 'previous-app.asar'));
    fs.writeFileSync(f.asarPath, saved);
    assert.equal(f.run(), true);
    assert.equal(fs.existsSync(recoveryReceipt(f)), false);
    assert.equal(f.read(), 'official-v2-from-ShipIt\n命令選擇區');
});

test('scheduled recovery skips a concurrent watcher and keeps the pending receipt', t => {
    const f = fixture(t);
    let exchanges = 0;
    assert.throws(() => f.run({ exchange(source, destination, previous) {
        if (++exchanges === 1) fs.writeFileSync(destination, 'official-v2-from-ShipIt');
        if (exchanges === 2) throw Error('recovery blocked');
        return exchangeAsar(source, destination, previous);
    } }), /自動回復失敗/);
    const release = acquireLock(path.join(f.stateDir, 'run.lock'));
    try {
        assert.equal(f.run(), false);
        assert.ok(fs.existsSync(recoveryReceipt(f)));
    } finally {
        release();
    }
});

test('ShipIt replace during signing rollback preserves current official ASAR', t => {
    const f = fixture(t);
    let exchanges = 0;
    assert.throws(() => f.run({
        sign() { throw new Error('simulated signing failure'); },
        exchange(source, destination, previous) {
            if (++exchanges === 2) fs.writeFileSync(destination, 'official-v3-from-ShipIt');
            return exchangeAsar(source, destination, previous);
        }
    }), /simulated signing failure/);
    assert.equal(exchanges, 3);
    assert.equal(f.read(), 'official-v3-from-ShipIt');
});

test('interrupted receipt update is safely reconciled on next isolated watcher run', t => {
    const f = fixture(t);
    const idempotentBuild = stage => {
        const archive = path.join(stage, 'app.asar');
        if (!fs.readFileSync(archive, 'utf8').includes('命令選擇區')) {
            fs.appendFileSync(archive, '\n命令選擇區');
        }
    };
    assert.equal(f.run({ build: idempotentBuild }), true);
    const modified = f.read();
    const receipt = path.join(f.stateDir, digest(f.appInfo.appPath) + '.json');
    fs.rmSync(receipt);
    assert.equal(f.run({ build: idempotentBuild }), true);
    assert.equal(f.read(), modified);
    assert.equal(fs.readFileSync(f.asarPath + '.bak', 'utf8'), 'official-v1');
    assert.equal(JSON.parse(fs.readFileSync(receipt, 'utf8')).output,
        digest(fs.readFileSync(f.asarPath)));
});

test('update during signing is never overwritten by rollback', t => {
    const f = fixture(t);
    assert.throws(() => f.run({ sign() {
        fs.writeFileSync(f.asarPath, 'official-v3');
        throw Error('sign failed after update');
    } }));
    assert.equal(f.read(), 'official-v3');
});

test('unpacked resources reach the isolated builder', t => {
    const f = fixture(t);
    fs.mkdirSync(f.asarPath + '.unpacked');
    fs.writeFileSync(path.join(f.asarPath + '.unpacked', 'resource.txt'), 'resource');
    f.run({ build(stage) {
        assert.equal(fs.readFileSync(path.join(stage, 'app.asar.unpacked', 'resource.txt'), 'utf8'), 'resource');
        f.options.build(stage);
    } });
});

test('active lock skips duplicate execution; stale lock is reclaimed', t => {
    const f = fixture(t);
    fs.mkdirSync(f.stateDir);
    const lock = path.join(f.stateDir, 'run.lock');
    const release = acquireLock(lock);
    assert.equal(f.run(), false);
    assert.equal(f.builds(), 0);
    release();
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, 'pid'), '2147483647');
    assert.equal(f.run(), true);
});

test('rejects live and dangling backup symlinks', { skip: process.platform === 'win32' }, t => {
    const f = fixture(t);
    fs.symlinkSync(path.join(f.appInfo.appPath, 'missing'), f.asarPath + '.bak');
    assert.throws(() => f.run(), /非一般檔案/);
    assert.equal(f.read(), 'official-v1');
});

test('stable file debounce requires nonzero size', t => {
    const f = fixture(t);
    waitForStableFile(f.asarPath, { interval: 1, timeout: 500, samples: 3 });
    fs.writeFileSync(f.asarPath, '');
    assert.throws(() => waitForStableFile(f.asarPath, { interval: 1, timeout: 5 }), /尚未穩定/);
});

test('safeReplaceFile falls back to copyFileSync and unlinks src when renameSync throws EPERM/EXDEV/EACCES', t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-replace-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const src = path.join(root, 'src.txt');
    const dst = path.join(root, 'dst.txt');

    const origRename = fs.renameSync;
    for (const code of ['EPERM', 'EXDEV', 'EACCES']) {
        fs.writeFileSync(src, `content-for-${code}`);
        fs.writeFileSync(dst, 'old-content');
        let renameAttempted = false;
        fs.renameSync = () => {
            renameAttempted = true;
            const err = new Error(`Simulated ${code}`);
            err.code = code;
            throw err;
        };
        try {
            safeReplaceFile(src, dst, 0o644);
            assert.equal(renameAttempted, true);
            assert.equal(fs.readFileSync(dst, 'utf8'), `content-for-${code}`);
            assert.equal(fs.existsSync(src), false);
        } finally {
            fs.renameSync = origRename;
        }
    }
});

test('safeReplaceFile rethrows unexpected errors', t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-replace-err-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const src = path.join(root, 'src.txt');
    const dst = path.join(root, 'dst.txt');
    fs.writeFileSync(src, 'content');

    const origRename = fs.renameSync;
    fs.renameSync = () => {
        const err = new Error('Disk full');
        err.code = 'ENOSPC';
        throw err;
    };
    try {
        assert.throws(() => safeReplaceFile(src, dst), /Disk full/);
    } finally {
        fs.renameSync = origRename;
    }
});

test('ensureAccessibleDir creates directory recursively and ensures accessible mode', t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-dir-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const targetDir = path.join(root, 'nested', 'deep', 'dir');
    ensureAccessibleDir(targetDir);
    assert.equal(fs.existsSync(targetDir), true);
    const stat = fs.statSync(targetDir);
    assert.equal(stat.isDirectory(), true);
    if (process.platform !== 'win32') {
        assert.ok((stat.mode & 0o755) === 0o755);
        // Test upgrading existing restrictive directory
        const restrictive = path.join(root, 'restrictive');
        fs.mkdirSync(restrictive, { mode: 0o700 });
        fs.chmodSync(restrictive, 0o700);
        ensureAccessibleDir(restrictive);
        const updatedStat = fs.statSync(restrictive);
        assert.equal(updatedStat.mode & 0o777, 0o755);
    }
});

test('recipeHash incorporates package.json changes', t => {
    const hash1 = recipeHash();
    assert.equal(typeof hash1, 'string');
    assert.equal(hash1.length, 64);
});

test('safeReplaceFile falls back to in-place write when copyFileSync throws EPERM', t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-replace-eperm-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const src = path.join(root, 'src.txt');
    const dst = path.join(root, 'dst.txt');
    fs.writeFileSync(src, 'new-data');
    fs.writeFileSync(dst, 'old-data');

    const origRename = fs.renameSync;
    const origCopy = fs.copyFileSync;
    let renameFailed = false;
    let copyAttempt = 0;
    fs.renameSync = () => {
        renameFailed = true;
        const err = new Error('Rename EPERM');
        err.code = 'EPERM';
        throw err;
    };
    fs.copyFileSync = (s, d) => {
        copyAttempt++;
        const err = new Error('Copy EPERM');
        err.code = 'EPERM';
        throw err;
    };
    try {
        safeReplaceFile(src, dst, 0o644);
        assert.equal(renameFailed, true);
        assert.equal(copyAttempt, 1);
        assert.equal(fs.readFileSync(dst, 'utf8'), 'new-data');
        assert.equal(fs.existsSync(src), false);
    } finally {
        fs.renameSync = origRename;
        fs.copyFileSync = origCopy;
    }
});

test('acquireLock recovers and reclaims stale lock with restrictive directory permissions', t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-lock-perm-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const lockDir = path.join(root, 'test.lock');
    fs.mkdirSync(lockDir, { mode: 0o700 });
    fs.writeFileSync(path.join(lockDir, 'pid'), '999999999');
    const release = acquireLock(lockDir);
    assert.notEqual(release, null);
    release();
    assert.equal(fs.existsSync(lockDir), false);
});


