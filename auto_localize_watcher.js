#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const DIR = __dirname;
const IS_MAC = process.platform === 'darwin';
const ROOT = IS_MAC && process.getuid() === 0;
const SIGNATURE = '/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */';
const NEEDLE = '命令選擇區';

function log(message) {
    const line = '[' + new Date().toISOString() + '] ' + message;
    console.log(line);
    if (!process.env.XPC_SERVICE_NAME) {
        try { fs.appendFileSync(path.join(DIR, 'autolocalize.log'), line + '\n'); } catch {}
    }
}

function digest(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function waitForStableFile(file, { interval = 1000, timeout = 30000, samples = 3 } = {}) {
    const start = Date.now();
    let previous = '';
    let count = 0;
    while (Date.now() - start <= timeout) {
        try {
            const stat = fs.statSync(file);
            const key = [stat.size, stat.mtimeMs, stat.ino].join(':');
            count = stat.size > 0 && key === previous ? count + 1 : 1;
            previous = key;
            if (stat.size > 0 && count >= samples) return;
        } catch { count = 0; previous = ''; }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, interval);
    }
    throw new Error('app.asar 尚未穩定，等待下次排程重試。');
}

function acquireLock(lockPath) {
    try {
        fs.mkdirSync(lockPath, { mode: 0o700 });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const stat = fs.lstatSync(lockPath);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('鎖定路徑不是一般目錄。');
        let pid;
        try { pid = Number(fs.readFileSync(path.join(lockPath, 'pid'), 'utf8')); } catch {}
        if (Number.isInteger(pid) && pid > 0) {
            try { process.kill(pid, 0); return null; } catch (e) {
                if (e.code !== 'ESRCH') return null;
            }
        } else if (Date.now() - stat.mtimeMs < 30000) {
            return null;
        }
        fs.rmSync(lockPath, { recursive: true });
        return acquireLock(lockPath);
    }
    fs.writeFileSync(path.join(lockPath, 'pid'), String(process.pid), { flag: 'wx' });
    return () => fs.rmSync(lockPath, { recursive: true, force: true });
}

function getAppInfo() {
    let candidates;
    if (IS_MAC) {
        candidates = ['/Applications/Antigravity.app', '/Applications/Antigravity IDE.app'];
        if (!ROOT) candidates.push(
            path.join(os.homedir(), 'Applications', 'Antigravity.app'),
            path.join(os.homedir(), 'Applications', 'Antigravity IDE.app')
        );
    } else {
        candidates = [
            process.env.ANTIGRAVITY_INSTALL_DIR,
            process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'antigravity'),
            'C:\\Program Files\\Antigravity', 'C:\\Programs\\Antigravity'
        ].filter(Boolean);
    }
    for (const appPath of candidates) {
        const asarPath = path.join(appPath, ...(IS_MAC ? ['Contents', 'Resources'] : ['resources']), 'app.asar');
        if (fs.existsSync(asarPath)) return { appPath, asarPath };
    }
    return null;
}

function recipeHash() {
    const files = ['localization_engine.js', 'auto_localize_watcher.js', 'package-lock.json'];
    for (const folder of ['dicts', 'dicts_tw']) {
        for (const name of fs.readdirSync(path.join(DIR, folder)).sort()) {
            if (name.endsWith('.json')) files.push(path.join(folder, name));
        }
    }
    const hash = crypto.createHash('sha256');
    for (const file of files) hash.update(file).update(fs.readFileSync(path.join(DIR, file)));
    return hash.digest('hex');
}

function isLocalized(buffer) {
    return buffer.includes(Buffer.from(SIGNATURE)) || buffer.includes(Buffer.from(NEEDLE));
}

function ensureRegularTarget(file) {
    // Refuse symlink destinations before privileged backup/replacement.
    if (fs.realpathSync(path.dirname(file)) !== path.dirname(file)) {
        throw new Error('拒絕經由符號連結修改應用程式資源目錄。');
    }
    try {
        if (!fs.lstatSync(file).isFile()) throw new Error('拒絕修改非一般檔案：' + file);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function buildArchive(stageDir) {
    execFileSync(process.execPath, [
        path.join(DIR, 'localization_engine.js'), '--tw', '--brand-title', 'english',
        '--install-dir', stageDir, '--no-kill', '--staging'
    ], { cwd: DIR, stdio: 'inherit', timeout: 180000 });
}

function signApp(appPath) {
    if (!IS_MAC) return;
    execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'pipe', timeout: 120000 });
    execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'pipe', timeout: 30000 });
}

