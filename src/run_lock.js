'use strict';

// 守護程式與安裝器共用的目錄鎖。
// - <鎖>/pid 只放程序編號：v3.8.0 與更早的守護程式、安裝器都以 Number() 讀取。
// - <鎖>/token 放這次取得的隨機識別碼；持有期間定時更新它的時間戳記當作心跳。
// - 只有在持有程序已不存在、只剩空目錄超過 30 秒，或心跳停止超過 staleMs 時，才視為殘留。
//   程序存在但心跳停止：程序編號被重用，或持有者已卡住。慢速下載仍會持續心跳，不會被誤判。
// - 刪除鎖（回收殘留鎖、釋放自己的鎖）一律先取得 <鎖>.guard，在 guard 內重新讀取、確認後才刪。
//   同一時間只有一個程序能刪鎖，新鎖又只能在鎖不存在時建立，所以確認之後到刪除之前，鎖不會被換掉。
//   v3.8.1 先把鎖目錄改名移開再核對：兩個回收者處理同一把殘留鎖時，後到的一方可能移走另一方剛建立的新鎖，
//   第三個程序趁空檔建立鎖，新鎖放不回原處而被刪掉，結果兩個程序都以為自己持有鎖。
// - root 在使用者可寫的目錄裡建立或刪除鎖檔時（owner 有值，或以 root 刪除），先確認鎖目錄不是連結、
//   仍是同一個目錄，再以相對名稱操作，不會被導向連結指向的系統目錄。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 同步工作（重新簽章、複製檔案）與系統睡眠期間計時器不會觸發，心跳跟著暫停：
// 門檻取 30 分鐘，持有者暫停不滿 30 分鐘時不會被接手
const STALE_MS = 30 * 60 * 1000;
const HEARTBEAT_MS = 30 * 1000;
const INCOMPLETE_MS = 30 * 1000;
// v3.8.0 與更早版本建立的鎖沒有 token，也不會心跳：持有程序還在時從寬認定，只在停留超過這個時間才回收，
// 避免升級當下正在慢速下載的舊守護程式被誤判
const LEGACY_STALE_MS = 2 * 60 * 60 * 1000;
// guard 只在幾個同步的檔案操作期間存在；停留超過一分鐘，表示持有者在這段期間被強制結束
const GUARD_STALE_MS = 60 * 1000;
const GUARD_WAIT_MS = 1000;

function readOwner(lockPath) {
    const owner = { pid: NaN, token: null, beatMs: NaN };
    try { owner.pid = Number(fs.readFileSync(path.join(lockPath, 'pid'), 'utf8')); } catch {}
    try {
        const tokenFile = path.join(lockPath, 'token');
        owner.token = fs.readFileSync(tokenFile, 'utf8').trim() || null;
        owner.beatMs = fs.statSync(tokenFile).mtimeMs;
    } catch {}
    return owner;
}

function pidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error.code !== 'ESRCH';
    }
}

function isStale(owner, stat, staleMs, now) {
    if (!Number.isInteger(owner.pid) || owner.pid <= 0) return now - stat.mtimeMs > INCOMPLETE_MS;
    if (!pidAlive(owner.pid)) return true;
    // 舊版程式建立的鎖沒有 token，以目錄時間代替心跳
    if (!owner.token) return now - stat.mtimeMs > Math.max(staleMs, LEGACY_STALE_MS);
    const beat = Number.isFinite(owner.beatMs) ? owner.beatMs : stat.mtimeMs;
    return now - beat > staleMs;
}

function sameLock(owner, stat, seen, seenStat) {
    if (owner.token || seen.token) return owner.token === seen.token;
    return stat.ino === seenStat.ino && Object.is(owner.pid, seen.pid);
}

function runningAsRoot() {
    return typeof process.getuid === 'function' && process.getuid() === 0;
}

