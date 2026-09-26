#!/usr/bin/env node
/**
 * Antigravity IDE 自動版本變化監控、自癒與繁體中文化守護程式 (v3.1 桌面版專用)
 * 支援 macOS 與 Windows
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const DIR = __dirname;
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

const LOG_FILE = path.join(DIR, 'autolocalize.log');
const LOCK_FILE = path.join(os.tmpdir(), 'antigravity-autolocalize.lock');
const STABLE_SAMPLE_COUNT = 3;
const STABLE_SAMPLE_INTERVAL_MS = 1000;
const STABLE_WAIT_TIMEOUT_MS = 30000;

function log(msg) {
    const time = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    const line = `[${time}] ${msg}`;
    console.log(line);
    // 終端機互動執行時手動寫入檔案；若在 launchd 下（非 TTY 且輸出已被重定向至日誌檔）避免雙重寫入
    if (process.stdout.isTTY) {
        try {
            fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
        } catch (e) {}
    }
}

function sleepMs(milliseconds) {
    const shared = new SharedArrayBuffer(4);
    Atomics.wait(new Int32Array(shared), 0, 0, milliseconds);
}

function waitForStableFile(filePath) {
    const deadline = Date.now() + STABLE_WAIT_TIMEOUT_MS;
    let previous = null;
    let stableSamples = 0;

    while (Date.now() <= deadline) {
        try {
            const stat = fs.statSync(filePath);
            const current = `${stat.size}:${stat.mtimeMs}:${stat.ino || ''}`;
            if (current === previous) {
                stableSamples++;
            } else {
                previous = current;
                stableSamples = 1;
            }
            if (stableSamples >= STABLE_SAMPLE_COUNT) return true;
        } catch (e) {
            stableSamples = 0;
            previous = null;
        }
        sleepMs(STABLE_SAMPLE_INTERVAL_MS);
    }
    return false;
}

function acquireRunLock() {
    try {
        const fd = fs.openSync(LOCK_FILE, 'wx');
        fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
        return fd;
    } catch (e) {
        if (e.code === 'EEXIST') {
            try {
                const stat = fs.statSync(LOCK_FILE);
                const stale = Date.now() - stat.mtimeMs > 2 * 60 * 60 * 1000;
                if (stale) {
                    fs.unlinkSync(LOCK_FILE);
                    const fd = fs.openSync(LOCK_FILE, 'wx');
                    fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
                    return fd;
                }
            } catch (staleError) {}
            log('ℹ️ 已有另一個自動中文化程序執行中，略過本次觸發。');
            return null;
        }
        log(`⚠️ 無法建立自動中文化互斥鎖，略過本次觸發: ${e.message}`);
        return null;
    }
}

function releaseRunLock(fd) {
    if (fd === null || fd === undefined) return;
    try { fs.closeSync(fd); } catch (e) {}
    try { fs.unlinkSync(LOCK_FILE); } catch (e) {}
}

function canWriteTarget(appInfo) {
    if (!IS_MAC || (process.getuid && process.getuid() === 0)) return true;
    const probe = path.join(path.dirname(appInfo.asarPath), `.autolocalize-write-test-${process.pid}`);
    try {
        const fd = fs.openSync(probe, 'wx');
        fs.closeSync(fd);
        fs.unlinkSync(probe);
        return true;
    } catch (e) {
        try { fs.unlinkSync(probe); } catch (cleanupError) {}
        log('⚠️ 目前是使用者層 LaunchAgent，無法寫入 /Applications 中的 Antigravity。已略過本次建置；請用「點兩下安裝macOS背景守護.command」改裝系統級 LaunchDaemon。');
        return false;
    }
}

function notify(title, message) {
    try {
        if (IS_MAC) {
            const safeTitle = title.replace(/"/g, '\\"');
            const safeMsg = message.replace(/"/g, '\\"');
            const osaCmd = `display notification "${safeMsg}" with title "${safeTitle}" sound name "Glass"`;
            // 若以 root (LaunchDaemon) 執行，透過 launchctl asuser 委派給當前 GUI 登入使用者顯示通知
            if (process.getuid && process.getuid() === 0) {
                try {
                    const consoleUser = execSync('stat -f%Su /dev/console', { encoding: 'utf8' }).trim();
                    if (consoleUser && consoleUser !== 'root') {
                        const uid = execSync(`id -u "${consoleUser}"`, { encoding: 'utf8' }).trim();
                        execSync(`launchctl asuser "${uid}" osascript -e '${osaCmd}'`);
                        return;
                    }
                } catch (e) {}
            }
            execSync(`osascript -e '${osaCmd}'`);
        } else if (IS_WIN) {
            const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$template = [Windows.UI.Notifications.ToastTemplateType]::ToastText02
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($template)
$textNodes = $xml.GetElementsByTagName("text")
$textNodes.Item(0).AppendChild($xml.CreateTextNode("${title}")) | Out-Null
$textNodes.Item(1).AppendChild($xml.CreateTextNode("${message}")) | Out-Null
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Antigravity")
$notifier.Show([Windows.UI.Notifications.ToastNotification]::new($xml))
`;
            execSync(`powershell -WindowStyle Hidden -Command "${psScript.replace(/\r?\n/g, ' ')}"`, { stdio: 'ignore' });
        }
    } catch (e) {}
}

function getCustomEnv() {
    const nodeDir = path.dirname(process.execPath);
    const extraPaths = IS_MAC
        ? ['/usr/local/bin', '/opt/homebrew/bin', '/opt/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
        : [];
    const currentPaths = (process.env.PATH || '').split(path.delimiter);
    const combined = Array.from(new Set([nodeDir, ...extraPaths, ...currentPaths])).filter(Boolean);
    return Object.assign({}, process.env, {
        PATH: combined.join(path.delimiter)
    });
}

function getUserHome() {
    if (IS_MAC && process.getuid && process.getuid() === 0) {
        try {
            const consoleUser = execSync('stat -f%Su /dev/console', { encoding: 'utf8' }).trim();
            if (consoleUser && consoleUser !== 'root') {
                return path.join('/Users', consoleUser);
            }
        } catch (e) {}
    }
    return os.homedir();
}

function getAppInfo() {
    if (IS_MAC) {
        const userHome = getUserHome();
        const macCandidates = [
            '/Applications/Antigravity.app',
            '/Applications/Antigravity IDE.app',
            path.join(userHome, 'Applications', 'Antigravity.app'),
            path.join(userHome, 'Applications', 'Antigravity IDE.app')
        ];
        for (const cand of macCandidates) {
            const asarPath = path.join(cand, 'Contents', 'Resources', 'app.asar');
            if (fs.existsSync(asarPath)) {
                const appSupport = path.join(userHome, 'Library', 'Application Support', 'Antigravity');
                return { appPath: cand, asarPath, appSupport };
            }
        }
        const defaultApp = '/Applications/Antigravity.app';
        const defaultAsar = path.join(defaultApp, 'Contents', 'Resources', 'app.asar');
        const defaultSupport = path.join(userHome, 'Library', 'Application Support', 'Antigravity');
        return { appPath: defaultApp, asarPath: defaultAsar, appSupport: defaultSupport };
    } else if (IS_WIN) {
        const candidates = [
            process.env.ANTIGRAVITY_INSTALL_DIR,
            process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'antigravity') : null,
            'C:\\Program Files\\Antigravity',
            'C:\\Programs\\Antigravity'
        ].filter(Boolean);

        for (const c of candidates) {
            const asar = path.join(c, 'resources', 'app.asar');
            if (fs.existsSync(asar)) {
                const appSupport = process.env.APPDATA ? path.join(process.env.APPDATA, 'Antigravity') : null;
                return { appPath: c, asarPath: asar, appSupport };
            }
        }
        return { appPath: null, asarPath: null, appSupport: null };
    }
    return { appPath: null, asarPath: null, appSupport: null };
}

function cleanElectronCache(appSupportDir) {
    if (!appSupportDir || !fs.existsSync(appSupportDir)) return;
    const cacheDirs = ['Cache', 'Code Cache', 'GPUCache', 'DawnWebGPUCache', 'DawnGraphiteCache'];
    let cleaned = 0;
    for (const cName of cacheDirs) {
        const target = path.join(appSupportDir, cName);
        if (fs.existsSync(target)) {
            try {
                fs.rmSync(target, { recursive: true, force: true });
                cleaned++;
            } catch (e) {}
        }
    }
    if (cleaned > 0) {
        log(`🧹 已自動清理 ${cleaned} 個 Electron 快取目錄，防止舊版 bytecode 殘留。`);
    }
}

function checkAndLocalizeApp(appInfo) {
    const { appPath, asarPath, appSupport } = appInfo;
    if (!asarPath || !fs.existsSync(asarPath)) {
        return false;
    }

    // 等待 ShipIt 的原子替換及寫入完成；只延遲小檔案不足以避免競爭。
    if (!waitForStableFile(asarPath)) {
        log('⚠️ app.asar 在 30 秒內沒有達到穩定狀態，延後到下次 launchd 觸發再處理。');
        return false;
    }

    const asarBuf = fs.readFileSync(asarPath);
    const needle = Buffer.from('命令選擇區', 'utf8');
    const isLocalized = asarBuf.indexOf(needle) !== -1;

    if (!isLocalized) {
        log('⚡ 偵測到 Antigravity 官方更新（新版英文官方包），啟動自動中文化流程...');

        if (!canWriteTarget(appInfo)) return false;

        const bakAsar = asarPath + '.bak';
        try {
            fs.copyFileSync(asarPath, bakAsar);
            log('📦 已將最新官方英文版原檔備份至 app.asar.bak');
        } catch (e) {
            log(`⚠️ 備份 app.asar.bak 提示: ${e.message}`);
        }

        // 使用系統臨時目錄建立隔離暫存建置環境，避免污染 git 工作目錄
        const stageDir = path.join(os.tmpdir(), `antigravity_staging_${Date.now()}`);
        if (fs.existsSync(stageDir)) {
            try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch (e) {}
        }
        fs.mkdirSync(stageDir, { recursive: true });

        const stageAsar = path.join(stageDir, 'app.asar');
        fs.copyFileSync(asarPath, stageAsar);

        const unpackedDir = asarPath + '.unpacked';
        if (fs.existsSync(unpackedDir)) {
            const stageUnpacked = stageAsar + '.unpacked';
            try {
                fs.cpSync(unpackedDir, stageUnpacked, { recursive: true });
            } catch (e) {
                log(`⚠️ 複製 app.asar.unpacked 提示: ${e.message}`);
            }
        }

        const engineScript = path.join(DIR, 'localization_engine.js');
        const customEnv = getCustomEnv();

        try {
            execSync(`"${process.execPath}" "${engineScript}" --tw --brand-title english --install-dir "${stageDir}" --no-kill`, {
                cwd: DIR,
                stdio: 'inherit',
                env: customEnv
            });
        } catch (buildErr) {
            log(`❌ 暫存建置失敗，取消置換以保護原始檔案完整性: ${buildErr.message}`);
            try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch (e) {}
            return false;
        }

        if (!fs.existsSync(stageAsar)) {
            log('❌ 暫存建置未產出 app.asar，取消置換。');
            try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch (e) {}
            return false;
        }

        const stageBuf = fs.readFileSync(stageAsar);
        if (stageBuf.indexOf(needle) === -1) {
            log('❌ 暫存 app.asar 未包含繁中特徵詞，取消置換。');
            try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch (e) {}
            return false;
        }

        let replaced = false;
        const tmpAsar = asarPath + '.tmp';

        // 嘗試方式 1: 直接檔案系統原子置換 (適用於具寫入權限或位於 ~/Applications 之情境)
        try {
            if (fs.existsSync(tmpAsar)) {
                try { fs.unlinkSync(tmpAsar); } catch (e) {}
            }
            fs.copyFileSync(stageAsar, tmpAsar);
            fs.renameSync(tmpAsar, asarPath);
            replaced = true;
            log('✅ 繁體中文 app.asar 原子置換完成 (標準檔案系統存取)。');
        } catch (copyErr) {
            log(`⚠️ 直接置換受限 (${copyErr.code || copyErr.message})，正在嘗試特權或系統指令備援...`);
        }

        // 嘗試方式 2: 若直接置換失敗且為 macOS，嘗試 root cp 或 osascript 管理員授權提權
        if (!replaced && IS_MAC) {
            try {
                if (process.getuid && process.getuid() === 0) {
                    execSync(`cp -f "${stageAsar}" "${asarPath}"`);
                    replaced = true;
                    log('✅ 繁體中文 app.asar 置換完成 (Root LaunchDaemon 權限)。');
                } else if (process.stdout.isTTY) {
                    log('⚡ 調用 macOS 原生授權對話框以完成 /Applications 應用程式更新...');
                    const prompt = 'Antigravity IDE 官方版本更新，正在為新版本套用繁體中文化。請授權以替換語言套件：';
                    const shellCmd = `cp -f "${stageAsar}" "${asarPath}" && (xattr -d -r com.apple.quarantine "${appPath}" 2>/dev/null || true) && (codesign --force --deep --sign - "${appPath}" 2>/dev/null || true)`;
                    const escapedShellCmd = shellCmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    const osaScript = `do shell script "${escapedShellCmd}" with prompt "${prompt}" with administrator privileges`;
                    execSync(`osascript -e "${osaScript.replace(/"/g, '\\"')}"`);
                    replaced = true;
                    log('✅ 繁體中文 app.asar 置換完成 (管理員授權提權)。');
                } else {
                    log('❌ 背景 LaunchAgent 沒有管理員權限，未嘗試開啟互動式授權對話框。');
                }
            } catch (privErr) {
                log(`❌ 管理員授權或系統指令置換失敗: ${privErr.message}`);
            }
        }

        try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch (e) {}
        cleanElectronCache(appSupport);

        if (IS_MAC && appPath && replaced) {
            try {
                execSync(`xattr -d -r com.apple.quarantine "${appPath}" 2>/dev/null || true`);
                execSync(`codesign --force --deep --sign - "${appPath}" 2>/dev/null || true`);
                log('✅ 已完成 macOS ad-hoc 程式碼簽署並移除隔離屬性。');
            } catch (e) {
                log(`⚠️ 程式碼簽署提示: ${e.message}`);
            }
        }

        if (replaced) {
            log('🎉 Antigravity 自動繁體中文化全流程處理完畢！');
            notify('Antigravity 自動中文化', '偵測到 Antigravity IDE 官方更新，已自動為新版本完成繁中化！請重啟應用程式生效。');
            return true;
        } else {
            log('❌ 未能成功置換 app.asar，繁中化未套用。');
            return false;
        }
    }
    return false;
}

function main() {
    if (fs.existsSync(path.join(DIR, '.disable_autowatcher'))) {
        log('ℹ️ 偵測到停用標記檔 (.disable_autowatcher)，略過本次自動檢查。');
        return;
    }
    const lockFd = acquireRunLock();
    if (lockFd === null) return;
    try {
        const appInfo = getAppInfo();
        checkAndLocalizeApp(appInfo);
    } catch (err) {
        log(`❌ 自動中文化監控執行異常: ${err.message}`);
        process.exitCode = 1;
    } finally {
        releaseRunLock(lockFd);
    }
}

main();
