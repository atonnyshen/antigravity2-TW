'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { checkAndLocalizeApp, exchangeAsar, waitForStableFile, acquireLock, digest, safeReplaceFile, ensureAccessibleDir, recipeHash, rotateLogs, setOwnerNoFollow, forEachChildNoFollow, cleanStaleStageDirs, cleanElectronCache, writeStateFile, replacementBase, exchangeInResources, signApp } = require('../auto_localize_watcher');
const runLock = require('../src/run_lock');
const { acquireWatcherLockSync } = require('../localization_engine');

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

test('watcher removes .autolocalize temp dirs from appPath before sign runs', t => {
    const f = fixture(t);
    const seenTempDirs = [];
    const ran = f.run({
        sign(appPath) {
            seenTempDirs.push(fs.readdirSync(appPath).filter(n => n.startsWith('.autolocalize-')));
        }
    });
    assert.equal(ran, true);
    assert.deepEqual(seenTempDirs, [[]]);

    // Also verify rollback sign pass sees zero .autolocalize temp dirs
    fs.writeFileSync(f.asarPath, 'official-v2');
    const rollbackSeen = [];
    let calls = 0;
    assert.throws(() => f.run({
        sign(appPath) {
            rollbackSeen.push(fs.readdirSync(appPath).filter(n => n.startsWith('.autolocalize-')));
            if (++calls === 1) throw Error('sign denied');
        }
    }), /sign denied/);
    assert.deepEqual(rollbackSeen, [[], []]);
});

test('rotateLogs keeps one previous log once the size limit is exceeded and leaves small logs alone', t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-watcher-log-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const big = path.join(root, 'big.log');
    const small = path.join(root, 'small.log');
    fs.writeFileSync(big + '.1', 'older rotation');
    fs.writeFileSync(big, 'x'.repeat(64));
    fs.writeFileSync(small, 'ok');
    rotateLogs([big, small, path.join(root, 'missing.log')], 32);
    assert.equal(fs.existsSync(big), false);
    assert.equal(fs.readFileSync(big + '.1', 'utf8'), 'x'.repeat(64));
    assert.equal(fs.readFileSync(small, 'utf8'), 'ok');
    assert.equal(fs.existsSync(small + '.1'), false);
});

test('rotateLogs re-checks the size under a lock, so a run that saw a stale size cannot rename a freshly recreated log over the previous one', t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-watcher-race-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const log = path.join(root, 'race.log');
    // 另一個程序剛完成輪替：.1 是完整的舊日誌，原位置是重建後的小日誌
    fs.writeFileSync(log + '.1', 'x'.repeat(64));
    fs.writeFileSync(log, 'fresh');
    // 這個程序在對方輪替前就看到超限：第一次 stat 回報舊的大小
    const realStat = fs.statSync;
    let stale = true;
    t.mock.method(fs, 'statSync', function (target, ...rest) {
        if (stale && target === log) { stale = false; return { size: 64 }; }
        return realStat.call(this, target, ...rest);
    });
    rotateLogs([log], 32);
    t.mock.restoreAll();
    assert.equal(fs.readFileSync(log + '.1', 'utf8'), 'x'.repeat(64));
    assert.equal(fs.readFileSync(log, 'utf8'), 'fresh');
    assert.equal(fs.existsSync(log + '.rotate.lock'), false);
});

