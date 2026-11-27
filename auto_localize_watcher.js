#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const runLock = require('./src/run_lock');

const DIR = __dirname;
const IS_MAC = process.platform === 'darwin';
const ROOT = IS_MAC && typeof process.getuid === 'function' && process.getuid() === 0;
const SIGNATURE = '/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */';
const NEEDLE = '命令選擇區';

let autoUpdater = null;
try {
    autoUpdater = require(path.join(DIR, 'scripts', 'auto_updater.js'));
} catch {}

function stripQuarantine(target) {
    if (!IS_MAC) return;
    try {
        execFileSync('/usr/bin/xattr', ['-d', 'com.apple.quarantine', target], { stdio: 'ignore' });
    } catch {}
    try {
        execFileSync('/usr/bin/xattr', ['-d', 'com.apple.provenance', target], { stdio: 'ignore' });
    } catch {}
}

// -s：App 裡的連結只處理連結本身（實測 xattr -r 會跟隨指向檔案的連結，清除套件外那個檔案的屬性）；
// 套件內連結指向的檔案在走訪實際目錄時照常清除。as 指定執行身分
function stripQuarantineRecursive(target, as = {}, exec = execFileSync) {
    if (!IS_MAC) return;
    try {
        exec('/usr/bin/xattr', ['-d', '-r', '-s', 'com.apple.quarantine', target], { stdio: 'ignore', ...as });
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

// 排程每 5 分鐘執行一次，日誌超過上限時改名保留一份舊檔，避免無限增長。
// launchd 每次啟動都會重新開啟 StandardOutPath，所以改名後下一輪會寫入新檔。
const LOG_ROTATE_BYTES = 5 * 1024 * 1024;
function watcherLogPaths() {
    const paths = [path.join(DIR, 'autolocalize.log')];
    if (IS_MAC) {
        paths.push(ROOT
            ? '/Library/Logs/Antigravity2TW/autolocalize.log'
            : path.join(os.homedir(), 'Library', 'Logs', 'Antigravity2TW', 'autolocalize.log'));
    }
    return paths;
}
function rotateLogs(candidates = watcherLogPaths(), limit = LOG_ROTATE_BYTES) {
    for (const lp of candidates) {
        try {
            if (fs.statSync(lp).size <= limit) continue;
            // 排程與手動執行可能同時看到日誌超限：只讓拿到輪替鎖的程序改名，並在鎖內重新確認大小，
            // 避免後到的程序把剛重建的小日誌改名，蓋掉完整的舊日誌
            // 改名只需幾毫秒：輪替鎖持有超過一分鐘就視為殘留
            const release = acquireLock(lp + '.rotate.lock', undefined, undefined, { staleMs: 60 * 1000 });
            if (!release) continue;
            try {
                if (fs.statSync(lp).size > limit) fs.renameSync(lp, lp + '.1');
            } finally {
                release();
            }
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

// root 變更擁有者與權限時，先以不跟隨連結的方式開啟，再透過檔案代碼修改；多重硬連結的檔案略過，
// 目錄只在 allowDir 時處理。使用者可寫的目錄（.watcher-state、App 資源目錄）裡被放入連結時，
// 不會把連結指向的系統檔案或執行期模組交給使用者
function setOwnerNoFollow(target, { uid, gid, mode, allowDir = false } = {}) {
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0);
    let fd;
    try { fd = fs.openSync(target, flags); } catch { return false; }
    try {
        const st = fs.fstatSync(fd);
        if (st.isFile() ? st.nlink !== 1 : !(allowDir && st.isDirectory())) return false;
        if (uid != null && gid != null) fs.fchownSync(fd, uid, gid);
        const wanted = typeof mode === 'function' ? mode(st) : mode;
        if (wanted != null) fs.fchmodSync(fd, wanted);
        return true;
    } catch {
        return false;
    } finally {
        fs.closeSync(fd);
    }
}

// 逐一處理目錄裡的項目：先以不跟隨連結的方式開啟目錄，切換工作目錄後確認仍是同一個目錄，再把單層的相對名稱交給 fn。
// 目錄在檢查之後被換成連結時，相對名稱仍落在原本那個目錄裡，不會被導向執行目錄等 root 擁有的位置
function forEachChildNoFollow(dir, fn) {
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_DIRECTORY || 0);
    let dirFd;
    try { dirFd = fs.openSync(dir, flags); } catch { return false; }
    let previous;
    try { previous = process.cwd(); } catch { fs.closeSync(dirFd); return false; }
    try {
        const expected = fs.fstatSync(dirFd);
        process.chdir(dir);
        const here = fs.statSync('.');
        if (here.dev !== expected.dev || here.ino !== expected.ino) return false;
        for (const name of fs.readdirSync('.')) fn(name);
        return true;
    } catch {
        return false;
    } finally {
        try { process.chdir(previous); } catch {}
        fs.closeSync(dirFd);
    }
}

// 只改權限：以 root 執行時同樣不跟隨連結
function setModeNoFollow(target, mode) {
    if (ROOT) return setOwnerNoFollow(target, { mode });
    try { fs.chmodSync(target, mode); return true; } catch { return false; }
}

// root 建立的檔案要交給誰：上層目錄屬於一般使用者時才交出（明確指定的非 root 擁有者優先，否則沿用上層目錄的擁有者）。
// 上層目錄屬於 root（系統層守護的執行目錄）時一律留給 root：交給使用者後，使用者就能替換其中的鎖、暫存目錄與狀態檔，
// 把 root 之後的寫入、搬移與刪除導向系統檔案
// 以 root 執行時就是 root；測試以一般使用者身分模擬 root 的分支
function selfOwner() {
    return { uid: process.getuid(), gid: process.getgid() };
}

function nonRootOwner(dir, targetUid, targetGid) {
    let parentStat;
    try {
        parentStat = fs.statSync(dir);
    } catch {
        return null;
    }
    if (parentStat.uid === selfOwner().uid) return null;
    if (targetUid != null && targetUid !== 0) return { uid: targetUid, gid: targetGid };
    return { uid: parentStat.uid, gid: parentStat.gid };
}

function ensureAccessibleDir(dir, targetUid, targetGid, { asRoot = ROOT } = {}) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
    if (!asRoot) {
        try { fs.chmodSync(dir, 0o755); } catch {}
        return dir;
    }
    const owner = nonRootOwner(path.dirname(dir), targetUid, targetGid);
    // 系統層守護的狀態目錄：v3.8.1 與更早版本每次執行都把目錄與第一層項目交給 App 的擁有者，這裡收回給 root
    const own = owner ? { uid: owner.uid, gid: owner.gid } : selfOwner();
    if (!setOwnerNoFollow(dir, { ...own, mode: 0o755, allowDir: true })) return dir;
    forEachChildNoFollow(dir, name => {
        setOwnerNoFollow(name, {
            ...own, allowDir: true,
            mode: st => (st.isDirectory() ? 0o755 : (owner ? 0o644 : st.mode & 0o644))
        });
    });
    return dir;
}

// 狀態檔先寫入唯一名稱的暫存檔（wx：同名項目已存在就失敗，不跟隨預先放好的連結）再改名取代。
// v3.8.1 與更早版本固定寫入 <雜湊>.json.tmp：狀態目錄屬於使用者時，預先放好的同名連結會讓 root 改寫連結指向的檔案
function writeStateFile(stateDir, statePath, record, targetUid, targetGid, { asRoot = ROOT } = {}) {
    const temp = statePath + '.' + process.pid + '.' + crypto.randomBytes(5).toString('hex') + '.tmp';
    const owner = asRoot ? nonRootOwner(stateDir, targetUid, targetGid) : null;
    try {
        fs.writeFileSync(temp, JSON.stringify(record) + '\n', { flag: 'wx', mode: 0o644 });
        if (owner) setOwnerNoFollow(temp, owner);
        fs.renameSync(temp, statePath);
    } finally {
        try { fs.rmSync(temp, { force: true }); } catch {}
    }
}

// root 刪除暫存目錄交給 /bin/rm：fts 依實體路徑走訪、進入子目錄前核對目錄身分，不跟隨連結。
// fs.rmSync 在部分 Node 版本以路徑逐層遞迴，刪除途中子目錄被換成連結時，會刪到連結指向的檔案
function removeTree(target, { asRoot = ROOT } = {}) {
    if (asRoot) {
        execFileSync('/bin/rm', ['-rf', '--', target], { stdio: 'ignore' });
        return;
    }
    fs.rmSync(target, { recursive: true, force: true });
}

// root 建立替換用暫存目錄的位置。App 的 Resources 屬於 App 的擁有者：使用者可以把 root 在其中建立的暫存目錄
// 換成連結，讓 root 寫入並交出擁有者的檔案落到系統目錄。root 改用 root 擁有的狀態目錄
// （原子交換要求同一個檔案系統，不同時沿用 Resources）
function replacementBase(asarPath, stateDir, { asRoot = ROOT } = {}) {
    const resources = path.dirname(asarPath);
    if (!asRoot) return resources;
    try {
        const st = fs.lstatSync(stateDir);
        if (st.isDirectory() && st.uid === selfOwner().uid && (st.mode & 0o022) === 0 &&
            st.dev === fs.statSync(resources).dev) return stateDir;
    } catch {}
    return resources;
}

// 被強制結束（SIGKILL、斷電）的守護程序來不及執行 finally，會在狀態目錄留下 stage-*（內含整份 app.asar，
// 可達數十 MB），之後也沒有程序清理。每次執行開始時清掉不屬於執行中程序的暫存目錄：
// 名稱帶有建立者程序編號（v3.8.2 起）且該程序已結束的立即清除；舊版建立、名稱沒有程序編號的，超過一小時未變動才清除；
// 建立者看似仍在執行（可能是程序編號被重用）時，超過一天才清除。建置與簽章各有數分鐘的逾時，
// 執行中的暫存目錄不會存在這麼久。只處理一般目錄，連結與其他檔案不碰
const STAGE_ORPHAN_MS = 60 * 60 * 1000;
const STAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
function cleanStaleStageDirs(stateDir, { now = Date.now(), remove = removeTree } = {}) {
    const removed = [];
    let names;
    try {
        names = fs.readdirSync(stateDir);
    } catch {
        return removed;
    }
    for (const name of names.sort()) {
        const match = /^stage-(?:(\d+)-)?[A-Za-z0-9]{6}$/.exec(name);
        if (!match) continue;
        const full = path.join(stateDir, name);
        let st;
        try {
            st = fs.lstatSync(full);
        } catch {
            continue;
        }
        if (!st.isDirectory()) continue;
        const age = now - st.mtimeMs;
        const pid = match[1] ? Number(match[1]) : null;
        const ownerAlive = pid !== null && pid !== process.pid && runLock.pidAlive(pid);
        const stale = pid === null ? age > STAGE_ORPHAN_MS : (!ownerAlive || age > STAGE_MAX_AGE_MS);
        if (!stale) continue;
        try {
            remove(full);
            removed.push(name);
        } catch {}
    }
    if (removed.length) log('已清除中斷執行留下的暫存目錄：' + removed.join('、'));
    return removed;
}

// 鎖的判斷與回收在 src/run_lock.js，與安裝器共用同一套格式
function acquireLock(lockPath, targetUid, targetGid, options = {}) {
    const owner = ROOT ? nonRootOwner(path.dirname(lockPath), targetUid, targetGid) : null;
    return runLock.acquire(lockPath, { ...options, owner });
}

// root 以 App 擁有者的身分刪除快取：家目錄裡的每一層路徑都由使用者控制，以 root 刪除可能被連結導向系統目錄。
// 測試可以用 appSupportDirs 與 asUser 指定位置與身分
function cleanElectronCache(targetUid, targetGid, { appSupportDirs: customDirs = null, asUser = null } = {}) {
    try {
        const appSupportDirs = [];
        if (Array.isArray(customDirs)) {
            appSupportDirs.push(...customDirs);
        } else if (IS_MAC) {
            let home = os.homedir();
            if (ROOT && targetUid && targetUid !== 0) {
                try {
                    const uEntry = execFileSync('/usr/bin/id', ['-un', String(targetUid)], { encoding: 'utf8' }).trim();
                    if (uEntry) home = path.join('/Users', uEntry);
                } catch {}
                if (targetGid != null && !asUser) asUser = { uid: targetUid, gid: targetGid };
            }
            appSupportDirs.push(
                path.join(home, 'Library', 'Application Support', 'Antigravity'),
                path.join(home, 'Library', 'Application Support', 'Antigravity IDE')
            );
        } else if (process.platform === 'win32') {
            const appData = process.env.APPDATA || '';
            if (appData) {
                appSupportDirs.push(
                    path.join(appData, 'Antigravity'),
                    path.join(appData, 'Antigravity IDE')
                );
            }
        } else {
            appSupportDirs.push(
                path.join(os.homedir(), '.config', 'Antigravity'),
                path.join(os.homedir(), '.config', 'Antigravity IDE')
            );
        }

        const toDeleteNames = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'GraphiteDawnCache', 'DawnWebGPUCache', 'ScriptCache']);
        function purgeDir(dir, depth = 0) {
            if (depth > 4 || !fs.existsSync(dir)) return;
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        const full = path.join(dir, entry.name);
                        if (toDeleteNames.has(entry.name)) {
                            try {
                                if (asUser) {
                                    execFileSync('/bin/rm', ['-rf', '--', full], { uid: asUser.uid, gid: asUser.gid, stdio: 'ignore' });
                                } else {
                                    fs.rmSync(full, { recursive: true, force: true });
                                }
                            } catch {}
                        } else if (entry.name === 'Partitions' || entry.name.startsWith('hub-browser') || entry.name === 'Service Worker') {
                            purgeDir(full, depth + 1);
                        }
                    }
                }
            } catch {}
        }

        for (const dir of appSupportDirs) {
            if (fs.existsSync(dir)) purgeDir(dir, 0);
        }
    } catch {}
}