function checkAndLocalizeApp(appInfo, {
    stateDir = path.join(DIR, '.watcher-state'), build = buildArchive,
    sign = signApp, wait = waitForStableFile, recipe = recipeHash()
} = {}) {
    const { appPath, asarPath } = appInfo;
    ensureRegularTarget(asarPath);
    wait(asarPath);
    const original = fs.readFileSync(asarPath);
    const originalHash = digest(original);
    const sourceStat = fs.statSync(asarPath);
    const localized = isLocalized(original);
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    const statePath = path.join(stateDir, digest(appPath) + '.json');
    let previous = {};
    try { previous = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
    if (localized && previous.recipe === recipe && previous.output === originalHash) {
        log('已是目前版本的繁中套件，略過。');
        return false;
    }

    const release = acquireLock(path.join(stateDir, 'run.lock'));
    if (!release) { log('已有守護程序執行中，略過。'); return false; }
    let stageDir;
    let replacementDir;
    let replaced = false;
    let resultHash;
    try {
        stageDir = fs.mkdtempSync(path.join(stateDir, 'stage-'));
        const stageAsar = path.join(stageDir, 'app.asar');
        fs.writeFileSync(stageAsar, original, { flag: 'wx' });
        const unpacked = asarPath + '.unpacked';
        if (fs.existsSync(unpacked)) fs.cpSync(unpacked, stageAsar + '.unpacked', { recursive: true });
        log(localized ? '套用新的字典／引擎修訂。' : '偵測到官方更新，開始繁中化。');
        build(stageDir);
        const result = fs.readFileSync(stageAsar);
        resultHash = digest(result);
        if (!result.includes(Buffer.from(NEEDLE))) throw new Error('建置缺少繁中特徵詞，保留原檔。');

        // ShipIt may finish another update while the archive is being built.
        if (digest(fs.readFileSync(asarPath)) !== originalHash) {
            throw new Error('建置期間官方包已改變，放棄本次產物，等待下次觸發。');
        }
        ensureRegularTarget(asarPath);
        if (!localized) {
            ensureRegularTarget(asarPath + '.bak');
        }
        replacementDir = fs.mkdtempSync(path.join(path.dirname(asarPath), '.autolocalize-'));
        const candidate = path.join(replacementDir, 'app.asar');
        fs.writeFileSync(candidate, result, { mode: sourceStat.mode & 0o777, flag: 'wx' });
        if (ROOT) fs.chownSync(candidate, sourceStat.uid, sourceStat.gid);
        if (!localized) {
            const backup = path.join(replacementDir, 'official.bak');
            fs.writeFileSync(backup, original, { mode: sourceStat.mode & 0o777, flag: 'wx' });
            if (ROOT) fs.chownSync(backup, sourceStat.uid, sourceStat.gid);
            fs.renameSync(backup, asarPath + '.bak');
        }
        if (digest(fs.readFileSync(asarPath)) !== originalHash) throw new Error('置換前官方包已更新，取消套用。');
        fs.renameSync(candidate, asarPath);
        replaced = true;
        sign(appPath);
        const stateTmp = path.join(stateDir, digest(appPath) + '.json.tmp');
        fs.writeFileSync(stateTmp, JSON.stringify({ recipe, output: digest(result), updatedAt: new Date().toISOString() }) + '\n');
        fs.renameSync(stateTmp, statePath);
        log('繁中套件已套用並驗證；已開啟的視窗須重新啟動後載入。');
        return true;
    } catch (error) {
        if (replaced) {
            try {
                if (digest(fs.readFileSync(asarPath)) !== resultHash) {
                    throw new Error('套用後官方包再次改變，保留新檔，不覆蓋還原。');
                }
                const rollback = path.join(replacementDir, 'rollback.asar');
                fs.writeFileSync(rollback, original, { flag: 'wx', mode: sourceStat.mode & 0o777 });
                if (ROOT) fs.chownSync(rollback, sourceStat.uid, sourceStat.gid);
                fs.renameSync(rollback, asarPath);
                sign(appPath);
                log('套用未通過，已還原原始 app.asar。');
            } catch (rollbackError) {
                log('還原／重新簽署失敗：' + rollbackError.message);
            }
        }
        throw error;
    } finally {
        if (stageDir) fs.rmSync(stageDir, { recursive: true, force: true });
        if (replacementDir) fs.rmSync(replacementDir, { recursive: true, force: true });
        release();
    }
}

function main() {
    try {
        if (fs.existsSync(path.join(DIR, '.disable_autowatcher'))) return;
        const appInfo = getAppInfo();
        if (!appInfo) { log('尚未找到 Antigravity，等待下次排程。'); return; }
        checkAndLocalizeApp(appInfo);
    } catch (error) {
        log('自動繁中化失敗，稍後重試：' + error.message);
        process.exitCode = 1;
    }
}

if (require.main === module) main();
module.exports = { checkAndLocalizeApp, waitForStableFile, acquireLock, isLocalized, digest };