test('a v3.8.0 lock (pid only, no heartbeat) whose PID is alive is honoured for up to two hours, then reclaimed with a digits-only pid file', t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-lock-legacy-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const lockDir = path.join(root, 'run.lock');
    fs.mkdirSync(lockDir);
    // v3.8.0 的守護程式或安裝器持有中：只有純數字的 pid 檔、不會心跳。用本測試程序的編號模擬「程序存在」
    fs.writeFileSync(path.join(lockDir, 'pid'), String(process.pid));
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    fs.utimesSync(lockDir, hourAgo, hourAgo);
    assert.equal(acquireLock(lockDir), null, '舊版持有者停留一小時（例如慢速下載）仍視為持有中');
    assert.equal(acquireWatcherLockSync(lockDir, 0), null, '安裝器同樣不得接手');
    // 超過兩小時：視為殘留（持有者當掉、程序編號被重用）並回收
    const longAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    fs.utimesSync(lockDir, longAgo, longAgo);
    const release = acquireLock(lockDir);
    assert.equal(typeof release, 'function');
    assert.equal(fs.readFileSync(path.join(lockDir, 'pid'), 'utf8'), String(process.pid), 'pid 檔維持純數字，舊版程式也讀得懂');
    release();
    assert.equal(fs.existsSync(lockDir), false);
});

test('the watcher and the installer honour each other\'s lock, and a heartbeat keeps a long hold (slow download) from being reclaimed', async t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-lock-shared-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const lockDir = path.join(root, 'run.lock');
    const watcherRelease = acquireLock(lockDir, undefined, undefined, { heartbeatMs: 25, staleMs: 200 });
    assert.equal(typeof watcherRelease, 'function');
    assert.match(fs.readFileSync(path.join(lockDir, 'pid'), 'utf8'), /^\d+$/);
    assert.equal(acquireWatcherLockSync(lockDir, 0), null, '安裝器讀得懂守護程式的鎖，不會當成殘留刪掉');
    // 已持有很久（例如以 512 B/s 下載翻譯包）：鎖目錄與心跳時間都過舊，心跳繼續更新後仍視為持有中
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    fs.utimesSync(lockDir, longAgo, longAgo);
    fs.utimesSync(path.join(lockDir, 'token'), longAgo, longAgo);
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(acquireLock(lockDir, undefined, undefined, { staleMs: 200 }), null, '心跳持續：不因持有時間長而被回收');
    watcherRelease();
    assert.equal(fs.existsSync(lockDir), false);
    const installerRelease = acquireWatcherLockSync(lockDir, 0);
    assert.equal(typeof installerRelease, 'function');
    assert.equal(acquireLock(lockDir), null, '安裝器持有中：守護程式不得取得');
    installerRelease();
    assert.equal(fs.existsSync(lockDir), false);
});

test('a lock whose heartbeat stopped is reclaimed even when its PID is alive, and the old holder neither keeps nor removes the new lock', t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-lock-reuse-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const lockDir = path.join(root, 'run.lock');
    const first = acquireLock(lockDir, undefined, undefined, { heartbeatMs: 0 });
    assert.equal(acquireLock(lockDir), null, '心跳未逾時、程序存在：鎖仍有效');
    // 同步工作或系統睡眠期間心跳暫停：不滿 30 分鐘仍視為持有中
    const paused = new Date(Date.now() - 29 * 60 * 1000);
    fs.utimesSync(path.join(lockDir, 'token'), paused, paused);
    assert.equal(acquireLock(lockDir), null, '心跳暫停 29 分鐘：仍未逾時');
    assert.equal(first.held(), true);
    // 持有者卡住，或當掉後程序編號被重用：心跳停了超過 30 分鐘
    const past = new Date(Date.now() - 31 * 60 * 1000);
    fs.utimesSync(path.join(lockDir, 'token'), past, past);
    const second = acquireLock(lockDir);
    assert.equal(typeof second, 'function', '心跳停止超過上限：回收');
    assert.equal(first.held(), false, '原持有者察覺得到鎖已被接手（替換正式檔案前會確認）');
    first();
    assert.equal(second.held(), true, '原持有者釋放時不得刪掉接手者的鎖');
    second();
    assert.equal(fs.existsSync(lockDir), false);
});