function getWindowsUninstallCandidates(execSyncFn = execFileSync) {
    const found = [];
    const registryRoots = [
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
        'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
        'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
    ];
    for (const root of registryRoots) {
        try {
            const output = execSyncFn('reg.exe', ['query', root, '/s', '/f', 'Antigravity', '/d'], {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
                timeout: 5000
            });
            for (const line of String(output || '').split(/\r?\n/)) {
                const match = line.match(/^\s*(InstallLocation|DisplayIcon)\s+REG_\w+\s+(.+)$/i);
                if (!match) continue;
                let value = match[2].trim().replace(/^"|"$/g, '');
                if (/Antigravity\.exe$/i.test(value)) value = path.dirname(value);
                if (value) found.push(value);
            }
        } catch {}
    }
    return found;
}

function getWindowsAppCandidates(options = {}) {
    const env = options.env || process.env;
    const seen = new Set();
    const list = [];
    const add = dir => {
        if (!dir) return;
        const cleaned = String(dir).trim();
        if (!cleaned) return;
        const key = cleaned.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        list.push(cleaned);
    };

    add(env.ANTIGRAVITY_INSTALL_DIR);
    add(env.ANTIGRAVITY_HOME);
    if (env.LOCALAPPDATA) {
        add(path.join(env.LOCALAPPDATA, 'Programs', 'antigravity'));
        add(path.join(env.LOCALAPPDATA, 'Programs', 'Antigravity IDE'));
    }
    if (env.ProgramFiles) add(path.join(env.ProgramFiles, 'Antigravity'));
    if (env['ProgramFiles(x86)']) add(path.join(env['ProgramFiles(x86)'], 'Antigravity'));
    for (const drive of ['C', 'D', 'E', 'F']) {
        add(`${drive}:\\Programs\\Antigravity`);
        add(`${drive}:\\Programs\\Antigravity IDE`);
        add(`${drive}:\\Antigravity`);
    }
    add('C:\\Program Files\\Antigravity');
    add('C:\\Program Files (x86)\\Antigravity');
    if (options.includeRegistry !== false && process.platform === 'win32') {
        for (const regDir of getWindowsUninstallCandidates(options.execFileSyncFn)) {
            add(regDir);
        }
    }
    return list;
}

