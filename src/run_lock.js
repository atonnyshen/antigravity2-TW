'use strict';

// 守護程式與安裝器共用的目錄鎖。
// - <鎖>/pid 只放程序編號：v3.8.0 與更早的守護程式、安裝器都以 Number() 讀取。
// - <鎖>/token 放這次取得的隨機識別碼；持有期間定時更新它的時間戳記當作心跳。
// - 只有在持有程序已不存在、只剩空目錄超過 30 秒，或心跳停止超過 staleMs 時，才視為殘留。
//   程序存在但心跳停止：程序編號被重用，或持有者已卡住。慢速下載仍會持續心跳，不會被誤判。
// - 回收時先把鎖目錄改名移開，確認移走的正是要刪的那一把才刪除；移錯就放回原處，
//   避免確認後、刪除前，另一個程序已回收並建立新鎖，結果被按路徑刪掉。
// - 釋放前先確認鎖仍屬於自己；已被接手就不碰，不把別人的鎖移開（移開的空檔會讓第三個程序取得鎖）。
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

function removeIfMatches(lockPath, matches) {
    const moved = `${lockPath}.${process.pid}-${crypto.randomBytes(4).toString('hex')}.removing`;
    try {
        fs.renameSync(lockPath, moved);
    } catch (error) {
        return error.code === 'ENOENT';
    }
    let stat = null;
    try { stat = fs.lstatSync(moved); } catch {}
    if (stat && matches(readOwner(moved), stat)) {
        try { fs.rmSync(moved, { recursive: true, force: true }); } catch {}
        return true;
    }
    // 移走的是另一個程序剛建立的鎖：放回原處。原處若已有更新的鎖，這把已經失效，直接清掉
    try {
        fs.renameSync(moved, lockPath);
    } catch {
        try { fs.rmSync(moved, { recursive: true, force: true }); } catch {}
    }
    return false;
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

function chownDirNoFollow(dir, owner) {
    if (!owner) return;
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_DIRECTORY || 0);
    let fd;
    try { fd = fs.openSync(dir, flags); } catch { return; }
    try { fs.fchownSync(fd, owner.uid, owner.gid); } catch {} finally { fs.closeSync(fd); }
}

function holdLock(lockPath, token, heartbeatMs) {
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
                fs.utimesSync(tokenFile, now, now);
            } catch {}
        }, heartbeatMs);
        if (typeof timer.unref === 'function') timer.unref();
    }
    const release = () => {
        if (timer) clearInterval(timer);
        // 鎖已被回收、換成別人的：不碰
        if (!held()) return;
        removeIfMatches(lockPath, current => current.token === token);
    };
    release.held = held;
    return release;
}

// 取得鎖時回傳釋放函式（附 held() 可確認鎖仍屬於自己）；鎖被其他程序持有時回傳 null。
// owner：root 建立的鎖要交給哪個使用者（{ uid, gid }），一般執行時不需要
function acquire(lockPath, { staleMs = STALE_MS, heartbeatMs = HEARTBEAT_MS, owner = null } = {}) {
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
            removeIfMatches(lockPath, (current, currentStat) => sameLock(current, currentStat, seen, stat));
            continue;
        }
        const token = crypto.randomBytes(12).toString('hex');
        try {
            writeOwnedFile(path.join(lockPath, 'pid'), String(process.pid), owner);
            writeOwnedFile(path.join(lockPath, 'token'), token, owner);
        } catch (error) {
            // 目錄在建立途中被其他程序換掉或移走：這把鎖不屬於自己，不能刪
            if (error.code === 'EEXIST' || error.code === 'ENOENT') return null;
            throw error;
        }
        chownDirNoFollow(lockPath, owner);
        return holdLock(lockPath, token, heartbeatMs);
    }
    return null;
}

module.exports = { acquire, readOwner, removeIfMatches, STALE_MS, HEARTBEAT_MS, LEGACY_STALE_MS };