test('a holder whose lock was taken over releases late without moving the new lock, so no third process can slip in', t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-lock-late-release-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const lockDir = path.join(root, 'run.lock');
    const first = runLock.acquire(lockDir, { heartbeatMs: 0 });
    const past = new Date(Date.now() - 31 * 60 * 1000);
    fs.utimesSync(path.join(lockDir, 'token'), past, past);
    const second = runLock.acquire(lockDir, { heartbeatMs: 0 });
    assert.equal(typeof second, 'function');
    // 舊持有者這時才釋放：若先把接手者的鎖移開再比對，移開的空檔裡第三個程序就能取得鎖
    const rename = fs.renameSync;
    t.after(() => { fs.renameSync = rename; });
    let third = null;
    fs.renameSync = (from, to) => {
        rename(from, to);
        if (from === lockDir && third === null) third = runLock.acquire(lockDir, { heartbeatMs: 0 });
    };
    first();
    fs.renameSync = rename;
    assert.equal(third, null, '舊持有者釋放時不得移動接手者的鎖');
    assert.equal(second.held(), true);
    second();
    assert.equal(fs.existsSync(lockDir), false);
});

test('reclaiming a stale lock never deletes a newer lock that another process created in the meantime', t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-lock-race-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const lockDir = path.join(root, 'run.lock');
    // 程序 B 核對過殘留鎖 L0 後暫停；程序 A 此時回收 L0 並建立新鎖 L1
    const newer = acquireLock(lockDir, undefined, undefined, { heartbeatMs: 0 });
    const tokenBefore = fs.readFileSync(path.join(lockDir, 'token'), 'utf8');
    // B 恢復，照它看到的 L0 去回收：移開後發現不是 L0，必須原樣放回
    assert.equal(runLock.removeIfMatches(lockDir, current => current.token === 'stale-L0'), false);
    assert.equal(fs.readFileSync(path.join(lockDir, 'token'), 'utf8'), tokenBefore);
    assert.equal(newer.held(), true);
    assert.deepEqual(fs.readdirSync(root).filter(name => name !== 'run.lock'), [], '不留下移開用的暫存目錄');
    newer();
});

test('two reclaimers racing over the same stale lock never leave two holders, even when a third process grabs the lock in between', t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-lock-two-reclaimers-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const lockDir = path.join(root, 'run.lock');
    // 殘留鎖 L0：持有程序已結束（以不存在的程序編號模擬）
    const deadPid = 2147483000;
    fs.mkdirSync(lockDir);
    fs.writeFileSync(path.join(lockDir, 'pid'), String(deadPid));
    fs.writeFileSync(path.join(lockDir, 'token'), 'stale-L0');
    const kill = process.kill;
    const rename = fs.renameSync;
    t.after(() => { process.kill = kill; fs.renameSync = rename; });
    const holders = {};
    const attempt = name => { holders[name] = runLock.acquire(lockDir, { heartbeatMs: 0 }); };
    // 回收者 B 確認 L0 的持有程序已結束之後暫停；回收者 A 這時完成回收並建立新鎖 L1
    let paused = false;
    process.kill = (pid, signal) => {
        if (pid === deadPid) {
            if (!paused) { paused = true; attempt('A'); }
            const error = new Error('kill ESRCH');
            error.code = 'ESRCH';
            throw error;
        }
        return kill.call(process, pid, signal);
    };
    // B 恢復後若照它看到的 L0 去回收、把 L1 移開，第三個程序 C 就在空檔取得鎖
    fs.renameSync = (from, to) => {
        rename(from, to);
        if (from === lockDir && holders.A && !('C' in holders)) attempt('C');
    };
    attempt('B');
    if (!('C' in holders)) attempt('C');
    process.kill = kill;
    fs.renameSync = rename;
    assert.equal(typeof holders.A, 'function', 'A 回收殘留鎖後取得新鎖');
    assert.deepEqual(Object.keys(holders).filter(name => holders[name]), ['A'], '同一時間只能有一個程序取得鎖');
    assert.equal(holders.A.held(), true, 'A 的鎖不得被 B 刪掉');
    holders.A();
    assert.deepEqual(fs.readdirSync(root), [], '釋放後不留下鎖、guard 或移開用的暫存目錄');
});