function getAppInfo(options = {}) {
    const platform = options.platform || process.platform;
    let candidates;
    if (platform === 'darwin') {
        candidates = ['/Applications/Antigravity.app', '/Applications/Antigravity IDE.app'];
        if (!ROOT) candidates.push(
            path.join(os.homedir(), 'Applications', 'Antigravity.app'),
            path.join(os.homedir(), 'Applications', 'Antigravity IDE.app')
        );
    } else {
        candidates = getWindowsAppCandidates(options);
    }
    for (const appPath of candidates) {
        const asarPath = path.join(appPath, ...(platform === 'darwin' ? ['Contents', 'Resources'] : ['resources']), 'app.asar');
        if (fs.existsSync(asarPath)) return { appPath, asarPath };
    }
    return null;
}

function recipeHash() {
    const files = ['package.json', 'package-lock.json', 'localization_engine.js', 'auto_localize_watcher.js'];
    for (const folder of ['dicts', 'dicts_tw', 'rules', 'src']) {
        const folderPath = path.join(DIR, folder);
        if (fs.existsSync(folderPath)) {
            for (const name of fs.readdirSync(folderPath).sort()) {
                if (name.endsWith('.json') || name.endsWith('.js')) files.push(path.join(folder, name));
            }
        }
    }
    const active = autoUpdater && typeof autoUpdater.readActiveTranslation === 'function'
        ? autoUpdater.readActiveTranslation(DIR) : null;
    if (active) {
        files.push(path.join('.watcher-state', 'active_translation.json'));
        for (const folder of ['dicts', 'dicts_tw', 'rules']) {
            const sub = path.join(active.folder, folder);
            if (!fs.existsSync(sub)) continue;
            for (const name of fs.readdirSync(sub).filter(x => x.endsWith('.json')).sort()) {
                files.push(path.relative(DIR, path.join(sub, name)));
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

function compareVersions(v1, v2) {
    if (autoUpdater && typeof autoUpdater.compareVersions === 'function') {
        return autoUpdater.compareVersions(v1, v2);
    }
    const clean = v => String(v || '').replace(/^[^\d]*/, '').split('.').map(n => parseInt(n, 10) || 0);
    const p1 = clean(v1);
    const p2 = clean(v2);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const n1 = p1[i] || 0;
        const n2 = p2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    return 0;
}

function extractLocalizationMeta(buffer) {
    if (!buffer) return null;
    try {
        const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer);
        const match = text.match(/\/\*\s*---\s*ANTIGRAVITY L10N META:(\{[^*\n]+\})\s*---\s*\*\//);
        if (!match) return null;
        const parsed = JSON.parse(match[1]);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function getLocalPackageVersion(baseDir = DIR) {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(baseDir, 'package.json'), 'utf8'));
        if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) {
            return pkg.version.trim();
        }
    } catch {}
    return '3.7.1';
}

function ensureRegularTarget(file) {
    // Refuse symlink destinations before privileged backup/replacement.
    // 相對名稱（root 在核對過的 Resources 目錄內交換時）以目前工作目錄解析後再比對
    const parentDir = path.dirname(path.resolve(file));
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

function safeReplaceFile(src, dst, mode, uid, gid, { atomicRequired = false, expectedDir = null } = {}) {
    stripQuarantine(src);
    if (expectedDir) {
        // root 把檔案搬進使用者擁有的 Resources：在開始時核對過的同一個目錄內以相對名稱改名、設定擁有者，
        // App 或 Contents 在途中被換成連結時，檔案不會落到連結指向的目錄。失敗就回報，不退回複製寫入
        inResources(dst, expectedDir, () => {
            const name = path.basename(dst);
            fs.renameSync(src, name);
            stripQuarantine(name);
            const own = uid != null && gid != null ? { uid, gid } : {};
            setOwnerNoFollow(name, { ...own, mode: mode != null ? mode & 0o777 : undefined });
        });
        return;
    }
    stripQuarantine(dst);
    try {
        fs.renameSync(src, dst);
    } catch (error) {
        // The live ASAR must never fall back to an in-place copy/truncate.
        // A crash or ENOSPC during those operations could corrupt the
        // installed application without leaving a recoverable archive.
        if (atomicRequired) {
            const denied = new Error('無法以原子置換更新 ' + path.basename(dst) +
                '，保留現有檔案；需人工檢查寫入權限或磁碟空間。', { cause: error });
            denied.code = error.code;
            throw denied;
        }
        if (error.code === 'EPERM' || error.code === 'EXDEV' || error.code === 'EACCES') {
            let replaced = false;
            // 1. Try copyFileSync
            try {
                if (fs.existsSync(dst)) setModeNoFollow(dst, 0o644);
                fs.copyFileSync(src, dst);
                replaced = true;
            } catch (copyErr) {
                // 2. Try in-place write via openSync('r+') to avoid copyfile(3) attribute issues without unlinking
                try {
                    if (fs.existsSync(dst)) {
                        setModeNoFollow(dst, 0o644);
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
                    // 3. Try /bin/cp -f to unlink dst first and bypass macOS Sequoia provenance locking
                    try {
                        execFileSync('/bin/cp', ['-f', src, dst], { stdio: 'ignore' });
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
    if (ROOT) {
        const own = uid != null && gid != null ? { uid, gid } : {};
        setOwnerNoFollow(dst, { ...own, mode: mode != null ? mode & 0o777 : undefined });
    } else if (mode != null) {
        try { fs.chmodSync(dst, mode & 0o777); } catch {}
    }
}

function fsyncFile(file) {
    // Windows FlushFileBuffers needs a writable handle. If opening or
    // flushing fails, abort the ASAR update before replacing the live file.
    const fd = fs.openSync(file, process.platform === 'win32' ? 'r+' : 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function fsyncDirectory(dir) {
    // Win32 ReplaceFileW supplies its own replacement semantics and directory
    // handles cannot be opened with Node's normal read mode on Windows.
    if (process.platform === 'win32') return;
    const fd = fs.openSync(dir, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

// root 在 Resources 裡改名或交換正式檔案時，先切換到開始時核對過的同一個 Resources 目錄，再以相對名稱操作
function inResources(file, resourcesStat, fn) {
    return runLock.inDirNoFollow(path.dirname(file),
        st => st.dev === resourcesStat.dev && st.ino === resourcesStat.ino, fn);
}

// 原子交換以 App 的正式檔案為對象時，改在核對過的 Resources 目錄內以相對名稱交換：
// 交換前後 App 或 Contents 被換成連結，也不會把繁中檔案換進其他 App 的目錄
function exchangeInResources(exchange, asarPath, resourcesStat) {
    return (candidate, live, previousPath) => {
        if (live !== asarPath) return exchange(candidate, live, previousPath);
        return inResources(asarPath, resourcesStat, () => exchange(candidate, path.basename(live), previousPath));
    };
}

// Replace the live archive AND retain the exact displaced archive. Merely
// hashing before fs.renameSync has a TOCTOU hole: ShipIt can replace the
// destination between the hash check and rename. Never fall back to a blind
// rename/copy of app.asar when native exchange is unavailable.
function exchangeAsar(candidate, live, previousPath) {
    ensureRegularTarget(candidate);
    ensureRegularTarget(live);
    if (fs.existsSync(previousPath)) throw new Error('原子置換的前版保留路徑已存在。');
    if (fs.statSync(candidate).dev !== fs.statSync(live).dev) {
        throw new Error('app.asar 原子置換要求同一個檔案系統。');
    }
    if (process.platform === 'win32') {
        execFileSync('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-File', path.join(DIR, 'scripts', 'atomic_asar_replace.ps1'),
            '-Replacement', candidate, '-Live', live, '-Previous', previousPath
        ], { stdio: 'pipe', timeout: 30000 });
        if (!fs.existsSync(previousPath)) throw new Error('ReplaceFileW 未保留原本的 app.asar。');
        return previousPath;
    }
    if (process.platform === 'darwin' || process.platform === 'linux') {
        execFileSync(process.platform === 'darwin' ? '/usr/bin/ruby' : 'ruby', [
            path.join(DIR, 'scripts', 'atomic_asar_exchange.rb'), candidate, live
        ], { stdio: 'pipe', timeout: 30000 });
        return candidate; // RENAME_SWAP / RENAME_EXCHANGE retains displaced bytes here.
    }
    throw new Error('本平台沒有已驗證的 app.asar 原子交換能力，拒絕覆寫。');
}

// A single atomic exchange retains the overwritten bytes for forensic
// verification. If ShipIt swapped in newer bytes just before the exchange,
// exchange them BACK rather than discarding them. Any unresolved version is
// kept in a recovery file and the operation fails closed.
function exchangeCheckedAsar(candidate, live, previousPath, expectedHash, replacementHash,
    exchangeFn = exchangeAsar) {
    if (digest(fs.readFileSync(live)) !== expectedHash) {
        throw new Error('原子交換前官方 app.asar 已更新，取消本輪套用。');
    }
    let displaced;
    try {
        displaced = exchangeFn(candidate, live, previousPath);
    } catch (error) {
        // A native API may report failure after modifying one or more paths,
        // especially on Windows. Do not delete the only possible recovery
        // bytes if the target or backup suggests a partial replacement.
        let changed = false;
        try { changed = digest(fs.readFileSync(live)) === replacementHash; } catch {}
        if (changed || fs.existsSync(previousPath)) {
            error.concurrentRecovery = fs.existsSync(previousPath) ? previousPath : candidate;
        }
        throw error;
    }
    let priorHash;
    try { priorHash = digest(fs.readFileSync(displaced)); }
    catch (cause) {
        const error = new Error('原子交換後無法驗證被替換的官方 ASAR，保留候選目錄。', { cause });
        error.concurrentRecovery = displaced;
        throw error;
    }
    if (priorHash === expectedHash) return { displaced, changed: true };

    let recoverPath = displaced;
    // We did exchange successfully, so preserve all displaced files even if
    // a subsequent official update makes restoring immediately impossible.
    for (let attempt = 0; attempt < 2; attempt++) {
        const liveHash = digest(fs.readFileSync(live));
        if (liveHash !== replacementHash) break; // Another writer already replaced live.
        const undoPrevious = path.join(path.dirname(previousPath),
            'concurrent-' + process.pid + '-' + attempt + '.asar');
        try {
            recoverPath = exchangeFn(recoverPath, live, undoPrevious);
        } catch (cause) {
            const error = new Error('官方 ASAR 競爭時自動回復失敗，已保留官方原檔供人工復原。', { cause });
            error.concurrentRecovery = recoverPath;
            throw error;
        }
        priorHash = digest(fs.readFileSync(recoverPath));
        if (priorHash === replacementHash) {
            const error = new Error('原子置換期間官方 ASAR 已更新，已恢復較新官方檔案。');
            error.concurrentUpdateRecovered = true;
            throw error;
        }
    }
    const error = new Error('原子置換遭遇多次官方更新；已保留被替換的原始 ASAR，須人工復原。');
    error.concurrentRecovery = recoverPath;
    throw error;
}

// Keep one verifiable recovery target per installed app. The scheduled watcher
// reads this receipt before considering another localization attempt.
function pendingAsarRecoveryPath(stateDir, appPath) {
    return path.join(stateDir, digest(appPath) + '.pending-recovery.json');
}

function writeAsarRecoveryReceipt(stateDir, receipt, record) {
    const temp = receipt + '.' + process.pid + '.' + crypto.randomBytes(5).toString('hex') + '.tmp';
    try {
        fs.writeFileSync(temp, JSON.stringify(record) + '\n', { flag: 'wx', mode: 0o600 });
        fsyncFile(temp);
        fs.renameSync(temp, receipt);
        fsyncDirectory(stateDir);
    } finally {
        try { fs.rmSync(temp, { force: true }); } catch {}
    }
}

function savePendingAsarRecovery(appInfo, stateDir, expectedLiveHash, recoveryBytes) {
    const { appPath, asarPath } = appInfo;
    if (digest(fs.readFileSync(asarPath)) !== expectedLiveHash) return null;
    const receipt = pendingAsarRecoveryPath(stateDir, appPath);
    if (fs.existsSync(receipt)) throw new Error('已有待恢復 ASAR 紀錄，停止覆寫復原依據。');
    const recoveryDir = fs.mkdtempSync(path.join(stateDir, 'recovery-'));
    const saved = path.join(recoveryDir, 'previous-app.asar');
    const bytes = Buffer.isBuffer(recoveryBytes) ? recoveryBytes : fs.readFileSync(recoveryBytes);
    if (!bytes.length) throw new Error('復原檔是空檔案。');
    fs.writeFileSync(saved, bytes, { flag: 'wx', mode: 0o600 });
    fsyncFile(saved);
    if (digest(fs.readFileSync(saved)) !== digest(bytes)) {
        throw new Error('ASAR 復原副本校驗失敗。');
    }
    fsyncDirectory(recoveryDir);
    const record = {
        schema: 1, appPath, asarPath, expectedLiveHash,
        recoverHash: digest(bytes), recoveryDir: path.basename(recoveryDir)
    };
    writeAsarRecoveryReceipt(stateDir, receipt, record);
    log('已保存下次排程的 ASAR 復原紀錄：' + receipt);
    return saved;
}

function resumePendingAsarRecovery(appInfo, stateDir, exchange = exchangeAsar) {
    const { appPath, asarPath } = appInfo;
    const receipt = pendingAsarRecoveryPath(stateDir, appPath);
    if (!fs.existsSync(receipt)) return false;
    const release = acquireLock(path.join(stateDir, 'run.lock'));
    if (!release) return 'locked';
    let stageDir;
    let retainStage = false;
    try {
        ensureRegularTarget(receipt);
        const record = JSON.parse(fs.readFileSync(receipt, 'utf8'));
        if (record.schema !== 1 || record.appPath !== appPath || record.asarPath !== asarPath ||
            !/^[a-f0-9]{64}$/.test(record.expectedLiveHash || '') ||
            !/^[a-f0-9]{64}$/.test(record.recoverHash || '') ||
            !/^recovery-[A-Za-z0-9_-]+$/.test(record.recoveryDir || '')) {
            throw new Error('ASAR 復原紀錄內容不正確，停止自動寫入。');
        }
        if (record.manualRequired) {
            throw new Error('ASAR 復原期間發生多次官方更新，無法確認最新版，需要人工核對。');
        }
        const recoveryDir = path.join(stateDir, record.recoveryDir);
        if (fs.lstatSync(recoveryDir).isSymbolicLink() ||
            !fs.lstatSync(recoveryDir).isDirectory() ||
            fs.realpathSync(recoveryDir) !== path.resolve(recoveryDir)) {
            throw new Error('ASAR 復原目錄不是安全的一般目錄。');
        }
        const saved = path.join(recoveryDir, 'previous-app.asar');
        ensureRegularTarget(saved);
        const bytes = fs.readFileSync(saved);
        if (digest(bytes) !== record.recoverHash) {
            throw new Error('ASAR 復原檔與原始 SHA-256 不符，需要人工核對。');
        }
        const liveHash = digest(fs.readFileSync(asarPath));
        if (liveHash !== record.recoverHash) {
            if (liveHash !== record.expectedLiveHash) {
                throw new Error('正式 ASAR 已被其他程序更新，停止套用舊復原檔，需要人工核對。');
            }
            const sourceStat = fs.statSync(asarPath);
            if (ROOT) exchange = exchangeInResources(exchange, asarPath, fs.statSync(path.dirname(asarPath)));
            // The replacement must be on the same filesystem as the live ASAR.
            stageDir = fs.mkdtempSync(path.join(replacementBase(asarPath, stateDir), '.autolocalize-'));
            const candidate = path.join(stageDir, 'app.asar');
            fs.writeFileSync(candidate, bytes, { flag: 'wx', mode: sourceStat.mode & 0o777 });
            fsyncFile(candidate);
            if (ROOT) setOwnerNoFollow(candidate, { uid: sourceStat.uid, gid: sourceStat.gid });
            try {
                exchangeCheckedAsar(candidate, asarPath, path.join(stageDir, 'previous.asar'),
                    record.expectedLiveHash, record.recoverHash, exchange);
                fsyncDirectory(path.dirname(asarPath));
            } catch (error) {
                retainStage = Boolean(error.concurrentRecovery);
                if (retainStage) {
                    log('ASAR 復原期間發生另一筆更新，保留檔案：' + error.concurrentRecovery);
                    // The older receipt may refer to an ASAR superseded by
                    // this newer exchange. Do not automatically restore it.
                    writeAsarRecoveryReceipt(stateDir, receipt, { ...record, manualRequired: true });
                }
                throw error;
            }
            if (digest(fs.readFileSync(asarPath)) !== record.recoverHash) {
                throw new Error('ASAR 復原後驗證失敗，保留復原紀錄。');
            }
        }
        fs.unlinkSync(receipt);
        fsyncDirectory(stateDir);
        try { removeTree(recoveryDir); }
        catch (cleanupError) { log('已完成復原，舊復原副本待清理：' + cleanupError.message); }
        log('ASAR 已恢復至已驗證的版本，重新執行繁體中文套用。');
        return true;
    } finally {
        if (stageDir && !retainStage) {
            try { removeTree(stageDir); } catch {}
        }
        release();
    }
}

function buildArchive(stageDir) {
    execFileSync(process.execPath, [
        path.join(DIR, 'localization_engine.js'), '--tw', '--brand-title', 'english',
        '--install-dir', stageDir, '--no-kill', '--staging'
    ], { cwd: DIR, stdio: 'inherit', timeout: 180000 });
}

// 以某個帳號身分執行子程序時的 uid 與該帳號的主要群組。不沿用檔案的群組：/Applications 裡的項目繼承 admin 群組，
// 擁有者不一定屬於 admin。查不到帳號時回傳 null
function accountCredentials(uid) {
    try {
        const gid = execFileSync('/usr/bin/id', ['-g', String(uid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        return /^\d+$/.test(gid) ? { uid, gid: Number(gid) } : null;
    } catch {
        return null;
    }
}

// root 以 App 擁有者的身分清除隔離屬性與簽章（以暫存複本實測）：codesign 原地改寫各層 _CodeSignature/CodeResources，
// _CodeSignature 被換成連結時照樣跟隨，把 CodeResources 寫進連結指向的目錄，以 root 執行就能寫進任何目錄。
// 以擁有者身分執行時，只能寫入擁有者本來就能寫入的位置。執行檔則另建新檔取代，新檔沿用原檔的擁有者與群組；
// root 擁有的執行檔（以硬連結放入 root 的檔案實測）以擁有者身分照樣能簽，原檔不變，新檔歸擁有者。
// CodeResources、_CodeSignature 或 MacOS 目錄擁有者不可寫時，擁有者簽章失敗，交由呼叫端還原。
// appStat 是開始處理時記下的 App 資料夾：以不跟隨連結的方式開啟、核對是同一個資料夾後切換進去，以 . 交給 codesign，
// 執行身分取自這個資料夾的擁有者（codesign 之後會把 . 換算成絕對路徑，簽章途中被替換時靠的是降低身分）。
// App 資料夾屬於 root 時照舊以 root 簽章。測試以 asRoot 模擬 root 的分支
function signApp(appPath, _sourceStat, { asRoot = ROOT, exec = execFileSync, appStat = null } = {}) {
    if (!IS_MAC) return;
    const run = (target, as) => {
        stripQuarantineRecursive(target, as, exec);
        exec('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', target], { stdio: 'pipe', timeout: 120000, ...as });
        exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', target], { stdio: 'pipe', timeout: 30000, ...as });
    };
    if (!asRoot) return run(appPath, {});
    let app = null;
    runLock.inDirNoFollow(appPath, st => {
        app = st;
        return !appStat || (st.dev === appStat.dev && st.ino === appStat.ino);
    }, () => {
        if (app.uid === 0) return run('.', {});
        const as = accountCredentials(app.uid);
        if (!as) throw new Error('查不到 App 擁有者（uid ' + app.uid + '）的帳號，未重新簽章。');
        return run('.', as);
    });
}

function checkAndLocalizeApp(appInfo, {
    stateDir = path.join(DIR, '.watcher-state'), build = buildArchive,
    sign = signApp, wait = waitForStableFile, recipe = recipeHash(),
    currentVersion = getLocalPackageVersion(), exchange = exchangeAsar
} = {}) {
    const { appPath, asarPath } = appInfo;
    ensureRegularTarget(asarPath);
    // root 之後搬進或換入 Resources 的檔案，都要落在這裡記下的同一個目錄；簽章對象也要是這裡記下的同一個 App 資料夾
    const resourcesStat = ROOT ? fs.statSync(path.dirname(asarPath)) : null;
    if (resourcesStat) exchange = exchangeInResources(exchange, asarPath, resourcesStat);
    const appStat = ROOT ? fs.lstatSync(appPath) : null;
    wait(asarPath);
    const currentStat = fs.statSync(asarPath);
    ensureAccessibleDir(stateDir, currentStat.uid, currentStat.gid);
    cleanStaleStageDirs(stateDir);
    const resumed = resumePendingAsarRecovery(appInfo, stateDir, exchange);
    if (resumed === 'locked') {
        log('另有守護程序正在恢復 ASAR，略過本輪。');
        return false;
    }
    if (resumed) wait(asarPath);
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
    const targetMeta = localized ? extractLocalizationMeta(original) : null;
    const active = autoUpdater && typeof autoUpdater.readActiveTranslation === 'function'
        ? autoUpdater.readActiveTranslation(DIR) : null;
    const desiredTranslationVersion = active ? active.version : currentVersion;
    const deployedTranslationVersion = targetMeta && (targetMeta.translationVersion || targetMeta.version);
    const higherEngineVersion = targetMeta && targetMeta.version && compareVersions(targetMeta.version, currentVersion) > 0;
    const externalSameVersion = targetMeta && targetMeta.version &&
        compareVersions(targetMeta.version, currentVersion) === 0 &&
        compareVersions(desiredTranslationVersion, deployedTranslationVersion || '') <= 0 &&
        previous.output !== originalHash;
    if (localized && (higherEngineVersion || externalSameVersion)) {
        try {
            writeStateFile(stateDir, statePath, {
                recipe,
                output: originalHash,
                skippedHigherVersion: targetMeta.version,
                updatedAt: new Date().toISOString()
            }, sourceStat.uid, sourceStat.gid);
        } catch {}
        log(`目標 app.asar 來自外部同版或較新的引擎 (v${targetMeta.version})，主動保留以防回滾。`);
        return false;
    }

    const release = acquireLock(path.join(stateDir, 'run.lock'), sourceStat.uid, sourceStat.gid);
    if (!release) { log('已有守護程序執行中，略過。'); return false; }
    let stageDir;
    let replacementDir;
    let replaced = false;
    let resultHash;
    let retainReplacementDir = false;
    try {
        stageDir = fs.mkdtempSync(path.join(stateDir, `stage-${process.pid}-`));
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
        // 持有者長時間停擺（例如系統睡眠）時，鎖可能已被判定殘留並由其他程序接手：替換正式檔案前再確認一次
        if (typeof release.held === 'function' && !release.held()) {
            throw new Error('執行鎖已由其他守護程序接手，放棄本次產物。');
        }
        ensureRegularTarget(asarPath);
        if (!localized) {
            ensureRegularTarget(asarPath + '.bak');
        }

        // Try creating replacementDir in Resources dir (root: the root-owned stateDir, see replacementBase);
        // if denied by macOS EPERM, fall back to stateDir or os.tmpdir()
        try {
            replacementDir = fs.mkdtempSync(path.join(replacementBase(asarPath, stateDir), '.autolocalize-'));
        } catch (dirErr) {
            try {
                replacementDir = fs.mkdtempSync(path.join(stateDir, '.autolocalize-'));
            } catch {
                replacementDir = fs.mkdtempSync(path.join(os.tmpdir(), '.autolocalize-'));
            }
        }

        const candidate = path.join(replacementDir, 'app.asar');
        fs.writeFileSync(candidate, result, { mode: sourceStat.mode & 0o777, flag: 'wx' });
        fsyncFile(candidate);
        if (ROOT) setOwnerNoFollow(candidate, { uid: sourceStat.uid, gid: sourceStat.gid });
        if (!localized) {
            let needBackup = true;
            if (fs.existsSync(asarPath + '.bak')) {
                needBackup = digest(fs.readFileSync(asarPath + '.bak')) !== originalHash;
            }
            if (needBackup) {
                const backup = path.join(replacementDir, 'official.bak');
                fs.writeFileSync(backup, original, { mode: sourceStat.mode & 0o777, flag: 'wx' });
                fsyncFile(backup);
                if (ROOT) setOwnerNoFollow(backup, { uid: sourceStat.uid, gid: sourceStat.gid });
                safeReplaceFile(backup, asarPath + '.bak', sourceStat.mode, sourceStat.uid, sourceStat.gid,
                    { atomicRequired: true, expectedDir: resourcesStat });
            }
            if (digest(fs.readFileSync(asarPath + '.bak')) !== originalHash) {
                throw new Error('官方 app.asar 備份驗證失敗，拒絕修改正式檔案。');
            }
            fsyncFile(asarPath + '.bak');
            fsyncDirectory(path.dirname(asarPath));
        } else if (!fs.existsSync(asarPath + '.bak')) {
            throw new Error('既有繁中 ASAR 缺少官方原始備份，拒絕繼續覆寫。');
        }
        if (digest(fs.readFileSync(asarPath)) !== originalHash) throw new Error('置換前官方包已更新，取消套用。');
        try {
            exchangeCheckedAsar(candidate, asarPath, path.join(replacementDir, 'previous.asar'),
                originalHash, resultHash, exchange);
        } catch (swapError) {
            if (swapError.concurrentRecovery) {
                retainReplacementDir = true;
                log('官方更新競爭：原始 ASAR 保留在 ' + swapError.concurrentRecovery + '。');
                try {
                    if (!savePendingAsarRecovery(appInfo, stateDir, resultHash, swapError.concurrentRecovery)) {
                        log('正式 ASAR 已另行更新，保留復原檔供核對。');
                    }
                } catch (saveError) {
                    log('無法建立自動復原紀錄，需人工處理：' + saveError.message);
                }
            }
            throw swapError;
        }
        replaced = true;
        fsyncDirectory(path.dirname(asarPath));
        // Clean replacementDir from Contents/Resources before codesign seals the bundle;
        // removing it after sign() would invalidate macOS sealed resources.
        if (replacementDir) {
            try {
                removeTree(replacementDir);
                replacementDir = null;
            } catch {}
        }
        sign(appPath, sourceStat, { appStat });
        if (digest(fs.readFileSync(asarPath)) !== resultHash) {
            throw new Error('簽署期間官方 app.asar 已更新，保留較新檔案並取消本輪收據。');
        }
        writeStateFile(stateDir, statePath, { recipe, output: digest(result), updatedAt: new Date().toISOString() },
            sourceStat.uid, sourceStat.gid);
        cleanElectronCache(sourceStat ? sourceStat.uid : null, sourceStat ? sourceStat.gid : null);
        log('繁中套件已套用並驗證；已開啟的視窗須重新啟動後載入。');
        return true;
    } catch (error) {
        if (replaced) {
            try {
                if (digest(fs.readFileSync(asarPath)) !== resultHash) {
                    throw new Error('套用後官方包再次改變，保留新檔，不覆蓋還原。');
                }
                let rollbackDir = replacementDir;
                let createdRollbackDir = false;
                if (!rollbackDir) {
                    try {
                        rollbackDir = fs.mkdtempSync(path.join(replacementBase(asarPath, stateDir), '.autolocalize-rb-'));
                        createdRollbackDir = true;
                    } catch {
                        rollbackDir = stageDir;
                    }
                }
                const rollback = path.join(rollbackDir, 'rollback.asar');
                fs.writeFileSync(rollback, original, { flag: 'wx', mode: sourceStat.mode & 0o777 });
                fsyncFile(rollback);
                if (ROOT) setOwnerNoFollow(rollback, { uid: sourceStat.uid, gid: sourceStat.gid });
                try {
                    exchangeCheckedAsar(rollback, asarPath, path.join(rollbackDir, 'rollback-previous.asar'),
                        resultHash, originalHash, exchange);
                } catch (exErr) {
                    if (exErr.concurrentRecovery && createdRollbackDir) {
                        replacementDir = rollbackDir;
                    }
                    throw exErr;
                }
                fsyncDirectory(path.dirname(asarPath));
                if (createdRollbackDir) {
                    try { removeTree(rollbackDir); } catch {}
                }
                sign(appPath, sourceStat, { appStat });
                log('套用未通過，已還原原始 app.asar。');
            } catch (rollbackError) {
                if (rollbackError.concurrentRecovery) {
                    retainReplacementDir = true;
                    log('回退期間官方更新競爭，保留替換前檔案：' + rollbackError.concurrentRecovery);
                }
                // If the rollback itself is denied, preserve the original
                // application bytes in the private watcher state directory.
                // Do not claim success or discard the only recovery source.
                let recoveryPath = '';
                let scheduledRecovery = false;
                try {
                    const recoverSource = rollbackError.concurrentRecovery || original;
                    recoveryPath = savePendingAsarRecovery(appInfo, stateDir, resultHash, recoverSource) || '';
                    scheduledRecovery = Boolean(recoveryPath);
                } catch (saveError) {
                    log('無法建立自動復原紀錄：' + saveError.message);
                    // Retain an original copy when an unexpected failure
                    // prevents the scheduled recovery receipt from being written.
                    try {
                        const recoveryDir = fs.mkdtempSync(path.join(stateDir, 'recovery-'));
                        recoveryPath = path.join(recoveryDir, 'previous-app.asar');
                        fs.writeFileSync(recoveryPath, original, { flag: 'wx', mode: 0o600 });
                        fsyncFile(recoveryPath);
                    } catch (fallbackError) {
                        log('無法保留復原副本：' + fallbackError.message);
                    }
                }
                log('還原／重新簽署失敗，應用程式可能無法正常啟動：' + rollbackError.message +
                    (recoveryPath ? '；原始檔案保留於 ' + recoveryPath +
                        (scheduledRecovery ? '；下次排程將先核對並嘗試恢復。' : '；需要人工處理。') :
                        '；需要人工從有效備份恢復。'));
            }
        }
        throw error;
    } finally {
        if (stageDir) {
            try { removeTree(stageDir); } catch {}
        }
        if (replacementDir && !retainReplacementDir) {
            try { removeTree(replacementDir); } catch {}
        }
        release();
    }
}

function buildWindowsTaskCommand(nodePath, scriptPath) {
    return `"${nodePath}" "${scriptPath}"`;
}

function escapeXml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function isWindowsAdmin(execSyncFn = execFileSync) {
    if (process.platform !== 'win32') return false;
    try {
        execSyncFn('net.exe', ['session'], { stdio: 'ignore', timeout: 3000 });
        return true;
    } catch {
        return false;
    }
}

function buildWindowsTaskXml({ nodePath, scriptPath, workingDir, runLevel = 'LeastPrivilege' }) {
    const command = escapeXml(nodePath);
    const args = escapeXml(`"${scriptPath}"`);
    const cwd = escapeXml(workingDir || path.dirname(scriptPath));
    const safeRunLevel = runLevel === 'HighestAvailable' ? 'HighestAvailable' : 'LeastPrivilege';
    return [
        '<?xml version="1.0" encoding="UTF-16"?>',
        '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
        '  <RegistrationInfo>',
        '    <Description>Antigravity 2.0 繁體中文自動更新守護 (每 5 分鐘檢查並重套中文化)</Description>',
        '  </RegistrationInfo>',
        '  <Triggers>',
        '    <TimeTrigger>',
        '      <Repetition>',
        '        <Interval>PT5M</Interval>',
        '        <StopAtDurationEnd>false</StopAtDurationEnd>',
        '      </Repetition>',
        '      <StartBoundary>2026-01-01T00:00:00</StartBoundary>',
        '      <Enabled>true</Enabled>',
        '    </TimeTrigger>',
        '  </Triggers>',
        '  <Principals>',
        '    <Principal id="Author">',
        '      <LogonType>InteractiveToken</LogonType>',
        `      <RunLevel>${safeRunLevel}</RunLevel>`,
        '    </Principal>',
        '  </Principals>',
        '  <Settings>',
        '    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>',
        '    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>',
        '    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>',
        '    <AllowHardTerminate>true</AllowHardTerminate>',
        '    <StartWhenAvailable>true</StartWhenAvailable>',
        '    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>',
        '    <AllowStartOnDemand>true</AllowStartOnDemand>',
        '    <Enabled>true</Enabled>',
        '    <Hidden>false</Hidden>',
        '    <ExecutionTimeLimit>PT10M</ExecutionTimeLimit>',
        '  </Settings>',
        '  <Actions Context="Author">',
        '    <Exec>',
        `      <Command>${command}</Command>`,
        `      <Arguments>${args}</Arguments>`,
        `      <WorkingDirectory>${cwd}</WorkingDirectory>`,
        '    </Exec>',
        '  </Actions>',
        '</Task>',
        ''
    ].join('\r\n');
}

function encodeUtf16LeWithBom(text) {
    return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
}

function installWindowsTask(options = {}) {
    const execSyncFn = options.execFileSyncFn || execFileSync;
    const nodePath = options.nodePath || process.execPath;
    const scriptPath = options.scriptPath || path.join(DIR, 'auto_localize_watcher.js');
    const taskName = options.taskName || 'AntigravityAutoLocalize';
    const baseDir = options.baseDir || DIR;
    const workingDir = options.workingDir || path.dirname(scriptPath);
    // An elevated task may execute from a user-writable project directory.
    // Always register the background process at ordinary user privilege.
    const runLevel = 'LeastPrivilege';
    const disableFlag = path.join(baseDir, '.disable_autowatcher');

    try {
        if (fs.existsSync(disableFlag)) fs.unlinkSync(disableFlag);
    } catch {}
    // Remove the obsolete three-mode policy after a one-time manual upgrade.
    // Installing the watcher itself is now the sole consent decision.
    try {
        fs.rmSync(path.join(baseDir, '.watcher-state', 'update_policy.json'), { force: true });
    } catch {}

    const taskRun = buildWindowsTaskCommand(nodePath, scriptPath);
    const xmlText = buildWindowsTaskXml({ nodePath, scriptPath, workingDir, runLevel });
    const xmlPath = path.join(os.tmpdir(), `ag_tw_task_${process.pid}_${Date.now()}.xml`);

    console.log('=======================================================');
    console.log('  安裝 Antigravity 背景自動更新守護 (Windows 工作排程)');
    console.log('=======================================================');
    console.log(`[1/2] 正在註冊 Windows 工作排程 (${taskName})，每 5 分鐘自動檢查一次...`);
    try {
        fs.writeFileSync(xmlPath, encodeUtf16LeWithBom(xmlText));
        if (typeof options.onXmlWritten === 'function') {
            options.onXmlWritten(xmlPath, fs.readFileSync(xmlPath));
        }
        execSyncFn('schtasks.exe', ['/create', '/tn', taskName, '/xml', xmlPath, '/f'], {
            encoding: 'utf8',
            stdio: 'inherit'
        });
    } finally {
        try { if (fs.existsSync(xmlPath)) fs.unlinkSync(xmlPath); } catch {}
    }
    console.log('[2/2] 正在立即執行一次繁體中文化檢查...');
    let firstRunWarning = null;
    try {
        execSyncFn('schtasks.exe', ['/run', '/tn', taskName], { encoding: 'utf8', stdio: 'ignore' });
    } catch (err) {
        firstRunWarning = err.message;
    }
    if (firstRunWarning) {
        console.log(`[提示] 排程已註冊完成；立即觸發回報（${firstRunWarning}），將在 5 分鐘內自動巡檢套用。`);
    }
    console.log('\n[完成] Windows 背景自動更新守護已啟動！');
    console.log(`工作名稱：${taskName}`);
    console.log(`執行紀錄：${path.join(baseDir, 'autolocalize.log')}`);
    return { taskName, taskRun, xmlText };
}

function uninstallWindowsTask(options = {}) {
    const execSyncFn = options.execFileSyncFn || execFileSync;
    const taskName = options.taskName || 'AntigravityAutoLocalize';
    const baseDir = options.baseDir || DIR;
    const disableFlag = path.join(baseDir, '.disable_autowatcher');

    console.log('=======================================================');
    console.log('  卸載 Antigravity 背景自動更新守護 (Windows 工作排程)');
    console.log('=======================================================');
    let existed = false;
    let deleted = false;
    try {
        execSyncFn('schtasks.exe', ['/query', '/tn', taskName], { stdio: 'ignore' });
        existed = true;
    } catch {
        existed = false;
    }

    if (existed) {
        console.log(`[1/1] 正在移除工作排程 ${taskName}...`);
        execSyncFn('schtasks.exe', ['/delete', '/tn', taskName, '/f'], {
            encoding: 'utf8',
            stdio: 'inherit'
        });
        deleted = true;
        console.log('[完成] Windows 背景自動守護已卸載！');
    } else {
        console.log(`[提示] 未偵測到已註冊的排程工作 (${taskName})，無須移除。`);
    }
    try {
        fs.writeFileSync(disableFlag, 'disabled\n', 'utf8');
    } catch {}
    return { taskName, existed, deleted };
}

async function refreshTranslationsAndReapply({
    targetDir = DIR,
    stateDir = ensureAccessibleDir(path.join(targetDir, '.watcher-state')),
    updater = autoUpdater,
    currentVersion = getLocalPackageVersion(targetDir),
    execReapplyFn = (dir) => {
        execFileSync(process.execPath, [path.join(dir, 'auto_localize_watcher.js')], {
            cwd: dir,
            stdio: 'inherit',
            timeout: 180000,
            env: { ...process.env, AG_TW_SKIP_TRANSLATION_CHECK: '1' }
        });
    },
    verifyReapplyFn = (version) => {
        const appInfo = getAppInfo();
        if (!appInfo) return false;
        const archive = fs.readFileSync(appInfo.asarPath);
        const meta = extractLocalizationMeta(archive);
        return isLocalized(archive) && meta && meta.translationVersion === version;
    },
    updaterOptions = {}
} = {}) {
    if (!updater || typeof updater.checkUpdate !== 'function') return { updated: false, reason: 'no_updater' };
    if (process.env.AG_TW_SKIP_TRANSLATION_CHECK === '1' || process.env.NODE_ENV === 'test') {
        return { updated: false, reason: 'disabled_by_env' };
    }
    const active = updater && typeof updater.readActiveTranslation === 'function'
        ? updater.readActiveTranslation(targetDir) : null;
    const installedTranslationVersion = active ? active.version : currentVersion;
    const cacheFile = path.join(stateDir, 'update_check.json');
    const res = await updater.checkUpdate({
        currentVersion: installedTranslationVersion,
        cacheFilePath: cacheFile,
        intervalMs: 24 * 60 * 60 * 1000,
        silentNotification: true,
        ...updaterOptions
    });
    if (res && res.error) {
        log('檢查翻譯版本失敗，保留現有資料：' + res.error);
        return { updated: false, reason: 'check_failed', checkResult: res };
    }
    if (!res || !res.hasUpdate) {
        return { updated: false, reason: res && res.skipped ? 'within_interval' : 'up_to_date', checkResult: res };
    }
    log(`新版本 ${res.tag} 已發布，檢查是否提供相容的純翻譯資料包...`);
    if (typeof updater.installTranslationUpdate !== 'function' || !res.release) {
        return { updated: false, reason: 'no_translation_updater', checkResult: res };
    }
    const releaseLock = acquireLock(path.join(stateDir, 'run.lock'));
    if (!releaseLock) {
        return { updated: false, reason: 'locked' };
    }
    let updateRes;
    try {
        updateRes = await updater.installTranslationUpdate({
            targetDir,
            currentEngineVersion: currentVersion,
            release: res.release,
            ...updaterOptions
        });
    } finally {
        releaseLock();
    }
    if (updateRes && updateRes.updated) {
        log(`純翻譯資料包已更新至 v${updateRes.newVersion}，使用原有引擎重新套用繁體中文...`);
        let reapplyExitedSuccessfully = false;
        try {
            execReapplyFn(targetDir);
            reapplyExitedSuccessfully = true;
            if (!verifyReapplyFn(updateRes.newVersion)) {
                throw new Error('守護程序執行完畢，但 app.asar 未載入新版翻譯，不能宣稱套用成功。');
            }
        } catch (error) {
            // Restoring only the pointer is not sufficient: a child can
            // exit successfully while leaving an unexpected ASAR version.
            const rollbackLock = acquireLock(path.join(stateDir, 'run.lock'));
            let restoredPointer = false;
            if (rollbackLock) {
                try {
                    const statePath = path.join(stateDir, 'active_translation.json');
                    let deployed = null;
                    try { deployed = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
                    if (deployed && deployed.version === updateRes.newVersion) {
                        if (active) {
                            const temp = path.join(stateDir, `active_translation.rollback-${process.pid}-${Date.now()}.tmp`);
                            fs.writeFileSync(temp, JSON.stringify({ version: active.version }) + '\n', { flag: 'wx', mode: 0o600 });
                            try { fs.renameSync(temp, statePath); }
                            catch (err) { try { fs.rmSync(temp, { force: true }); } catch {} throw err; }
                        } else {
                            fs.unlinkSync(statePath);
                        }
                        restoredPointer = true;
                        log('套用新版翻譯失敗，已恢復前一版翻譯指標。');
                    }
                } catch (rollbackError) {
                    log('新版翻譯套用失敗，而且翻譯指標回復失敗：' + rollbackError.message);
                } finally {
                    rollbackLock();
                }
            } else {
                log('新版翻譯套用失敗，但無法取得回復鎖定，下一輪須檢查版本狀態。');
            }
            if (restoredPointer) {
                const previousVersion = active ? active.version : currentVersion;
                let previousAsarVerified = false;
                try { previousAsarVerified = Boolean(verifyReapplyFn(previousVersion)); }
                catch (verifyError) {
                    log('無法核對 ASAR 的舊翻譯版本：' + verifyError.message);
                }
                // Only retry an apparently successful child that failed the
                // *postcondition*. If the child itself threw, its own atomic
                // ASAR rollback should have run; avoid a second blind write.
                if (!previousAsarVerified && reapplyExitedSuccessfully) {
                    try {
                        log('ASAR 與已回復的翻譯指標不一致，嘗試以原有引擎重套舊版翻譯...');
                        execReapplyFn(targetDir);
                        previousAsarVerified = Boolean(verifyReapplyFn(previousVersion));
                    } catch (recoveryError) {
                        log('重套舊版翻譯失敗：' + recoveryError.message);
                    }
                }
                if (previousAsarVerified) {
                    log('已核對 ASAR 與舊翻譯版本一致。');
                } else {
                    log('警告：僅恢復翻譯指標，尚未證實 app.asar 已恢復；需人工核對或等待下一輪修復。');
                }
            }
            throw error;
        }
        log(`已完成 v${updateRes.newVersion} 翻譯資料套用；沒有更新程式功能。`);
    } else if (updateRes && updateRes.reason === 'no_translation_only_asset') {
        log(`新版本 ${res.tag} 沒有獨立翻譯包，請手動更新程式功能。`);
        if (typeof updater.notifyMac === 'function') updater.notifyMac('Antigravity 繁體中文化更新', `新版本 ${res.tag} 已發布，程式功能須手動安裝。`);
    } else if (updateRes && updateRes.reason === 'translation_up_to_date') {
        log('目前翻譯資料已是相容的最新版本，略過。');
    }
    return updateRes;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--install-windows-task')) {
        try {
            if (args.some(arg => arg.startsWith('--update-policy'))) {
                throw new Error('守護程序已統一自動更新翻譯，無須更新模式參數。');
            }
            installWindowsTask();
        } catch (err) {
            console.error('[錯誤] 註冊 Windows 背景排程失敗：' + (err.message || err));
            console.error('[提示] 若 Antigravity 安裝在 Program Files 等受保護路徑，請以「系統管理員身分」執行批次檔。');
            process.exitCode = 1;
        }
        return;
    }
    if (args.includes('--uninstall-windows-task')) {
        try {
            uninstallWindowsTask();
        } catch (err) {
            console.error('[錯誤] 移除 Windows 背景排程失敗：' + (err.message || err));
            process.exitCode = 1;
        }
        return;
    }

    try {
        if (fs.existsSync(path.join(DIR, '.disable_autowatcher'))) return;
        rotateLogs();
        const appInfo = getAppInfo();
        if (!appInfo) { log('尚未找到 Antigravity，等待下次排程。'); return; }
        checkAndLocalizeApp(appInfo);

        // 安裝守護即同意翻譯資料自動更新；程式碼升級仍由使用者手動處理。
        await refreshTranslationsAndReapply().catch(err => {
            log('翻譯資料更新失敗，保留目前版本：' + (err && err.message ? err.message : err));
            // Do not report scheduler success after a failed translation
            // install/reapply. The next scheduled run still retries safely.
            process.exitCode = 1;
        });
    } catch (error) {
        log('自動繁中化失敗，稍後重試：' + (error.stack || error.message));
        if (IS_MAC && (error.code === 'EPERM' || (error.message && error.message.includes('EPERM')))) {
            notifyMacUser('Antigravity 繁中化', '因 macOS 系統權限或 App 管理限制，自動覆寫受阻；請在專案中執行「點兩下安裝繁體中文」或於系統設定授權。');
        } else if (process.platform === 'win32' && (error.code === 'EPERM' || error.code === 'EACCES' || (error.message && (error.message.includes('EPERM') || error.message.includes('EACCES'))))) {
            log('因 Windows 資料夾權限限制（例如 Program Files），最低權限排程無法自動覆寫。請依安裝手冊以管理員身分手動重新套用中文化；重新安裝守護不會提高背景排程權限。');
        }
        process.exitCode = 1;
    }
}

if (require.main === module) main();
module.exports = {
    checkAndLocalizeApp,
    resumePendingAsarRecovery,
    exchangeAsar,
    exchangeCheckedAsar,
    waitForStableFile,
    rotateLogs,
    acquireLock,
    setOwnerNoFollow,
    forEachChildNoFollow,
    isLocalized,
    digest,
    safeReplaceFile,
    recipeHash,
    ensureAccessibleDir,
    getWindowsAppCandidates,
    getAppInfo,
    buildWindowsTaskCommand,
    buildWindowsTaskXml,
    encodeUtf16LeWithBom,
    installWindowsTask,
    uninstallWindowsTask,
    compareVersions,
    extractLocalizationMeta,
    getLocalPackageVersion,
    refreshTranslationsAndReapply,
    cleanStaleStageDirs,
    cleanElectronCache,
    writeStateFile,
    replacementBase,
    exchangeInResources,
    signApp
};