function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// 取得 <鎖>.guard 後執行 fn，結束時移除 guard；等不到 guard 時回傳 false，不執行 fn
function withGuard(lockPath, fn) {
    const guard = lockPath + '.guard';
    const deadline = Date.now() + GUARD_WAIT_MS;
    for (;;) {
        try {
            fs.mkdirSync(guard, { mode: 0o700 });
            break;
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
        }
        let removed = false;
        try {
            // guard 一律是空目錄：rmdir 不跟隨連結，也刪不掉有內容的目錄
            const stat = fs.lstatSync(guard);
            if (stat.isDirectory() && Date.now() - stat.mtimeMs > GUARD_STALE_MS) {
                fs.rmdirSync(guard);
                removed = true;
            }
        } catch {}
        if (Date.now() >= deadline) return false;
        if (!removed) sleepSync(10);
    }
    try {
        fn();
    } finally {
        try { fs.rmdirSync(guard); } catch {}
    }
    return true;
}

function movedError(dir) {
    const error = new Error('鎖目錄已被替換：' + dir);
    error.code = 'ELOCKMOVED';
    return error;
}

// 以不跟隨連結的方式開啟目錄，check 通過後切換工作目錄、確認仍是同一個目錄，再執行 fn(目錄代碼)。
// fn 只能使用相對名稱；目錄在檢查後被換成連結時，相對名稱仍落在原本那個目錄裡。
// 結束時切回原本的工作目錄並確認仍是進入前那一個，巢狀使用時外層的相對名稱不會被導向別處
function inDirNoFollow(dir, check, fn) {
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_DIRECTORY || 0);
    const fd = fs.openSync(dir, flags);
    let previous = null;
    let before = null;
    try {
        const expected = fs.fstatSync(fd);
        if (!expected.isDirectory() || !check(expected)) throw movedError(dir);
        before = fs.statSync('.');
        previous = process.cwd();
        process.chdir(dir);
        const here = fs.statSync('.');
        if (here.dev !== expected.dev || here.ino !== expected.ino) throw movedError(dir);
        return fn(fd);
    } finally {
        fs.closeSync(fd);
        if (previous !== null) {
            try { process.chdir(previous); } catch {}
            const after = fs.statSync('.');
            if (after.dev !== before.dev || after.ino !== before.ino) throw movedError(previous);
        }
    }
}

// 刪除已確認的鎖目錄。root 只刪目錄裡的檔案再移除空目錄，不遞迴進入子目錄，
// 避免使用者在刪除途中把子目錄換成連結，導向系統檔案
function removeLockDir(lockPath, stat, careful) {
    if (!careful) {
        fs.rmSync(lockPath, { recursive: true, force: true });
        return true;
    }
    try {
        inDirNoFollow(lockPath, st => st.dev === stat.dev && st.ino === stat.ino, () => {
            for (const name of fs.readdirSync('.')) {
                try { fs.unlinkSync(name); } catch {}
            }
        });
        fs.rmdirSync(lockPath);
        return true;
    } catch {
        return false;
    }
}

// 在 guard 內重新讀取目前的鎖，matches 成立才刪除。回傳 true：已刪除，或鎖已不存在
function removeIfMatches(lockPath, matches, { owner = null } = {}) {
    let done = false;
    const entered = withGuard(lockPath, () => {
        let stat;
        try {
            stat = fs.lstatSync(lockPath);
        } catch (error) {
            if (error.code === 'ENOENT') done = true;
            return;
        }
        if (!stat.isDirectory() || !matches(readOwner(lockPath), stat)) return;
        done = removeLockDir(lockPath, stat, Boolean(owner) || runningAsRoot());
    });
    return entered && done;
}

// 以檔案代碼寫入並變更擁有者，不經由路徑，避免寫入後被換成連結
function writeOwnedFile(file, content, owner) {
    const fd = fs.openSync(file, 'wx', 0o644);
    try {
        fs.writeSync(fd, content);
        if (owner) {
            try { fs.fchownSync(fd, owner.uid, owner.gid); } catch {}
        }
    } finally {
        fs.closeSync(fd);
    }
}