test('a guard left by a process killed mid-removal blocks removal briefly, then is cleared so the stale lock can still be reclaimed', t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-lock-guard-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const lockDir = path.join(root, 'run.lock');
    fs.mkdirSync(lockDir);
    fs.writeFileSync(path.join(lockDir, 'token'), 'stale-L0');
    const past = new Date(Date.now() - 31 * 60 * 1000);
    fs.utimesSync(path.join(lockDir, 'token'), past, past);
    fs.writeFileSync(path.join(lockDir, 'pid'), String(process.pid));
    fs.mkdirSync(lockDir + '.guard');
    // 另一個程序正在 guard 內：不刪，等不到就放棄
    assert.equal(runLock.removeIfMatches(lockDir, () => true), false);
    assert.equal(fs.existsSync(lockDir), true);
    // guard 停留超過上限：持有者在刪除途中被強制結束，清掉 guard 後照常回收
    const longAgo = new Date(Date.now() - runLock.GUARD_STALE_MS - 1000);
    fs.utimesSync(lockDir + '.guard', longAgo, longAgo);
    const release = runLock.acquire(lockDir, { heartbeatMs: 0 });
    assert.equal(typeof release, 'function');
    release();
    assert.deepEqual(fs.readdirSync(root), []);
});

test('root handing a lock to the user never writes the lock files through a lock directory swapped for a link', { skip: process.platform === 'win32' }, t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-lock-swap-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const lockDir = path.join(root, 'run.lock');
    // victim：root 擁有的系統目錄（例如 /etc/paths.d）；使用者在鎖目錄建立後立刻把它換成指向 victim 的連結
    const victim = path.join(root, 'victim');
    fs.mkdirSync(victim);
    const mkdir = fs.mkdirSync;
    t.after(() => { fs.mkdirSync = mkdir; });
    fs.mkdirSync = (target, ...rest) => {
        const result = mkdir(target, ...rest);
        if (target === lockDir) {
            fs.renameSync(lockDir, lockDir + '.moved');
            fs.symlinkSync(victim, lockDir);
        }
        return result;
    };
    const owner = { uid: process.getuid(), gid: process.getgid() };
    const release = runLock.acquire(lockDir, { heartbeatMs: 0, owner });
    fs.mkdirSync = mkdir;
    assert.equal(release, null, '鎖目錄已被換掉：不算取得鎖');
    assert.deepEqual(fs.readdirSync(victim), [], '不得在連結指向的目錄裡建立 pid、token');
});

test('ownership changes never follow links: symlinks and hard links are skipped, and a directory swapped for a link mid-way still resolves inside the original directory', { skip: process.platform === 'win32' }, t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-nofollow-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    // owned：使用者可寫的目錄（.watcher-state、App 的 _CodeSignature）；runtime：不可交給使用者的 root 執行目錄
    const owned = path.join(root, 'owned');
    const runtime = path.join(root, 'runtime');
    fs.mkdirSync(owned);
    fs.mkdirSync(runtime);
    const moduleFile = path.join(runtime, 'auto_localize_watcher.js');
    fs.writeFileSync(moduleFile, '//');
    fs.chmodSync(moduleFile, 0o644);
    fs.symlinkSync(moduleFile, path.join(owned, 'link.js'));
    fs.linkSync(moduleFile, path.join(owned, 'hard.js'));
    assert.equal(setOwnerNoFollow(path.join(owned, 'link.js'), { mode: 0o666 }), false, '連結本身：略過');
    assert.equal(setOwnerNoFollow(path.join(owned, 'hard.js'), { mode: 0o666 }), false, '硬連結：略過');
    assert.equal(fs.statSync(moduleFile).mode & 0o777, 0o644);
    fs.unlinkSync(path.join(owned, 'link.js'));
    fs.unlinkSync(path.join(owned, 'hard.js'));
    fs.writeFileSync(path.join(owned, 'CodeResources'), 'sig');
    fs.chmodSync(path.join(owned, 'CodeResources'), 0o644);
    fs.writeFileSync(path.join(runtime, 'CodeResources'), 'runtime');
    fs.chmodSync(path.join(runtime, 'CodeResources'), 0o644);
    // 逐項處理途中，目錄被換成指向執行目錄的連結
    const cwd = process.cwd();
    let swapped = false;
    const ok = forEachChildNoFollow(owned, name => {
        if (!swapped) {
            fs.renameSync(owned, owned + '.orig');
            fs.symlinkSync(runtime, owned);
            swapped = true;
        }
        setOwnerNoFollow(name, { mode: 0o600 });
    });
    assert.equal(ok, true);
    assert.equal(process.cwd(), cwd, '處理完恢復原本的工作目錄');
    assert.equal(fs.statSync(path.join(owned + '.orig', 'CodeResources')).mode & 0o777, 0o600, '原目錄裡的檔案照常處理');
    assert.equal(fs.statSync(path.join(runtime, 'CodeResources')).mode & 0o777, 0o644, '連結指向的目錄不受影響');
    assert.equal(forEachChildNoFollow(owned, () => assert.fail('不得進入連結指向的目錄')), false);
});

