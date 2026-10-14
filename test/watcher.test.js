'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkAndLocalizeApp, waitForStableFile, acquireLock, digest, safeReplaceFile, ensureAccessibleDir } = require('../auto_localize_watcher');

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
    waitForStableFile(f.asarPath, { interval: 1, timeout: 30, samples: 3 });
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