// 在剛建立的鎖目錄寫入 pid 與 token。owner 有值時（root 在使用者可寫的目錄裡），
// 確認鎖目錄不是連結、是自己剛建立的空目錄，再以相對名稱寫入，最後把目錄交給 owner。
// parent 有值時（呼叫端核對過的上層目錄），以「..」確認鎖目錄建在那個目錄裡：上層路徑在檢查後被換成連結時，
// mkdir 會把鎖目錄建到連結指向的位置，這時不寫入、不交出擁有者
function writeLockFiles(lockPath, token, owner, parent = null) {
    if (!owner && !parent) {
        writeOwnedFile(path.join(lockPath, 'pid'), String(process.pid), null);
        writeOwnedFile(path.join(lockPath, 'token'), token, null);
        return;
    }
    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    inDirNoFollow(lockPath, st => uid === null || st.uid === uid, fd => {
        if (parent) {
            const up = fs.statSync('..');
            if (up.dev !== parent.dev || up.ino !== parent.ino) throw movedError(lockPath);
        }
        if (fs.readdirSync('.').length > 0) throw movedError(lockPath);
        writeOwnedFile('pid', String(process.pid), owner);
        writeOwnedFile('token', token, owner);
        if (owner) {
            try { fs.fchownSync(fd, owner.uid, owner.gid); } catch {}
        }
    });
}

function holdLock(lockPath, token, heartbeatMs, owner) {
    const tokenFile = path.join(lockPath, 'token');
    const held = () => readOwner(lockPath).token === token;
    let timer = null;
    if (heartbeatMs > 0) {
        timer = setInterval(() => {
            try {
                if (!held()) {
                    clearInterval(timer);
                    return;
                }
                const now = new Date();
                fs.lutimesSync(tokenFile, now, now);
            } catch {}
        }, heartbeatMs);
        if (typeof timer.unref === 'function') timer.unref();
    }
    const release = () => {
        if (timer) clearInterval(timer);
        // 鎖已被回收、換成別人的：不碰。guard 內會再確認一次
        if (!held()) return;
        removeIfMatches(lockPath, current => current.token === token, { owner });
    };
    release.held = held;
    return release;
}

// 取得鎖時回傳釋放函式（附 held() 可確認鎖仍屬於自己）；鎖被其他程序持有時回傳 null。
// owner：root 建立的鎖要交給哪個使用者（{ uid, gid }），一般執行時不需要。
// parent：鎖目錄必須位於的上層目錄（{ dev, ino }），root 在使用者的目錄裡建立鎖時使用
function acquire(lockPath, { staleMs = STALE_MS, heartbeatMs = HEARTBEAT_MS, owner = null, parent = null } = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            fs.mkdirSync(lockPath, { mode: 0o755 });
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            let stat;
            try {
                stat = fs.lstatSync(lockPath);
            } catch (statError) {
                if (statError.code === 'ENOENT') continue;
                throw statError;
            }
            if (!stat.isDirectory()) throw new Error('鎖定路徑不是一般目錄：' + lockPath);
            const seen = readOwner(lockPath);
            if (!isStale(seen, stat, staleMs, Date.now())) return null;
            // 判定殘留之後，另一個回收者可能已刪掉它並建立新鎖：在 guard 內確認仍是同一把、仍是殘留才刪
            removeIfMatches(lockPath, (current, currentStat) =>
                sameLock(current, currentStat, seen, stat) && isStale(current, currentStat, staleMs, Date.now()),
            { owner });
            continue;
        }
        const token = crypto.randomBytes(12).toString('hex');
        try {
            writeLockFiles(lockPath, token, owner, parent);
        } catch (error) {
            // 目錄在建立途中被其他程序換掉或移走：這把鎖不屬於自己，不能刪
            if (['EEXIST', 'ENOENT', 'ELOCKMOVED', 'ELOOP', 'ENOTDIR'].includes(error.code)) return null;
            throw error;
        }
        return holdLock(lockPath, token, heartbeatMs, owner);
    }
    return null;
}

module.exports = {
    acquire, readOwner, removeIfMatches, inDirNoFollow, pidAlive,
    STALE_MS, HEARTBEAT_MS, LEGACY_STALE_MS, GUARD_STALE_MS
};