test('rotateLogs still rotates when a crashed run left the rotation lock behind and its PID was reused', t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-watcher-stale-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const log = path.join(root, 'stale.log');
    fs.writeFileSync(log, 'x'.repeat(64));
    const lockDir = log + '.rotate.lock';
    fs.mkdirSync(lockDir);
    fs.writeFileSync(path.join(lockDir, 'pid'), String(process.pid));
    fs.writeFileSync(path.join(lockDir, 'token'), 'crashed-run');
    // 輪替鎖的心跳上限是一分鐘：持有者兩分鐘前就停了
    const past = new Date(Date.now() - 2 * 60 * 1000);
    fs.utimesSync(path.join(lockDir, 'token'), past, past);
    fs.utimesSync(lockDir, past, past);
    rotateLogs([log], 32);
    assert.equal(fs.readFileSync(log + '.1', 'utf8'), 'x'.repeat(64));
    assert.equal(fs.existsSync(lockDir), false);
});

test('the state receipt is written through a fresh temporary file, never through a link planted at the old fixed temporary name', { skip: process.platform === 'win32' }, t => {
    const f = fixture(t);
    fs.mkdirSync(f.stateDir, { recursive: true });
    const victim = path.join(path.dirname(f.stateDir), 'victim.conf');
    fs.writeFileSync(victim, 'system');
    const statePath = path.join(f.stateDir, digest(f.appInfo.appPath) + '.json');
    // v3.8.1 與更早版本固定寫入 <雜湊>.json.tmp：預先放好的同名連結會讓 root 改寫連結指向的檔案
    fs.symlinkSync(victim, statePath + '.tmp');
    assert.equal(f.run(), true);
    assert.equal(fs.readFileSync(victim, 'utf8'), 'system', '連結指向的檔案不得被改寫');
    assert.equal(fs.lstatSync(statePath).isFile(), true, '收據是一般檔案');
    assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).output, digest(fs.readFileSync(f.asarPath)));
});

