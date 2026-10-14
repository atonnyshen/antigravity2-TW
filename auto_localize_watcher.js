#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const DIR = __dirname;
const IS_MAC = process.platform === 'darwin';
const ROOT = IS_MAC && typeof process.getuid === 'function' && process.getuid() === 0;
const SIGNATURE = '/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */';
const NEEDLE = '命令選擇區';

function stripQuarantine(target) {
    if (!IS_MAC) return;
    try {
        execFileSync('/usr/bin/xattr', ['-d', 'com.apple.quarantine', target], { stdio: 'ignore' });
    } catch {}
}

function stripQuarantineRecursive(target) {
    if (!IS_MAC) return;
    try {
        execFileSync('/usr/bin/xattr', ['-d', '-r', 'com.apple.quarantine', target], { stdio: 'ignore' });
    } catch {}
}

function log(message) {
    const line = '[' + new Date().toISOString() + '] ' + message;
    console.log(line);
    const isService = Boolean(process.env.XPC_SERVICE_NAME);
    const logPaths = [];
    if (IS_MAC && ROOT) {
        try {
            const sysLogDir = '/Library/Logs/Antigravity2TW';
            if (fs.existsSync(sysLogDir)) fs.chmodSync(sysLogDir, 0o755);
            const sysLog = path.join(sysLogDir, 'autolocalize.log');
            if (fs.existsSync(sysLog)) fs.chmodSync(sysLog, 0o644);
        } catch {}
        if (!isService) {
            logPaths.push('/Library/Logs/Antigravity2TW/autolocalize.log');
        }
    }
    if (!isService) {
        logPaths.push(path.join(DIR, 'autolocalize.log'));
    }
    for (const lp of logPaths) {
        try {
            fs.appendFileSync(lp, line + '\n');
            fs.chmodSync(lp, 0o644);
        } catch {}
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

function ensureAccessibleDir(dir, targetUid, targetGid) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
    try { fs.chmodSync(dir, 0o755); } catch {}
    if (ROOT) {
        try {
            let uid = targetUid;
            let gid = targetGid;
            if (uid == null || uid === 0) {
                const parentStat = fs.statSync(path.dirname(dir));
                if (parentStat.uid !== 0) {
                    uid = parentStat.uid;
                    gid = parentStat.gid;
                }
            }
            if (uid != null && uid !== 0) {
                fs.chownSync(dir, uid, gid);
                try {
                    for (const f of fs.readdirSync(dir)) {
                        const fp = path.join(dir, f);
                        try {
                            fs.chownSync(fp, uid, gid);
                            const st = fs.lstatSync(fp);
                            fs.chmodSync(fp, st.isDirectory() ? 0o755 : 0o644);
                        } catch {}
                    }
                } catch {}
            }
        } catch {}
    }
}

function acquireLock(lockPath, targetUid, targetGid) {
    try {
        fs.mkdirSync(lockPath, { mode: 0o755 });
        if (ROOT) {
            try {
                let uid = targetUid;
                let gid = targetGid;
                if (uid == null || uid === 0) {
                    const parentStat = fs.statSync(path.dirname(lockPath));
                    if (parentStat.uid !== 0) {
                        uid = parentStat.uid;
                        gid = parentStat.gid;
                    }
                }
                if (uid != null && uid !== 0) fs.chownSync(lockPath, uid, gid);
            } catch {}
        }
    } catch (error) {
        if (error.code === 'EACCES') {
            try { fs.chmodSync(lockPath, 0o755); } catch {}
        }
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
        try {
            fs.rmSync(lockPath, { recursive: true, force: true });
        } catch (rmErr) {
            if (rmErr.code === 'EACCES') {
                try { fs.chmodSync(lockPath, 0o777); } catch {}
                fs.rmSync(lockPath, { recursive: true, force: true });
            } else {
                throw rmErr;
            }
        }
        return acquireLock(lockPath, targetUid, targetGid);
    }
    const pidFile = path.join(lockPath, 'pid');
    fs.writeFileSync(pidFile, String(process.pid), { flag: 'wx' });
    if (ROOT) {
        try {
            let uid = targetUid;
            let gid = targetGid;
            if (uid == null || uid === 0) {
                const parentStat = fs.statSync(path.dirname(lockPath));
                if (parentStat.uid !== 0) {
                    uid = parentStat.uid;
                    gid = parentStat.gid;
                }
            }
            if (uid != null && uid !== 0) fs.chownSync(pidFile, uid, gid);
        } catch {}
    }
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
    const files = ['package.json', 'package-lock.json', 'localization_engine.js', 'auto_localize_watcher.js'];
    for (const folder of ['dicts', 'dicts_tw']) {
        const folderPath = path.join(DIR, folder);
        if (fs.existsSync(folderPath)) {
            for (const name of fs.readdirSync(folderPath).sort()) {
                if (name.endsWith('.json')) files.push(path.join(folder, name));
            }
        }
    }
    const hash = crypto.createHash('sha256');
    for (const file of files) {
        const fullPath = path.join(DIR, file);
        if (fs.existsSync(fullPath)) {
            hash.update(file).update(fs.readFileSync(fullPath));
        }
    }
    return hash.digest('hex');
}

function isLocalized(buffer) {
    return buffer.includes(Buffer.from(SIGNATURE)) || buffer.includes(Buffer.from(NEEDLE));
}

function ensureRegularTarget(file) {
    // Refuse symlink destinations before privileged backup/replacement.
    const parentDir = path.dirname(file);
    if (fs.existsSync(parentDir) && fs.realpathSync(parentDir) !== parentDir) {
        throw new Error('拒絕經由符號連結修改應用程式資源目錄。');
    }
    try {
        const stat = fs.lstatSync(file);
        if (!stat.isFile()) throw new Error('拒絕修改非一般檔案：' + file);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function notifyMacUser(title, message) {
    if (!IS_MAC) return;
    try {
        const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`;
        execFileSync('/usr/bin/osascript', ['-e', script], { stdio: 'ignore' });
    } catch {}
}

function safeReplaceFile(src, dst, mode, uid, gid) {
    stripQuarantine(src);
    stripQuarantine(dst);
    try {
        fs.renameSync(src, dst);
    } catch (error) {
        if (error.code === 'EPERM' || error.code === 'EXDEV' || error.code === 'EACCES') {
            let replaced = false;
            // 1. Try copyFileSync
            try {
                if (fs.existsSync(dst)) {
                    try { fs.chmodSync(dst, 0o644); } catch {}
                }
                fs.copyFileSync(src, dst);
                replaced = true;
            } catch (copyErr) {
                // 2. Try in-place write via openSync('r+') to avoid copyfile(3) attribute issues without unlinking
                try {
                    if (fs.existsSync(dst)) {
                        try { fs.chmodSync(dst, 0o644); } catch {}
                        const fd = fs.openSync(dst, 'r+');
                        try {
                            const buf = fs.readFileSync(src);
                            fs.ftruncateSync(fd, 0);
                            fs.writeSync(fd, buf, 0, buf.length, 0);
                            replaced = true;
                        } finally {
                            fs.closeSync(fd);
                        }
                    } else {
                        const buf = fs.readFileSync(src);
                        fs.writeFileSync(dst, buf, { mode: mode || 0o644 });
                        replaced = true;
                    }
                } catch (writeErr) {
                    // 3. Try /bin/cp without -f to avoid unlinking dst if copy fails
                    try {
                        execFileSync('/bin/cp', [src, dst], { stdio: 'ignore' });
                        replaced = true;
                    } catch (cpErr) {
                        throw writeErr;
                    }
                }
            }
            if (replaced) {
                try { fs.unlinkSync(src); } catch {}
            }
        } else {
            throw error;
        }
    }
    stripQuarantine(dst);
    if (mode != null) {
        try { fs.chmodSync(dst, mode & 0o777); } catch {}
    }
    if (ROOT && uid != null && gid != null) {
        try { fs.chownSync(dst, uid, gid); } catch {}
    }
}

function buildArchive(stageDir) {
    execFileSync(process.execPath, [
        path.join(DIR, 'localization_engine.js'), '--tw', '--brand-title', 'english',
        '--install-dir', stageDir, '--no-kill', '--staging'
    ], { cwd: DIR, stdio: 'inherit', timeout: 180000 });
}

function signApp(appPath, sourceStat) {
    if (!IS_MAC) return;
    stripQuarantineRecursive(appPath);
    execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'pipe', timeout: 120000 });
    execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'pipe', timeout: 30000 });
    if (ROOT && sourceStat && sourceStat.uid !== 0) {
        try {
            const sigDir = path.join(appPath, 'Contents', '_CodeSignature');
            if (fs.existsSync(sigDir)) {
                fs.chownSync(sigDir, sourceStat.uid, sourceStat.gid);
                for (const f of fs.readdirSync(sigDir)) {
                    fs.chownSync(path.join(sigDir, f), sourceStat.uid, sourceStat.gid);
                }
            }
        } catch {}
    }
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
    ensureAccessibleDir(stateDir, sourceStat.uid, sourceStat.gid);
    const statePath = path.join(stateDir, digest(appPath) + '.json');
    let previous = {};
    try { previous = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
    if (localized && previous.recipe === recipe && previous.output === originalHash) {
        log('已是目前版本的繁中套件，略過。');
        return false;
    }

    const release = acquireLock(path.join(stateDir, 'run.lock'), sourceStat.uid, sourceStat.gid);
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

        // Try creating replacementDir in Resources dir; if denied by macOS EPERM, fall back to stateDir or os.tmpdir()
        try {
            replacementDir = fs.mkdtempSync(path.join(path.dirname(asarPath), '.autolocalize-'));
        } catch (dirErr) {
            try {
                replacementDir = fs.mkdtempSync(path.join(stateDir, '.autolocalize-'));
            } catch {
                replacementDir = fs.mkdtempSync(path.join(os.tmpdir(), '.autolocalize-'));
            }
        }

        const candidate = path.join(replacementDir, 'app.asar');
        fs.writeFileSync(candidate, result, { mode: sourceStat.mode & 0o777, flag: 'wx' });
        if (ROOT) {
            try { fs.chownSync(candidate, sourceStat.uid, sourceStat.gid); } catch {}
        }
        if (!localized) {
            let needBackup = true;
            try {
                if (fs.existsSync(asarPath + '.bak')) {
                    const existingBak = fs.readFileSync(asarPath + '.bak');
                    if (digest(existingBak) === originalHash) {
                        needBackup = false;
                    }
                }
            } catch {}
            if (needBackup) {
                try {
                    const backup = path.join(replacementDir, 'official.bak');
                    fs.writeFileSync(backup, original, { mode: sourceStat.mode & 0o777, flag: 'wx' });
                    if (ROOT) {
                        try { fs.chownSync(backup, sourceStat.uid, sourceStat.gid); } catch {}
                    }
                    safeReplaceFile(backup, asarPath + '.bak', sourceStat.mode, sourceStat.uid, sourceStat.gid);
                } catch (bakErr) {
                    log('應用程式目錄備份非致命略過：' + bakErr.message);
                }
            }
        }
        if (digest(fs.readFileSync(asarPath)) !== originalHash) throw new Error('置換前官方包已更新，取消套用。');
        safeReplaceFile(candidate, asarPath, sourceStat.mode, sourceStat.uid, sourceStat.gid);
        replaced = true;
        sign(appPath, sourceStat);
        const stateTmp = path.join(stateDir, digest(appPath) + '.json.tmp');
        fs.writeFileSync(stateTmp, JSON.stringify({ recipe, output: digest(result), updatedAt: new Date().toISOString() }) + '\n');
        if (ROOT) {
            try {
                const parentStat = fs.statSync(path.dirname(stateTmp));
                if (parentStat.uid !== 0) fs.chownSync(stateTmp, parentStat.uid, parentStat.gid);
            } catch {}
        }
        safeReplaceFile(stateTmp, statePath, 0o644, sourceStat.uid, sourceStat.gid);
        log('繁中套件已套用並驗證；已開啟的視窗須重新啟動後載入。');
        return true;
    } catch (error) {
        if (replaced) {
            try {
                if (digest(fs.readFileSync(asarPath)) !== resultHash) {
                    throw new Error('套用後官方包再次改變，保留新檔，不覆蓋還原。');
                }
                const rollback = path.join(replacementDir || stageDir, 'rollback.asar');
                fs.writeFileSync(rollback, original, { flag: 'wx', mode: sourceStat.mode & 0o777 });
                if (ROOT) {
                    try { fs.chownSync(rollback, sourceStat.uid, sourceStat.gid); } catch {}
                }
                safeReplaceFile(rollback, asarPath, sourceStat.mode, sourceStat.uid, sourceStat.gid);
                sign(appPath, sourceStat);
                log('套用未通過，已還原原始 app.asar。');
            } catch (rollbackError) {
                log('還原／重新簽署失敗：' + rollbackError.message);
            }
        }
        throw error;
    } finally {
        if (stageDir) {
            try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch {}
        }
        if (replacementDir) {
            try { fs.rmSync(replacementDir, { recursive: true, force: true }); } catch {}
        }
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
        log('自動繁中化失敗，稍後重試：' + (error.stack || error.message));
        if (IS_MAC && (error.code === 'EPERM' || (error.message && error.message.includes('EPERM')))) {
            notifyMacUser('Antigravity 繁中化', '因 macOS 系統權限或 App 管理限制，自動覆寫受阻；請在專案中執行「點兩下安裝繁體中文」或於系統設定授權。');
        }
        process.exitCode = 1;
    }
}

if (require.main === module) main();
module.exports = { checkAndLocalizeApp, waitForStableFile, acquireLock, isLocalized, digest, safeReplaceFile, recipeHash, ensureAccessibleDir };