test('as root, a state directory inside a root-owned runtime stays with root and is taken back from the app owner', { skip: process.platform === 'win32' }, t => {
    // 以目前使用者模擬 root：執行目錄屬於目前程序，App 的擁有者是另一個使用者
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-root-state-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const stateDir = path.join(root, '.watcher-state');
    fs.mkdirSync(stateDir, { mode: 0o700 });
    const receipt = path.join(stateDir, 'receipt.json');
    fs.writeFileSync(receipt, '{}');
    fs.chmodSync(receipt, 0o666);
    const appOwner = { uid: process.getuid() + 1, gid: process.getgid() + 1 };
    const calls = [];
    const fchown = fs.fchownSync;
    fs.fchownSync = (fd, uid, gid) => { calls.push(uid); return fchown(fd, uid, gid); };
    t.after(() => { fs.fchownSync = fchown; });
    ensureAccessibleDir(stateDir, appOwner.uid, appOwner.gid, { asRoot: true });
    writeStateFile(stateDir, path.join(stateDir, 'state.json'), { ok: true }, appOwner.uid, appOwner.gid, { asRoot: true });
    fs.fchownSync = fchown;
    assert.ok(calls.length > 0, '收回目錄與第一層項目的擁有者');
    assert.deepEqual([...new Set(calls)], [process.getuid()], '不得交給 App 的擁有者');
    assert.equal(fs.statSync(stateDir).mode & 0o777, 0o755);
    assert.equal(fs.statSync(receipt).mode & 0o777, 0o644, '收回時移除其他人的寫入權限');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(stateDir, 'state.json'), 'utf8')), { ok: true });
});

test('as root, replacement files are staged in the root-owned state directory, not in the app\'s user-owned Resources', { skip: process.platform === 'win32' }, t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-root-base-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const resources = path.join(root, 'Resources');
    const stateDir = path.join(root, 'state');
    fs.mkdirSync(resources);
    fs.mkdirSync(stateDir, { mode: 0o755 });
    fs.chmodSync(stateDir, 0o755);
    const asarPath = path.join(resources, 'app.asar');
    assert.equal(replacementBase(asarPath, stateDir, { asRoot: true }), stateDir);
    assert.equal(replacementBase(asarPath, stateDir, { asRoot: false }), resources, '一般使用者照舊使用 Resources');
    fs.chmodSync(stateDir, 0o777);
    assert.equal(replacementBase(asarPath, stateDir, { asRoot: true }), resources, '狀態目錄可被其他人寫入時不使用');
});

test('as root, the backup and the live archive are moved only inside the Resources directory checked at the start, even after the app folder is swapped for a link', { skip: process.platform === 'win32' }, t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-root-resources-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const app = path.join(root, 'App');
    const resources = path.join(app, 'Resources');
    const otherResources = path.join(root, 'Other', 'Resources');
    fs.mkdirSync(resources, { recursive: true });
    fs.mkdirSync(otherResources, { recursive: true });
    const asarPath = path.join(resources, 'app.asar');
    fs.writeFileSync(asarPath, 'official');
    fs.writeFileSync(path.join(otherResources, 'app.asar'), 'other-app');
    const resourcesStat = fs.statSync(resources);
    const candidate = path.join(root, 'candidate.asar');
    const backup = path.join(root, 'official.bak');
    fs.writeFileSync(candidate, 'translated');
    fs.writeFileSync(backup, 'official');
    // 核對之後，App 被換成指向另一個 App 的連結
    fs.renameSync(app, app + '.orig');
    fs.symlinkSync(path.join(root, 'Other'), app);
    const cwd = process.cwd();
    assert.throws(() => safeReplaceFile(backup, asarPath + '.bak', 0o644, null, null,
        { atomicRequired: true, expectedDir: resourcesStat }), { code: 'ELOCKMOVED' });
    const swap = exchangeInResources(exchangeAsar, asarPath, resourcesStat);
    assert.throws(() => swap(candidate, asarPath, path.join(root, 'previous.asar')), { code: 'ELOCKMOVED' });
    assert.equal(process.cwd(), cwd);
    assert.deepEqual(fs.readdirSync(otherResources), ['app.asar'], '不得把備份搬進另一個 App');
    assert.equal(fs.readFileSync(path.join(otherResources, 'app.asar'), 'utf8'), 'other-app', '不得換掉另一個 App 的檔案');
    // 沒有被換掉時照常在原目錄完成
    fs.unlinkSync(app);
    fs.renameSync(app + '.orig', app);
    safeReplaceFile(backup, asarPath + '.bak', 0o644, null, null, { atomicRequired: true, expectedDir: resourcesStat });
    assert.equal(swap(candidate, asarPath, path.join(root, 'previous.asar')), candidate);
    assert.equal(fs.readFileSync(asarPath, 'utf8'), 'translated');
    assert.equal(fs.readFileSync(asarPath + '.bak', 'utf8'), 'official');
    assert.equal(fs.readFileSync(candidate, 'utf8'), 'official');
    assert.equal(process.cwd(), cwd);
});

test('as root, Electron caches in the app owner\'s home are deleted as that user, not as root', { skip: process.platform === 'win32' }, t => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-root-cache-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    // 舊版忽略指定的位置、改用家目錄：把 HOME 指到暫存目錄，避免動到本機真正的快取
    const home = process.env.HOME;
    process.env.HOME = path.join(root, 'home');
    t.after(() => { process.env.HOME = home; });
    const support = path.join(root, 'Antigravity');
    fs.mkdirSync(path.join(support, 'Cache'), { recursive: true });
    fs.mkdirSync(path.join(support, 'Partitions', 'hub-browser-1', 'GPUCache'), { recursive: true });
    const self = { uid: process.getuid(), gid: process.getgid() };
    if (self.uid !== 0) {
        // 一般使用者無法切換成其他身分：刪除改以指定的身分執行，所以這次刪不掉
        cleanElectronCache(null, null, { appSupportDirs: [support], asUser: { uid: self.uid + 1, gid: self.gid } });
        assert.equal(fs.existsSync(path.join(support, 'Cache')), true, '不是以目前程序的身分刪除');
    }
    cleanElectronCache(null, null, { appSupportDirs: [support], asUser: self });
    assert.equal(fs.existsSync(path.join(support, 'Cache')), false);
    assert.equal(fs.existsSync(path.join(support, 'Partitions', 'hub-browser-1', 'GPUCache')), false);
    assert.equal(fs.existsSync(path.join(support, 'Partitions', 'hub-browser-1')), true, '只刪快取目錄');
});

test('stage directories left by a killed watcher are cleared on the next run, while stages that may still be in use are kept', { skip: process.platform === 'win32' }, t => {
    const f = fixture(t);
    fs.mkdirSync(f.stateDir, { recursive: true });
    const hours = n => new Date(Date.now() - n * 60 * 60 * 1000);
    const stage = (name, age, content = 'app') => {
        const dir = path.join(f.stateDir, name);
        fs.mkdirSync(dir);
        fs.writeFileSync(path.join(dir, 'app.asar'), content);
        if (age) fs.utimesSync(dir, hours(age), hours(age));
        return dir;
    };
    stage('stage-BQ1sZu', 2);                         // v3.8.1 命名、兩小時前中斷：清除
    stage('stage-Ab12Cd', 0);                         // v3.8.1 命名、剛建立，可能是升級當下仍在執行的舊版：保留
    stage('stage-2147483000-Zz9Yy8', 0);              // 建立者已結束：清除
    stage(`stage-${process.ppid}-Qq1Ww2`, 0);         // 建立者仍在執行：保留
    stage(`stage-${process.ppid}-Rr7Tt8`, 25);        // 程序編號可能已被重用、超過一天：清除
    const recovery = stage('recovery-Kk3Jj4', 48);    // 復原副本不是暫存目錄：保留
    const outside = path.join(path.dirname(f.stateDir), 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'keep'), 'keep');
    fs.symlinkSync(outside, path.join(f.stateDir, 'stage-Ln5Mm6'));   // 連結：不碰
    assert.equal(f.run(), true);
    assert.deepEqual(fs.readdirSync(f.stateDir).filter(name => name.startsWith('stage-')).sort(),
        ['stage-Ab12Cd', 'stage-Ln5Mm6', `stage-${process.ppid}-Qq1Ww2`].sort());
    assert.equal(fs.existsSync(recovery), true);
    assert.equal(fs.readFileSync(path.join(outside, 'keep'), 'utf8'), 'keep');
    // 本輪自己的暫存目錄帶有程序編號，完成後照常刪除
    assert.deepEqual(cleanStaleStageDirs(f.stateDir), []);
});

// v3.8.2：root 守護程式的簽章改以 App 擁有者的身分執行。asRoot 以目前使用者模擬 root 的分支，exec 記錄呼叫而不實際簽章
function signFixture(t, prefix) {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const app = path.join(root, 'Antigravity.app');
    fs.mkdirSync(path.join(app, 'Contents', 'Resources'), { recursive: true });
    return { root, app };
}

function quarantined(file) {
    return spawnSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', file]).status === 0;
}

test('as root, signApp runs xattr and codesign as the App owner from inside the App directory', { skip: process.platform !== 'darwin' }, t => {
    const { app } = signFixture(t, 'ag-sign-owner-');
    const calls = [];
    const exec = (file, args, options) => {
        calls.push({ argv: [file, ...args], uid: options.uid, gid: options.gid, cwd: process.cwd() });
        return '';
    };
    signApp(app, null, { asRoot: true, exec, appStat: fs.lstatSync(app) });
    assert.deepEqual(calls.map(c => c.argv), [
        ['/usr/bin/xattr', '-d', '-r', '-s', 'com.apple.quarantine', '.'],
        ['/usr/bin/codesign', '--force', '--deep', '--sign', '-', '.'],
        ['/usr/bin/codesign', '--verify', '--deep', '--strict', '.']
    ]);
    const uid = fs.statSync(app).uid;
    const gid = Number(execFileSync('/usr/bin/id', ['-g', String(uid)], { encoding: 'utf8' }).trim());
    for (const c of calls) {
        assert.equal(c.cwd, app, '在記下的 App 資料夾裡執行');
        assert.deepEqual({ uid: c.uid, gid: c.gid }, { uid, gid }, '以 App 擁有者的帳號與主要群組執行，不以 root 執行');
    }
});

test('as root, signApp refuses an App directory swapped after it was recorded and leaves the replacement untouched', { skip: process.platform !== 'darwin' }, t => {
    const { app } = signFixture(t, 'ag-sign-swap-');
    const appStat = fs.lstatSync(app);
    // 記下之後，App 資料夾被搬走，原位置換成另一個資料夾
    fs.renameSync(app, app + '.orig');
    fs.mkdirSync(path.join(app, 'Contents'), { recursive: true });
    const marker = path.join(app, 'Contents', 'marker.txt');
    fs.writeFileSync(marker, 'x');
    execFileSync('/usr/bin/xattr', ['-w', 'com.apple.quarantine', '0081;00000000;test;', marker]);
    const calls = [];
    assert.throws(() => signApp(app, null, { asRoot: true, appStat, exec: (file, args) => { calls.push([file, ...args]); return ''; } }));
    assert.deepEqual(calls, [], '不對換進來的資料夾執行 xattr 或 codesign');
    assert.equal(quarantined(marker), true, '換進來的資料夾保持原狀');
});

test('signApp clears quarantine without following links inside the App to files outside it', { skip: process.platform !== 'darwin' }, t => {
    const { root, app } = signFixture(t, 'ag-sign-xattr-');
    const outside = path.join(root, 'outside.txt');
    const inside = path.join(app, 'Contents', 'Resources', 'inside.txt');
    for (const file of [outside, inside]) {
        fs.writeFileSync(file, 'x');
        execFileSync('/usr/bin/xattr', ['-w', 'com.apple.quarantine', '0081;00000000;test;', file]);
    }
    fs.symlinkSync(outside, path.join(app, 'Contents', 'Resources', 'link.txt'));
    // xattr 實際執行，codesign 略過
    const exec = (file, args, options) => (file === '/usr/bin/xattr' ? execFileSync(file, args, options) : '');
    try { signApp(app, null, { asRoot: false, exec }); } catch {}
    assert.equal(quarantined(inside), false, 'App 裡的檔案清除隔離屬性');
    assert.equal(quarantined(outside), true, '套件外的檔案保留隔離屬性');
});
