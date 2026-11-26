const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const child_process = require('child_process');

const { readAsarLayout, patchAsarArchive, validateAsarCandidate } = require('./src/asar_patcher');
const { validateRuntimeRulesObject } = require('./src/rules_schema');
const runLock = require('./src/run_lock');
const {
    patchPreloadJs,
    patchUtilsJs,
    patchMenuJs,
    patchTrayJs,
    patchLoadingOverlayJs,
    patchUpdaterJs,
    patchMainJs,
    patchIpcHandlersJs,
    patchRemoteManagerJs,
    patchSshPromptsJs,
    patchDeviceChooserJs,
    patchWebauthnJs,
    patchWebviewPopupSecurityJs,
    patchProvisionSplashJs,
    patchWizardHtmlJs,
    patchSshErrorTextJs,
    patchRemoteDisconnectedPageJs,
    patchRemoteSignInCallbackJs,
    patchBrowserStreamCapturePageJs,
    patchCablev2Js,
    patchQrEncoderJs,
    patchComputerHudJs,
    patchComputerHudStateJs,
    patchComputerHudAgentsJs,
    patchRemoteTextJs,
    REMOTE_TEXT_TABLES
} = require('./src/main_patches');

function checkSupportedNodeVersion() {
    var parts = String((typeof process !== 'undefined' && process.versions && process.versions.node) || '0.0.0').split('.');
    var major = parseInt(parts[0], 10) || 0;
    var minor = parseInt(parts[1], 10) || 0;
    if (major < 20) {
        console.error(USE_TW
            ? '[錯誤] 目前 Node.js 版本過舊 (' + process.versions.node + ')，無法解析 Antigravity 2.x 現代語法（例如 Optional Chaining `?.`）。請安裝 Node.js 22.12.0 以上版本，並確認終端機 PATH 優先指向新版 node。'
            : '[错误] 当前 Node.js 版本过低 (' + process.versions.node + ')，无法校验 Antigravity 2.x 现代语法（如 Optional Chaining `?.`）。请安装 Node.js 22.12.0 及以上版本，并确认终端 PATH 优先指向新版 node。');
        return false;
    }
    if (major < 22 || (major === 22 && minor < 12)) {
        console.warn(USE_TW
            ? '[警告] 偵測到 Node.js 版本為 ' + process.versions.node + '（建議使用 22.12.0 以上版本以獲得完整相容性）。'
            : '[警告] 检测到 Node.js 版本为 ' + process.versions.node + '（建议使用 22.12.0 及以上版本以获得完整兼容性）。');
    }
    return true;
}

// macOS 环境下自动补全 PATH，确保 codesign 等工具能被顺利找到
if (process.platform === 'darwin') {
    let realHome = os.homedir();
    if (process.env.SUDO_USER && process.env.SUDO_USER !== 'root') {
        const sudoHome = path.join('/Users', process.env.SUDO_USER);
        if (fs.existsSync(sudoHome)) realHome = sudoHome;
    }
    const extraPaths = [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin',
        '/opt/local/bin',
        path.join(realHome, '.volta', 'bin'),
        path.join(realHome, '.asdf', 'shims'),
        path.join(realHome, '.local', 'share', 'mise', 'shims'),
        path.join(realHome, '.local', 'bin'),
        path.join(realHome, '.fnm', 'current', 'bin'),
        path.join(realHome, '.local', 'share', 'fnm', 'aliases', 'default', 'bin'),
        path.join(realHome, 'Library', 'Application Support', 'fnm', 'aliases', 'default', 'bin')
    ];
    const nvmVersionsDir = path.join(realHome, '.nvm', 'versions', 'node');
    if (fs.existsSync(nvmVersionsDir)) {
        try {
            const versions = fs.readdirSync(nvmVersionsDir).sort();
            for (const v of versions) {
                extraPaths.push(path.join(nvmVersionsDir, v, 'bin'));
            }
        } catch (e) {}
    }
    const currentPaths = (process.env.PATH || '').split(':');
    for (const p of extraPaths) {
        if (!currentPaths.includes(p) && fs.existsSync(p)) {
            currentPaths.unshift(p);
        }
    }
    const nodeBinDir = path.dirname(process.execPath);
    if (!currentPaths.includes(nodeBinDir)) {
        currentPaths.unshift(nodeBinDir);
    }
    process.env.PATH = currentPaths.join(':');
}

// --tw 參數：使用繁體中文字典 (dicts_tw/)，否則使用預設簡體字典 (dicts/)
const USE_TW = process.argv.includes('--tw');
const DICTS_FOLDER = USE_TW ? 'dicts_tw' : 'dicts';
const BRAND_TITLE_ALIASES = {
    english: 'english',
    en: 'english',
    default: 'english',
    hidden: 'hidden',
    hide: 'hidden',
    none: 'hidden',
    translated: 'translated',
    chinese: 'translated',
    cn: 'translated',
    zh: 'translated'
};

function getOptionValue(name, defaultValue) {
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === name) {
            return args[i + 1] || defaultValue;
        }
        if (args[i].startsWith(name + '=')) {
            return args[i].slice(name.length + 1);
        }
    }
    return defaultValue;
}

const HAS_BRAND_TITLE_ARG = process.argv.some(arg => arg === '--brand-title' || arg.startsWith('--brand-title='));
const rawBrandTitle = String(getOptionValue('--brand-title', 'english')).toLowerCase();
let BRAND_TITLE_MODE = BRAND_TITLE_ALIASES[rawBrandTitle] || 'english';
if (!BRAND_TITLE_ALIASES[rawBrandTitle]) {
    console.warn(USE_TW
        ? `[警告] 未識別的 --brand-title 參數 "${rawBrandTitle}"，已回退為 english。`
        : `[警告] 未识别的 --brand-title 参数 "${rawBrandTitle}"，已回退为 english。`);
}

if (USE_TW) {
    const logTranslations = {
        "====== 正在安装 Antigravity 中文汉化 ======": "====== 正在安裝 Antigravity 繁體中文漢化 ======",
        "====== 正在卸载中文汉化，恢复官方原版 ======": "====== 正在卸載中文漢化，恢復官方原版 ======",
        "[1] 检测到 Antigravity 客户端正在运行，正在关闭以解除文件锁...": "[1] 偵測到 Antigravity 用戶端正在執行，正在關閉以解除檔案鎖...",
        "[缓存] 已自动清理 ": "[快取] 已自動清理 ",
        " 个应用缓存目录，避免新旧版本字节码冲突。": " 個應用程式快取目錄，避免新舊版本位元組碼衝突。",
        "[签名] 已同步更新 macOS Info.plist 中的 ElectronAsarIntegrity 校验值。": "[簽名] 已同步更新 macOS Info.plist 中的 ElectronAsarIntegrity 校驗值。",
        "[修改] 正在向 preload.js 注入汉化代码...": "[修改] 正在向 preload.js 注入漢化程式碼...",
        "[修改] 注入成功！": "[修改] 注入成功！",
        "[修改] 正在向 menu.js 注入菜单汉化代码...": "[修改] 正在向 menu.js 注入選單漢化程式碼...",
        "[修改] 菜单汉化注入成功！": "[修改] 選單漢化注入成功！",
        "[修改] 正在向 tray.js 注入任务栏菜单汉化...": "[修改] 正在向 tray.js 注入系統匣選單漢化...",
        "[修改] 任务栏菜单汉化注入成功！": "[修改] 系統匣選單漢化注入成功！",
        "[修改] 正在向 loadingOverlay.js 注入加载页汉化...": "[修改] 正在向 loadingOverlay.js 注入載入頁漢化...",
        "[修改] 加载页汉化注入成功！": "[修改] 載入頁漢化注入成功！",
        "[修改] 正在向 updater.js 注入更新弹窗汉化...": "[修改] 正在向 updater.js 注入更新彈出視窗漢化...",
        "[修改] 更新弹窗汉化注入成功！": "[修改] 更新彈出視窗漢化注入成功！",
        "[修改] 更新弹窗已是汉化版本，无需重复注入。": "[修改] 更新彈出視窗已是繁中版本，無須重複注入。",
        "[修改] 正在向 utils.js 注入伴生面板 (Sidecar) 汉化钩子...": "[修改] 正在向 utils.js 注入伴生面板 (Sidecar) 漢化掛鉤...",
        "[修改] 伴生面板 (Sidecar) 汉化钩子注入成功！": "[修改] 伴生面板 (Sidecar) 漢化掛鉤注入成功！",
        "[警告] 未能在 utils.js 中找到 Sidecar 钩子插入点。": "[警告] 未能在 utils.js 中找到 Sidecar 掛鉤插入點。",
        "[打包] 正在使用原生引擎生成并校验汉化候选包...": "[打包] 正在使用原生引擎產生並校驗漢化候選包...",
        "[√] Antigravity 2.0 汉化部署完成！": "[√] Antigravity 2.0 繁體中文化套用完成！",
        "[!] 未找到备份文件 app.asar.bak，可能尚未安装过汉化或备份被删除。": "[!] 未找到備份檔案 app.asar.bak，可能尚未安裝過繁中化，或備份檔案已刪除。",
        "[还原] 正在用官方备份文件恢复...": "[還原] 正在使用官方備份檔案還原...",
        "[权限] 检测到当前用户对 macOS 应用目录缺少写入权限，正在尝试请求管理员权限 (sudo) 重新运行...": "[權限] 偵測到目前使用者對 macOS 應用程式目錄缺少寫入權限，正在嘗試請求管理員權限 (sudo) 重新執行...",
        "[√] 官方 app.asar 已成功恢复！": "[√] 官方 app.asar 已成功還原！",
        "[错误] 手动指定的路径不存在:": "[錯誤] 手動指定的路徑不存在:",
        "[错误] 未在资源目录中找到 app.asar:": "[錯誤] 未在資源目錄中找到 app.asar:",
        "[错误] 未能在 app.asar 中找到 dist/preload.js": "[錯誤] 未能在 app.asar 中找到 dist/preload.js",
        "[错误] 无法定位有效的资源(resources)目录: ": "[錯誤] 無法定位有效的資源(resources)目錄: ",
        "[警告] 未能在 menu.js 中找到设定的插入点。": "[警告] 未能在 menu.js 中找到設定的插入點。",
        "[警告] 未能在 tray.js 中找到 createTray 函数插入点。": "[警告] 未能在 tray.js 中找到 createTray 函式插入點。",
        "[签名] 检测到 macOS 平台，正在对应用包进行本地 ad-hoc 深度重签名: ": "[簽名] 偵測到 macOS 平台，正在對應用程式包進行本機 ad-hoc 深度重新簽名: ",
        "[签名] 重新签名成功！": "[簽名] 重新簽名成功！",
        "[警告] 重新签名失败。可能会导致应用无法打开。": "[警告] 重新簽名失敗。可能會導致應用程式無法開啟。",
        "[警告] 未能从路径 ": "[警告] 未能從路徑 ",
        " 识别到有效的 .app 路径，跳过重新签名。": " 識別到有效的 .app 路徑，跳過重新簽名。",
        "[探测] 成功自动识别到 Antigravity 安装目录: ": "[偵測] 成功自動識別到 Antigravity 安裝目錄: ",
        "[错误] 未找到默认安装目录，请使用 --install-dir 手动指定您的安装路径！": "[錯誤] 未找到預設安裝目錄，請使用 --install-dir 手動指定您的安裝路徑！",
        "详情: ": "詳情: ",
        "[跳过] 检测到 --no-kill 参数，跳过关闭 Antigravity 运行进程。": "[跳過] 偵測到 --no-kill 參數，跳過關閉 Antigravity 執行程序。",
        "[启动] 检测到安装前反重力客户端处于开启状态，正在重新启动客户端...": "[啟動] 偵測到安裝前 Antigravity 用戶端處於開啟狀態，正在重新啟動用戶端...",
        "[启动] 客户端启动成功！": "[啟動] 用戶端啟動成功！",
        "[警告] 未找到客户端主程序: ": "[警告] 未找到用戶端主程式: ",
        "[警告] 客户端启动失败: ": "[警告] 用戶端啟動失敗: ",
        "[权限] 检测到当前用户对 Antigravity 安装目录缺少写入权限，无法覆盖资源文件。": "[權限] 偵測到目前使用者對 Antigravity 安裝目錄缺少寫入權限，無法覆寫資源檔案。",
        "[提示] 请右键点击批次档 (.bat)，选择「以系统管理员身份运行」后再重试。": "[提示] 請對批次檔 (.bat) 按右鍵，選擇「以系統管理員身分執行」後再重試。",
        "[任务] 检测到本机已安装 Antigravity 背景自动更新守护，正在同步刷新状态...": "[任務] 偵測到本機已安裝 Antigravity 背景自動更新守護，正在同步重新整理狀態...",
        "[任务] 已同步更新 macOS 背景守护快照并刷新状态，避免旧版回滚。": "[任務] 已同步更新 macOS 背景守護快照並重新整理狀態，避免舊版回滾。",
        "[任务] 已重新注册 Windows 排程路径至当前目录，避免旧版目录回滚。": "[任務] 已重新註冊 Windows 排程路徑至目前目錄，避免舊版目錄回滾。",
        "[警告] 检测到系统级背景守护 (LaunchDaemon) 无写入权限，请执行 sudo bash ./install_macos_autowatcher.sh --daemon 同步更新，以免旧版守护回滚 app.asar。": "[警告] 偵測到系統級背景守護 (LaunchDaemon) 缺乏寫入權限，請執行 sudo bash ./install_macos_autowatcher.sh --daemon 同步更新，以免舊版守護回滾 app.asar。",
        "[任务] 无法触发背景守护同步（可能权限不足或排程未启动），下次定时巡检仍会自动生效。": "[任務] 無法觸發背景守護同步（可能權限不足或排程未啟動），下次排程巡檢仍會自動生效。",
        "[错误] 管理员提权执行失败或用户取消了密码输入。": "[錯誤] 管理員提權執行失敗或使用者取消了密碼輸入。",
        "语法校验失败 (": "語法校驗失敗 (",
        "[提示] 临时目录已保留: ": "[提示] 暫存目錄已保留: ",
        "[错误] 汉化未完成，未提交的候选包不会替换客户端: ": "[錯誤] 繁中化尚未完成，未提交的候選包不會覆寫用戶端: ",
        "[错误] 恢复备份失败: ": "[錯誤] 還原備份失敗: ",
        "[提示] macOS 写入受限，请使用管理员权限运行脚本。": "[提示] macOS 寫入受限，請以管理員權限執行指令碼。",
        "[提醒] Antigravity 目前仍在运行，内存仍加载旧版资源。请完全退出应用（macOS 请按 Cmd+Q 或从菜单栏图标选择「结束」，勿仅关闭窗口）后再重新打开，新翻译才会完整生效。": "[提醒] Antigravity 目前仍在執行，記憶體仍載入舊版套件。請完全結束應用程式（macOS 請按 Cmd+Q 或從系統匣選擇「結束」，勿僅關閉視窗）再重新開啟，新翻譯才會完整生效。"
    };
    const translateMsg = (args) => {
        return args.map(arg => {
            if (typeof arg === 'string') {
                let res = arg;
                for (const [k, v] of Object.entries(logTranslations)) {
                    if (res.includes(k)) {
                        res = res.split(k).join(v);
                    }
                }
                return res;
            }
            return arg;
        });
    };
    const origLog = console.log;
    const origError = console.error;
    const origWarn = console.warn;
    console.log = (...args) => origLog(...translateMsg(args));
    console.error = (...args) => origError(...translateMsg(args));
    console.warn = (...args) => origWarn(...translateMsg(args));
}

const SIGNATURE_START = "/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */";
const SIGNATURE_END = "/* --- ANTIGRAVITY CHINESE LOCALIZATION END --- */";

function normalizeText(text) {
    if (!text) return "";
    return text.replace(/\s+/g, ' ')
               .trim()
               .replace(/’/g, "'")
               .replace(/‘/g, "'")
               .replace(/“/g, '"')
               .replace(/”/g, '"')
               .replace(/…/g, '...');
}

function compareVersions(v1, v2) {
    const clean = v => String(v || '').replace(/^[^\d]*/, '').split('.').map(n => parseInt(n, 10) || 0);
    const p1 = clean(v1);
    const p2 = clean(v2);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const num1 = p1[i] || 0;
        const num2 = p2[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }
    return 0;
}

function safeEmbedJson(jsonStr) {
    return jsonStr
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/\//g, '\\/')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function getActiveTranslation() {
    try {
        const statePath = path.join(__dirname, '.watcher-state', 'active_translation.json');
        const stateStat = fs.lstatSync(statePath);
        if (stateStat.isSymbolicLink() || !stateStat.isFile()) return null;
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        if (!state || !/^\d+\.\d+\.\d+$/.test(state.version)) return null;
        const engineVersion = getPackageVersion();
        if (compareVersions(state.version, engineVersion) < 0) return null;

        const root = path.join(__dirname, '.translation-packs');
        const folder = path.join(root, state.version);
        if (!fs.lstatSync(root).isDirectory() || !fs.lstatSync(folder).isDirectory()) return null;
        if (!fs.lstatSync(path.join(folder, 'dicts')).isDirectory() ||
            !fs.lstatSync(path.join(folder, 'dicts_tw')).isDirectory()) return null;

        const manifestPath = path.join(folder, 'translation-pack.json');
        if (fs.existsSync(manifestPath)) {
            const manifestStat = fs.lstatSync(manifestPath);
            if (manifestStat.isSymbolicLink() || !manifestStat.isFile()) return null;
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            if (!manifest ||
                !/^\d+\.\d+\.\d+$/.test(manifest.minEngineVersion || '') ||
                !/^\d+\.\d+\.\d+$/.test(manifest.maxEngineVersion || '') ||
                compareVersions(engineVersion, manifest.minEngineVersion) < 0 ||
                compareVersions(engineVersion, manifest.maxEngineVersion) > 0) {
                return null;
            }
        }

        const rulesDir = path.join(folder, 'rules');
        const rulesFile = path.join(rulesDir, 'runtime_rules.json');
        let hasRules = false;
        try {
            hasRules = fs.lstatSync(rulesDir).isDirectory() && fs.lstatSync(rulesFile).isFile();
        } catch {}
        return { version: state.version, folder, hasRules };
    } catch { return null; }
}

function loadRuntimeRules() {
    const active = getActiveTranslation();
    const baseDir = active && active.hasRules ? active.folder : __dirname;
    const rulesFile = path.join(baseDir, 'rules', 'runtime_rules.json');
    if (!fs.existsSync(rulesFile)) return {};
    const st = fs.lstatSync(rulesFile);
    if (st.isSymbolicLink() || !st.isFile()) {
        throw new Error('Unsafe runtime_rules.json file type');
    }
    const parsed = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
    return validateRuntimeRulesObject(parsed);
}

function loadDictionary() {
    const totalMap = {};
    const active = getActiveTranslation();
    const dictsDir = path.join(active ? active.folder : __dirname, DICTS_FOLDER);
    if (fs.existsSync(dictsDir)) {
        const files = fs.readdirSync(dictsDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const filePath = path.join(dictsDir, file);
                    const fileContent = fs.readFileSync(filePath, 'utf-8');
                    const data = JSON.parse(fileContent);
                    for (const [k, v] of Object.entries(data)) {
                        const normK = normalizeText(k);
                        if (normK) totalMap[normK] = v;
                    }
                } catch (e) {
                    // ignore
                }
            }
        }
    }
    if (BRAND_TITLE_MODE === 'english') {
        delete totalMap[normalizeText('Antigravity')];
    } else if (BRAND_TITLE_MODE === 'hidden') {
        totalMap[normalizeText('Antigravity')] = '';
    }
    return totalMap;
}

function getPackageVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) {
            return pkg.version.trim();
        }
    } catch (e) {}
    return '3.7.1';
}

function generateJs() {
    const fullDict = loadDictionary();
    const dictJson = JSON.stringify(fullDict);
    const runtimeRulesJson = JSON.stringify(loadRuntimeRules());
    const runtimePath = path.join(__dirname, 'src', 'preload_runtime.js');
    const runtimeTemplate = fs.readFileSync(runtimePath, 'utf-8');

    const replacements = {
        __USE_TW_PLACEHOLDER__: USE_TW ? 'true' : 'false',
        DICT_PLACEHOLDER: safeEmbedJson(dictJson),
        RULES_PLACEHOLDER: safeEmbedJson(runtimeRulesJson)
    };
    const body = runtimeTemplate.replace(
        /__USE_TW_PLACEHOLDER__|DICT_PLACEHOLDER|RULES_PLACEHOLDER/g,
        token => replacements[token]
    );

    const active = getActiveTranslation();
    const metaComment = `/* --- ANTIGRAVITY L10N META:${JSON.stringify({ version: getPackageVersion(), translationVersion: active ? active.version : getPackageVersion(), buildTime: Date.now() })} --- */`;
    return `${SIGNATURE_START}\n${metaComment}\n${body}\n${SIGNATURE_END}`;
}

let wasAppRunning = false;

function checkIfAppIsRunning() {
    try {
        if (process.platform === 'win32') {
            const stdout = child_process.execSync('tasklist /fi "imagename eq Antigravity.exe" /nh', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            return stdout.toLowerCase().includes('antigravity.exe');
        } else if (process.platform === 'darwin') {
            const stdout = child_process.execSync('pgrep -x Antigravity || pgrep -f "/Antigravity(?: IDE)?\\.app/Contents/"', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            return stdout.trim().length > 0;
        }
    } catch (e) {
        // ignore
    }
    return false;
}

function sleepSync(ms) {
    try {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    } catch (e) {
        const start = Date.now();
        while (Date.now() - start < ms) {}
    }
}

function closeAntigravityProcesses() {
    console.log("[1] 检测到 Antigravity 客户端正在运行，正在关闭以解除文件锁...");
    try {
        // 第一阶段：尝试发送温和退出信号 (WM_CLOSE / SIGTERM)，让客户端有机会触发 before-quit 优雅落盘
        if (process.platform === 'win32') {
            child_process.execSync('taskkill /im Antigravity.exe >nul 2>nul');
        } else {
            child_process.execSync('osascript -e \'tell application id "com.google.antigravity" to quit\' >/dev/null 2>&1; killall -TERM Antigravity >/dev/null 2>&1; pkill -TERM -x Antigravity >/dev/null 2>&1');
        }
    } catch (e) {}

    // 等待最多 2.5 秒让主进程响应退出
    const waitStart = Date.now();
    while (Date.now() - waitStart < 2500) {
        sleepSync(250);
        if (!checkIfAppIsRunning()) break;
    }

    // 第二阶段：无论主窗口是否已关闭，都必须彻底清理所有残余的 Electron GPU/渲染/Helper 子进程，彻底释放 app.asar 文件锁
    try {
        if (process.platform === 'win32') {
            child_process.execSync('taskkill /f /im Antigravity.exe /t >nul 2>nul');
        } else {
            child_process.execSync('killall -KILL Antigravity >/dev/null 2>&1; pkill -KILL -f "/Antigravity(?: IDE)?\\.app/Contents/" >/dev/null 2>&1');
        }
    } catch (e) {}
    sleepSync(1200);
}

function detectInstallationDir(manualDir) {
    if (manualDir) {
        if (fs.existsSync(manualDir)) {
            let resolved = path.resolve(manualDir);
            if (fs.statSync(resolved).isFile() && /app\.asar$/i.test(resolved)) {
                resolved = path.dirname(resolved);
            }
            return resolved;
        } else {
            console.error(`[错误] 手动指定的路径不存在: ${manualDir}`);
            process.exit(1);
        }
    }

    const candidates = [];
    const seenCandidates = new Set();
    const addCandidate = (candidate) => {
        if (!candidate) return;
        const normalized = path.resolve(candidate);
        const key = normalized.toLowerCase();
        if (!seenCandidates.has(key)) {
            candidates.push(normalized);
            seenCandidates.add(key);
        }
    };
    const hasAntigravityResources = (candidate) => {
        return fs.existsSync(path.join(candidate, "resources", "app.asar")) ||
            fs.existsSync(path.join(candidate, "app.asar")) ||
            fs.existsSync(path.join(candidate, "Contents", "Resources", "app.asar"));
    };

    if (process.platform === 'win32') {
        addCandidate(process.env.ANTIGRAVITY_INSTALL_DIR);
        addCandidate(process.env.ANTIGRAVITY_HOME);

        const registryRoots = [
            'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
            'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
            'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
        ];
        for (const root of registryRoots) {
            try {
                const output = child_process.execFileSync('cmd', ['/d', '/u', '/c', `reg query "${root}" /s /f Antigravity /d`], { encoding: 'utf16le', stdio: 'pipe' });
                for (const line of output.split(/\r?\n/)) {
                    const match = line.match(/^\s*(InstallLocation|DisplayIcon)\s+REG_\w+\s+(.+)$/i);
                    if (!match) continue;
                    let value = match[2].trim().replace(/^"|"$/g, '');
                    if (/Antigravity\.exe/i.test(value)) {
                        value = path.dirname(value);
                    }
                    addCandidate(value);
                }
            } catch (e) {}
        }

        const driveLetters = ['C', 'D', 'E', 'F'];
        for (const drive of driveLetters) {
            addCandidate(`${drive}:\\Programs\\Antigravity`);
            addCandidate(`${drive}:\\Programs\\Antigravity IDE`);
            addCandidate(`${drive}:\\Antigravity`);
        }
        addCandidate(process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Antigravity'));
        addCandidate(process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Antigravity'));
        addCandidate("C:\\Program Files\\Antigravity");
        addCandidate("C:\\Program Files (x86)\\Antigravity");

        const localAppdata = process.env.LOCALAPPDATA;
        if (localAppdata) {
            addCandidate(path.join(localAppdata, 'Programs', 'antigravity'));
            addCandidate(path.join(localAppdata, 'Programs', 'Antigravity IDE'));
        }
    } else if (process.platform === 'darwin') {
        addCandidate("/Applications/Antigravity.app");
        addCandidate(path.join(process.env.HOME || '', 'Applications', 'Antigravity.app'));
        if (process.env.SUDO_USER && process.env.SUDO_USER !== 'root') {
            addCandidate(path.join('/Users', process.env.SUDO_USER, 'Applications', 'Antigravity.app'));
        }
    }

    for (const p of candidates) {
        if (fs.existsSync(p) && hasAntigravityResources(p)) {
            console.log(`[探测] 成功自动识别到 Antigravity 安装目录: ${p}`);
            return path.resolve(p);
        }
    }

    console.error("[错误] 未找到默认安装目录，请使用 --install-dir 手动指定您的安装路径！");
    process.exit(1);
}

function runCommandSync(cmd) {
    try {
        const out = child_process.execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', env: { ...process.env } });
        return { success: true, stdout: out, stderr: '' };
    } catch (e) {
        return { success: false, stdout: e.stdout || '', stderr: e.stderr || e.message };
    }
}

// 經 sudo 以 root 執行時，改以原本的使用者身分刪除家目錄裡的快取：家目錄裡的每一層路徑都由使用者控制，
// 以 root 刪除可能被連結導向系統目錄。asUser 可明確指定（{ uid, gid }），測試以目前使用者模擬
function sudoInvoker() {
    const uid = Number(process.env.SUDO_UID);
    const gid = Number(process.env.SUDO_GID);
    if (!isRootProcess() || !Number.isInteger(uid) || uid <= 0 || !Number.isInteger(gid) || gid < 0) return null;
    return { uid, gid };
}

function cleanElectronCache(customAppSupportDirs, { asUser = Array.isArray(customAppSupportDirs) ? null : sudoInvoker() } = {}) {
    let appSupportDirs = Array.isArray(customAppSupportDirs) ? customAppSupportDirs : [];
    if (!Array.isArray(customAppSupportDirs)) {
        if (process.platform === 'darwin') {
            let userHome = os.homedir();
            if (process.env.SUDO_USER && process.env.SUDO_USER !== 'root') {
                const sudoHome = path.join('/Users', process.env.SUDO_USER);
                if (fs.existsSync(sudoHome)) {
                    userHome = sudoHome;
                }
            }
            appSupportDirs.push(
                path.join(userHome, 'Library', 'Application Support', 'Antigravity'),
                path.join(userHome, 'Library', 'Application Support', 'Antigravity IDE')
            );
        } else if (process.platform === 'win32') {
            const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
            appSupportDirs.push(
                path.join(appData, 'Antigravity'),
                path.join(appData, 'Antigravity IDE')
            );
        } else {
            appSupportDirs.push(
                path.join(os.homedir(), '.config', 'Antigravity'),
                path.join(os.homedir(), '.config', 'Antigravity IDE')
            );
        }
    }

    const toDeleteNames = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'GraphiteDawnCache', 'DawnWebGPUCache', 'ScriptCache', 'CacheStorage', 'Shared Dictionary']);
    let cleanedCount = 0;

    function purgeDir(dir, depth = 0, forceRecurse = false) {
        if (depth > 6 || !fs.existsSync(dir)) return;
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const full = path.join(dir, entry.name);
                    if (toDeleteNames.has(entry.name)) {
                        try {
                            if (asUser) {
                                child_process.execFileSync('/bin/rm', ['-rf', '--', full], { uid: asUser.uid, gid: asUser.gid, stdio: 'ignore' });
                            } else {
                                fs.rmSync(full, { recursive: true, force: true });
                            }
                            cleanedCount++;
                        } catch (e) {}
                    } else if (
                        forceRecurse ||
                        entry.name === 'Partitions' ||
                        entry.name === 'Default' ||
                        /^Profile \d+$/i.test(entry.name) ||
                        entry.name.startsWith('hub-browser') ||
                        entry.name === 'Service Worker'
                    ) {
                        purgeDir(full, depth + 1, entry.name === 'Partitions');
                    }
                }
            }
        } catch (e) {}
    }

    for (const appSupportDir of appSupportDirs) {
        if (!fs.existsSync(appSupportDir)) continue;
        purgeDir(appSupportDir, 0);
    }

    if (cleanedCount > 0) {
        console.log(`[快取] 已自動清理 ${cleanedCount} 個應用程式快取目錄（含多分區 Code Cache），避免新舊版本位元組碼衝突。`);
    }
    return cleanedCount;
}

function resolveMacAppBundle(dir) {
    const clean = String(dir || '').replace(/[\\/]+$/, '');
    if (!clean) return null;
    let current = path.resolve(clean);
    for (let i = 0; i < 10; i++) {
        if (current.endsWith('.app') || fs.existsSync(path.join(current, 'Contents', 'MacOS'))) {
            return current;
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return null;
}

function resignAppOnMac(anyPath) {
    if (process.platform !== 'darwin') return true;

    const targetApp = resolveMacAppBundle(anyPath);
    const isRealMacBundle = targetApp && (
        fs.existsSync(path.join(targetApp, 'Contents', 'MacOS')) ||
        fs.existsSync(path.join(targetApp, 'Contents', 'Info.plist'))
    );
    if (isRealMacBundle) {
        try {
            const plistPath = path.join(targetApp, 'Contents', 'Info.plist');
            const macAsarPath = path.join(targetApp, 'Contents', 'Resources', 'app.asar');
            if (fs.existsSync(plistPath) && fs.existsSync(macAsarPath)) {
                const plistContent = fs.readFileSync(plistPath, 'utf-8');
                if (plistContent.includes('ElectronAsarIntegrity')) {
                    const asarBuf = fs.readFileSync(macAsarPath);
                    const headerStrSize = asarBuf.readUInt32LE(12);
                    const headerHash = crypto.createHash('sha256').update(asarBuf.subarray(16, 16 + headerStrSize)).digest('hex');
                    const integrityRegex = /(<key>ElectronAsarIntegrity<\/key>[\s\S]*?<key>Resources\/app\.asar<\/key>[\s\S]*?<key>hash<\/key>\s*<string>)[a-fA-F0-9]{64}(<\/string>)/;
                    if (integrityRegex.test(plistContent)) {
                        const updatedPlist = plistContent.replace(integrityRegex, `$1${headerHash}$2`);
                        if (updatedPlist !== plistContent) {
                            fs.writeFileSync(plistPath, updatedPlist, 'utf-8');
                            console.log('[签名] 已同步更新 macOS Info.plist 中的 ElectronAsarIntegrity 校验值。');
                        }
                    }
                }
            }
        } catch (e) {}
        try {
            runCommandSync(`xattr -cr "${targetApp}"`);
        } catch (e) {}
        console.log(`[签名] 检测到 macOS 平台，正在对应用包进行本地 ad-hoc 深度重签名: ${targetApp} ...`);
        const signRes = runCommandSync(`codesign --force --deep --sign - "${targetApp}"`);
        if (signRes.success) {
            console.log(`[签名] 重新签名成功！`);
            return true;
        } else {
            console.warn(`[警告] 重新签名失败。可能会导致应用无法打开。详情:\n${signRes.stderr}\n${signRes.stdout}`);
            return false;
        }
    } else {
        console.warn(`[警告] 未能从路径 ${anyPath} 识别到有效的 .app 路径，跳过重新签名。`);
        return true;
    }
}

function ensureWritePermission(targetDir) {
    if (process.platform === 'win32') {
        try {
            fs.accessSync(targetDir, fs.constants.W_OK);
            const probePath = path.join(targetDir, `.ag_write_probe_${process.pid}_${Date.now()}`);
            const fd = fs.openSync(probePath, 'wx');
            fs.closeSync(fd);
            fs.unlinkSync(probePath);
            return true;
        } catch (err) {
            console.error("[权限] 检测到当前用户对 Antigravity 安装目录缺少写入权限，无法覆盖资源文件。");
            console.error("[提示] 请右键点击批次档 (.bat)，选择「以系统管理员身份运行」后再重试。");
            console.error(`详情: ${targetDir} (${err.code || err.message})`);
            process.exit(1);
        }
    }
    if (process.platform !== 'darwin') return true;
    try {
        fs.accessSync(targetDir, fs.constants.W_OK);
        return true;
    } catch (err) {
        if (process.getuid && process.getuid() !== 0) {
            console.log("[权限] 检测到当前用户对 macOS 应用目录缺少写入权限，正在尝试请求管理员权限 (sudo) 重新运行...");
            const args = process.argv.slice(1);
            const res = child_process.spawnSync('sudo', [process.execPath, ...args], {
                stdio: 'inherit'
            });
            if (res.status === 0) {
                process.exit(0);
            } else {
                console.error("\n[错误] 管理员提权执行失败或用户取消了密码输入。");
                process.exit(res.status || 1);
            }
        }
        return false;
    }
}

// ==========================================
// Antigravity 2.0 汉化部署引擎 (零依赖纯 Node.js 原生 ASAR 打包模式)
// ==========================================
function replaceFileWithRetry(srcPath, destPath, allowKill = false) {
    let lastErr;
    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            fs.renameSync(srcPath, destPath);
            return;
        } catch (err) {
            lastErr = err;
            if (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES') {
                if (allowKill && attempt === 2 && process.platform === 'win32') {
                    try { child_process.execSync('taskkill /f /im Antigravity.exe /t >nul 2>nul'); } catch (e) {}
                }
                sleepSync(400);
                continue;
            }
            throw err;
        }
    }
    try {
        fs.copyFileSync(srcPath, destPath);
        fs.unlinkSync(srcPath);
    } catch (copyErr) {
        throw new Error(`文件替换失败 (${srcPath} -> ${destPath}): rename=${lastErr ? lastErr.message : 'unknown'}; fallback=${copyErr.message}`);
    }
}

function getMacUserHome() {
    let userHome = os.homedir();
    if (process.env.SUDO_USER && process.env.SUDO_USER !== 'root') {
        const sudoHome = path.join('/Users', process.env.SUDO_USER);
        if (fs.existsSync(sudoHome)) userHome = sudoHome;
    }
    return userHome;
}

function isRealAppInstallDir(targetPath) {
    if (!targetPath) return false;
    const resolved = path.resolve(targetPath);
    const tmpBase = path.resolve(os.tmpdir());
    if (resolved.startsWith(tmpBase + path.sep) || resolved.startsWith('/tmp/') || resolved.startsWith('/private/tmp/') || resolved.startsWith('/var/folders/')) {
        return false;
    }
    if (process.platform === 'darwin') {
        const bundle = resolveMacAppBundle(resolved);
        if (!bundle) return false;
        const userApps = path.join(getMacUserHome(), 'Applications') + path.sep;
        return bundle.startsWith('/Applications/') || bundle.startsWith(userApps);
    }
    if (process.platform === 'win32') {
        return fs.existsSync(path.join(resolved, 'Antigravity.exe'));
    }
    return false;
}

function computeDirRecipeHash(dir) {
    const files = ['package.json', 'package-lock.json', 'localization_engine.js', 'auto_localize_watcher.js'];
    for (const folder of ['dicts', 'dicts_tw', 'rules', 'src']) {
        const folderPath = path.join(dir, folder);
        if (fs.existsSync(folderPath)) {
            for (const name of fs.readdirSync(folderPath).sort()) {
                if (name.endsWith('.json') || name.endsWith('.js')) files.push(path.join(folder, name));
            }
        }
    }
    const hash = crypto.createHash('sha256');
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.existsSync(fullPath)) {
            hash.update(file).update(fs.readFileSync(fullPath));
        }
    }
    return hash.digest('hex');
}

function copyDirTree(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirTree(s, d);
        } else if (entry.isFile()) {
            fs.copyFileSync(s, d);
        }
    }
}

const RUNTIME_FILES = ['auto_localize_watcher.js', 'localization_engine.js', 'package.json', 'package-lock.json'];
const RUNTIME_FOLDERS = ['dicts', 'dicts_tw', 'rules', 'src', 'scripts'];

function isRootProcess() {
    return typeof process.getuid === 'function' && process.getuid() === 0;
}

// root 同步守護程式的執行目錄。使用者層的執行目錄位於使用者家目錄，路徑上的每一層都可能被使用者換成連結：
// 先以不跟隨連結的方式確認執行目錄，切換進去後一律以相對名稱複製、刪除與建立子目錄，
// 新建的項目交給執行目錄的擁有者。目錄在途中被換成連結時，寫入與刪除仍落在原本的目錄裡，
// 不會改寫、刪除或交出連結指向的系統檔案；確認不了就放棄同步
function inspectRuntimeDir(rtDir) {
    const st = fs.lstatSync(rtDir);
    if (!st.isDirectory()) throw new Error('不是一般目錄');
    return { st, owner: st.uid !== 0 ? { uid: st.uid, gid: st.gid } : null };
}

function inRuntimeDir(rtDir, rt, fn) {
    return runLock.inDirNoFollow(rtDir, st => st.dev === rt.st.dev && st.ino === rt.st.ino && st.uid === rt.st.uid, fn);
}

// 在目前工作目錄建立（或沿用）子目錄並交給 owner；同名項目是連結時丟出錯誤。
// root 擁有的執行目錄（owner 為 null）裡的子目錄收回給 root：v3.8.1 與更早版本的系統層守護會把 .watcher-state 交給 App 的擁有者
function ensureChildDir(name, owner) {
    try {
        fs.mkdirSync(name, { mode: 0o755 });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
    return runLock.inDirNoFollow(name, () => true, fd => {
        const target = owner || (isRootProcess() ? { uid: 0, gid: 0 } : null);
        if (target) fs.fchownSync(fd, target.uid, target.gid);
        return fs.fstatSync(fd);
    });
}

// 複製到目前工作目錄：先寫入唯一名稱的暫存檔再改名取代，同名項目是連結時只會取代連結本身
function copyFileRelative(src, name, owner) {
    const temp = `.${name}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    // 與 copyFileSync 一樣沿用來源的權限（auto_localize_watcher.js 為 755）
    const mode = fs.statSync(src).mode & 0o755;
    try {
        const fd = fs.openSync(temp, 'wx', mode);
        try {
            fs.writeSync(fd, fs.readFileSync(src));
            fs.fchmodSync(fd, mode);
            if (owner) fs.fchownSync(fd, owner.uid, owner.gid);
        } finally {
            fs.closeSync(fd);
        }
        fs.renameSync(temp, name);
    } catch (error) {
        try { fs.unlinkSync(temp); } catch {}
        throw error;
    }
}

function copyTreeRelative(srcDir, owner) {
    const uid = owner ? owner.uid : 0;
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const src = path.join(srcDir, entry.name);
        if (entry.isDirectory()) {
            ensureChildDir(entry.name, owner);
            runLock.inDirNoFollow(entry.name, st => st.uid === uid, () => copyTreeRelative(src, owner));
        } else if (entry.isFile()) {
            copyFileRelative(src, entry.name, owner);
        }
    }
}

function syncRuntimeCarefully(sourceDir, rtDir, rt) {
    const uid = rt.owner ? rt.owner.uid : 0;
    inRuntimeDir(rtDir, rt, () => {
        for (const file of RUNTIME_FILES) {
            const src = path.join(sourceDir, file);
            if (fs.existsSync(src)) copyFileRelative(src, file, rt.owner);
        }
        for (const folder of RUNTIME_FOLDERS) {
            const src = path.join(sourceDir, folder);
            if (!fs.existsSync(src)) continue;
            // 子程序沿用目前已確認的工作目錄，以相對名稱刪除；fts 依實體路徑走訪，不跟隨連結
            child_process.execFileSync('/bin/rm', ['-rf', '--', folder], { stdio: 'ignore' });
            ensureChildDir(folder, rt.owner);
            runLock.inDirNoFollow(folder, st => st.uid === uid, () => copyTreeRelative(src, rt.owner));
        }
    });
}

// 與守護程式共用 src/run_lock.js 的鎖格式與回收規則，避免兩邊對鎖的解讀不同而同時取得
// owner、parent 由呼叫端核對執行目錄後指定（root 同步使用者的執行目錄時）；未指定時沿用上層目錄的擁有者
function acquireWatcherLockSync(lockPath, waitMs = 4000, { owner = undefined, parent = null } = {}) {
    const deadline = Date.now() + waitMs;
    const given = owner !== undefined;
    if (!given) owner = null;
    if (!given && isRootProcess()) {
        // 上層目錄被換成連結時，不在連結指向的位置建立鎖
        try {
            const parentStat = fs.lstatSync(path.dirname(lockPath));
            if (!parentStat.isDirectory()) return null;
            if (parentStat.uid !== 0) owner = { uid: parentStat.uid, gid: parentStat.gid };
        } catch {
            return null;
        }
    }
    while (true) {
        let release;
        try { release = runLock.acquire(lockPath, { owner, parent }); } catch { return null; }
        if (release) return release;
        if (Date.now() >= deadline) return null;
        sleepSync(150);
    }
}

function discoverMacWatcherRuntimes({
    userHome = getMacUserHome(),
    systemPlistPath = '/Library/LaunchDaemons/com.antigravity.autolocalize.plist',
    userPlistPath = path.join(userHome, 'Library', 'LaunchAgents', 'com.antigravity.autolocalize.plist')
} = {}) {
    const targets = [];
    if (fs.existsSync(userPlistPath)) {
        const rt = path.join(userHome, 'Library', 'Application Support', 'Antigravity2TW', 'runtime');
        if (fs.existsSync(rt)) targets.push({ kind: 'user', runtimeDir: rt });
    }
    if (fs.existsSync(systemPlistPath)) {
        try {
            const plistRaw = fs.readFileSync(systemPlistPath, 'utf8');
            const m = plistRaw.match(/<key>WorkingDirectory<\/key>\s*<string>([^<]+)<\/string>/);
            if (m && m[1] && fs.existsSync(m[1])) {
                targets.push({ kind: 'system', runtimeDir: m[1] });
            }
        } catch {}
    }
    return targets;
}

function prepareMacWatcherSync({
    sourceDir = __dirname,
    runtimes = discoverMacWatcherRuntimes(),
    careful = isRootProcess()
} = {}) {
    const session = { synced: [], locks: [], lockOf: new Map(), rtOf: new Map(), unwritableSystem: false };
    if (!fs.existsSync(path.join(sourceDir, 'auto_localize_watcher.js'))) return session;
    try {
        syncRuntimes(session, sourceDir, runtimes, careful);
    } catch (error) {
        // 同步途中出錯時呼叫端拿不到 session：先釋放已取得的鎖再回報
        cleanupMacWatcherSync(session);
        throw error;
    }
    if (session.unwritableSystem) {
        console.warn("[警告] 检测到系统级背景守护 (LaunchDaemon) 无写入权限，请执行 sudo bash ./install_macos_autowatcher.sh --daemon 同步更新，以免旧版守护回滚 app.asar。");
    }
    return session;
}

function syncRuntimes(session, sourceDir, runtimes, careful) {
    for (const item of runtimes) {
        const rtDir = item.runtimeDir;
        try {
            fs.accessSync(rtDir, fs.constants.W_OK);
        } catch {
            if (item.kind === 'system') session.unwritableSystem = true;
            continue;
        }
        let rt = null;
        if (careful) {
            try {
                rt = inspectRuntimeDir(rtDir);
                rt.stateStat = inRuntimeDir(rtDir, rt, () => ensureChildDir('.watcher-state', rt.owner));
            } catch (error) {
                console.warn(`[守護程序] ${rtDir} 不是可安全寫入的一般目錄，略過本次同步：${error.message}`);
                continue;
            }
        } else {
            fs.mkdirSync(path.join(rtDir, '.watcher-state'), { recursive: true, mode: 0o755 });
        }
        const release = acquireWatcherLockSync(path.join(rtDir, '.watcher-state', 'run.lock'), undefined,
            rt ? { owner: rt.owner, parent: rt.stateStat } : {});
        if (!release) {
            console.warn(`[守護程序] ${rtDir} 正在執行，未取得排他鎖。略過本次同步，避免覆寫執行中的守護程序。`);
            continue;
        }
        session.locks.push(release);
        session.lockOf.set(rtDir, release);
        if (rt) session.rtOf.set(rtDir, rt);

        if (careful) {
            syncRuntimeCarefully(sourceDir, rtDir, rt);
        } else {
            for (const file of RUNTIME_FILES) {
                const srcFile = path.join(sourceDir, file);
                if (fs.existsSync(srcFile)) {
                    fs.copyFileSync(srcFile, path.join(rtDir, file));
                }
            }
            for (const folder of RUNTIME_FOLDERS) {
                const srcFolder = path.join(sourceDir, folder);
                const dstFolder = path.join(rtDir, folder);
                if (fs.existsSync(srcFolder)) {
                    fs.rmSync(dstFolder, { recursive: true, force: true });
                    copyDirTree(srcFolder, dstFolder);
                }
            }
        }
        try {
            const srcPkg = JSON.parse(fs.readFileSync(path.join(sourceDir, 'package.json'), 'utf8'));
            const sourceVersion = srcPkg && typeof srcPkg.version === 'string' ? srcPkg.version.trim() : '';
            const activePath = path.join(rtDir, '.watcher-state', 'active_translation.json');
            if (sourceVersion && fs.existsSync(activePath)) {
                const state = JSON.parse(fs.readFileSync(activePath, 'utf8'));
                if (state && /^\d+\.\d+\.\d+$/.test(state.version || '') && compareVersions(state.version, sourceVersion) <= 0) {
                    fs.unlinkSync(activePath);
                }
            }
        } catch {}
        session.synced.push(rtDir);
    }
}

// 先寫入同一目錄裡唯一名稱的暫存檔（wx：已有同名項目就失敗，不跟隨連結），再改名取代。
// root 寫入使用者的執行目錄時，目標若被換成連結，改名只會取代連結本身，不會寫進連結指向的檔案
// owner 只能用在已核對身分的目錄（以相對名稱寫入）：上層目錄可被使用者替換時，交出擁有者會讓使用者擁有落在系統目錄裡的檔案
function writeFileReplacing(file, content, owner = null) {
    const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
        const fd = fs.openSync(temp, 'wx', 0o644);
        try {
            fs.writeSync(fd, content);
            if (owner) fs.fchownSync(fd, owner.uid, owner.gid);
        } finally {
            fs.closeSync(fd);
        }
        fs.renameSync(temp, file);
    } catch (error) {
        try { fs.unlinkSync(temp); } catch {}
        throw error;
    }
}

// 安裝期間守護程式可能判定安裝器的鎖已殘留而接手（例如重新簽章或系統睡眠讓心跳停止超過 30 分鐘）。
// 寫入收據前逐一確認鎖仍屬於自己；失去鎖的執行目錄不寫收據，避免以本次快照蓋過接手者的結果，
// 下次排程會重新比對。回傳已寫入與略過的執行目錄
function commitMacWatcherSync(session, macAppBundle, asarPath) {
    const result = { written: [], lost: [] };
    if (!session || !session.synced || session.synced.length === 0) return result;
    const asarHash = crypto.createHash('sha256').update(fs.readFileSync(asarPath)).digest('hex');
    const appKey = crypto.createHash('sha256').update(macAppBundle).digest('hex');
    for (const rtDir of session.synced) {
        const release = session.lockOf instanceof Map ? session.lockOf.get(rtDir) : null;
        if (!release || typeof release.held !== 'function' || !release.held()) {
            console.warn(`[守護程序] ${rtDir} 的排他鎖已由其他程序接手，未寫入狀態收據；下次排程會重新檢查。`);
            result.lost.push(rtDir);
            continue;
        }
        try {
            const stateDir = path.join(rtDir, '.watcher-state');
            const recipe = computeDirRecipeHash(rtDir);
            const content = JSON.stringify({
                recipe,
                output: asarHash,
                version: getPackageVersion(),
                updatedAt: new Date().toISOString()
            }) + '\n';
            const rt = session.rtOf instanceof Map ? session.rtOf.get(rtDir) : null;
            if (rt) {
                // root：在同步時核對過的執行目錄與狀態目錄裡，以相對名稱寫入並交給執行目錄的擁有者
                const uid = rt.owner ? rt.owner.uid : 0;
                inRuntimeDir(rtDir, rt, () => runLock.inDirNoFollow('.watcher-state', st => st.uid === uid,
                    () => writeFileReplacing(appKey + '.json', content, rt.owner)));
            } else {
                fs.mkdirSync(stateDir, { recursive: true, mode: 0o755 });
                writeFileReplacing(path.join(stateDir, appKey + '.json'), content);
            }
            result.written.push(rtDir);
        } catch {}
    }
    if (result.written.length > 0) {
        console.log("[任务] 已同步更新 macOS 背景守护快照并刷新状态，避免旧版回滚。");
    }
    return result;
}

function cleanupMacWatcherSync(session) {
    if (!session || !Array.isArray(session.locks)) return;
    while (session.locks.length > 0) {
        const release = session.locks.pop();
        try { release(); } catch {}
    }
}

function syncActiveWindowsWatcher(installDir, resourcesDir, {
    baseDir = __dirname,
    execFileSyncFn = child_process.execFileSync,
    installTaskFn = null
} = {}) {
    try {
        execFileSyncFn('schtasks.exe', ['/query', '/tn', 'AntigravityAutoLocalize'], { stdio: 'ignore' });
    } catch {
        return { synced: false, reason: 'not_registered' };
    }
    console.log("[任务] 检测到本机已安装 Antigravity 背景自动更新守护，正在同步刷新状态...");
    try {
        const asarPath = path.join(resourcesDir, 'app.asar');
        if (fs.existsSync(asarPath)) {
            const stateDir = path.join(baseDir, '.watcher-state');
            fs.mkdirSync(stateDir, { recursive: true });
            const appKey = crypto.createHash('sha256').update(installDir).digest('hex');
            const asarHash = crypto.createHash('sha256').update(fs.readFileSync(asarPath)).digest('hex');
            const recipe = computeDirRecipeHash(baseDir);
            fs.writeFileSync(path.join(stateDir, appKey + '.json'), JSON.stringify({
                recipe,
                output: asarHash,
                version: getPackageVersion(),
                updatedAt: new Date().toISOString()
            }) + '\n');
        }
        const scriptPath = path.join(baseDir, 'auto_localize_watcher.js');
        if (typeof installTaskFn === 'function') {
            installTaskFn({ scriptPath, baseDir, execFileSyncFn });
        } else {
            const watcher = require(scriptPath);
            watcher.installWindowsTask({ scriptPath, baseDir, execFileSyncFn });
        }
        console.log("[任务] 已重新注册 Windows 排程路径至当前目录，避免旧版目录回滚。");
        return { synced: true };
    } catch (runErr) {
        console.warn("[任务] 无法触发背景守护同步（可能权限不足或排程未启动），下次定时巡检仍会自动生效。");
        return { synced: false, error: runErr.message };
    }
}

function install20(resourcesDir, noKill = false, staging = false, options = {}) {
    const asarPath = path.join(resourcesDir, "app.asar");
    const bakPath = path.join(resourcesDir, "app.asar.bak");
    const resignFn = typeof options.resignFn === 'function' ? options.resignFn : resignAppOnMac;

    if (!fs.existsSync(asarPath)) {
        console.error(`[错误] 未在资源目录中找到 app.asar: ${resourcesDir}`);
        return false;
    }

    let buildDir;
    let retainRecoveryFiles = false;
    let macWatcherSession = null;
    try {
        const originalLive = fs.readFileSync(asarPath);
        const isAlreadyLocalized = originalLive.indexOf(Buffer.from(SIGNATURE_START, "utf8")) !== -1;

        const refreshBackup = !isAlreadyLocalized || !fs.existsSync(bakPath);
        const sourcePath = isAlreadyLocalized && fs.existsSync(bakPath) ? bakPath : asarPath;

        buildDir = fs.mkdtempSync(path.join(resourcesDir, '.antigravity-localize-'));
        const sourceArchive = path.join(buildDir, 'source.asar');
        fs.copyFileSync(sourcePath, sourceArchive);
        const rollbackArchive = path.join(buildDir, 'previous.asar');
        fs.writeFileSync(rollbackArchive, originalLive);
        const candidatePath = path.join(buildDir, 'candidate.asar');

        const translationJs = generateJs();
        const modifierMap = new Map([
            ['dist/preload.js', content => patchPreloadJs(content, translationJs, SIGNATURE_START, SIGNATURE_END)],
            ['dist/utils.js', content => patchUtilsJs(content, SIGNATURE_START, SIGNATURE_END)],
            ['dist/menu.js', content => patchMenuJs(content, USE_TW)],
            ['dist/tray.js', content => patchTrayJs(content, USE_TW)],
            ['dist/loadingOverlay.js', content => patchLoadingOverlayJs(content, USE_TW)],
            ['dist/updater.js', content => patchUpdaterJs(content, USE_TW)],
            ['dist/main.js', content => patchMainJs(content, USE_TW)],
            ['dist/ipcHandlers.js', content => patchIpcHandlersJs(content, USE_TW)],
            ['dist/remote/remoteManager.js', content => patchRemoteManagerJs(content, USE_TW)],
            ['dist/remote/sshPrompts.js', content => patchSshPromptsJs(content, USE_TW)],
            ['dist/deviceChooser.js', content => patchDeviceChooserJs(content, USE_TW)],
            ['dist/webauthn.js', content => patchWebauthnJs(content, USE_TW)],
            ['dist/webviewPopupSecurity.js', content => patchWebviewPopupSecurityJs(content, USE_TW)],
            ['dist/provisionSplash.js', content => patchProvisionSplashJs(content, USE_TW)],
            ['dist/ideInstall/wizardHtml.js', content => patchWizardHtmlJs(content, USE_TW)],
            ['dist/remote/sshErrorText.js', content => patchSshErrorTextJs(content, USE_TW)],
            ['dist/remote/disconnectedPage.js', content => patchRemoteDisconnectedPageJs(content, USE_TW)],
            ['dist/remote/signInCallback.js', content => patchRemoteSignInCallbackJs(content, USE_TW)],
            ['dist/browserStream/capturePage.js', content => patchBrowserStreamCapturePageJs(content, USE_TW)],
            ['dist/cablev2.js', content => patchCablev2Js(content, USE_TW)],
            ['dist/qrEncoder.js', content => patchQrEncoderJs(content, USE_TW)],
            ['dist/computer/hud.js', content => patchComputerHudJs(content, USE_TW)],
            ['dist/computer/hudState.js', content => patchComputerHudStateJs(content, USE_TW)],
            ['dist/computer/hudAgents.js', content => patchComputerHudAgentsJs(content, USE_TW)],
            ...Object.keys(REMOTE_TEXT_TABLES).map(relPath => [relPath, content => patchRemoteTextJs(relPath, content, USE_TW)])
        ]);

        console.log(`[打包] 正在使用原生引擎生成并校验汉化候选包...`);
        const modifiedFiles = patchAsarArchive(sourceArchive, candidatePath, modifierMap);

        if (!modifiedFiles.has('dist/preload.js')) {
            console.error(`[错误] 未能在 app.asar 中找到 dist/preload.js`);
            return false;
        }

        validateAsarCandidate(sourceArchive, candidatePath, SIGNATURE_START);
        for (const [relPath, buf] of modifiedFiles.entries()) {
            const checkFile = path.join(buildDir, path.basename(relPath));
            fs.writeFileSync(checkFile, buf);
            try {
                child_process.execFileSync(process.execPath, ['--check', checkFile], { stdio: 'pipe' });
            } catch (syntaxErr) {
                const detail = syntaxErr.stderr ? String(syntaxErr.stderr).trim() : syntaxErr.message;
                throw new Error(`语法校验失败 (${relPath}): ${detail}`);
            }
        }

        if (!fs.readFileSync(asarPath).equals(originalLive)) {
            throw new Error('App changed during localization; please retry after the update completes');
        }

        const macBundleForPlist = process.platform === 'darwin' ? resolveMacAppBundle(resourcesDir) : null;
        const plistPath = macBundleForPlist ? path.join(macBundleForPlist, 'Contents', 'Info.plist') : null;
        const plistBackup = plistPath && fs.existsSync(plistPath) ? fs.readFileSync(plistPath) : null;

        if (process.platform === 'darwin' && !staging && macBundleForPlist && (options.syncWatcher || isRealAppInstallDir(macBundleForPlist))) {
            macWatcherSession = prepareMacWatcherSync();
        }

        replaceFileWithRetry(candidatePath, asarPath, !noKill);
        try {
            if (refreshBackup) replaceFileWithRetry(sourceArchive, bakPath, !noKill);
        } catch (error) {
            try {
                replaceFileWithRetry(rollbackArchive, asarPath, !noKill);
            } catch (rollbackError) {
                retainRecoveryFiles = true;
                throw new Error(`Backup promotion and rollback failed; original app retained at ${rollbackArchive}: ${rollbackError.message}`);
            }
            throw error;
        }

        // Remove staging directory from Contents/Resources before codesign seals the
        // bundle resources; removing buildDir after resign breaks macOS sealed resources.
        if (buildDir) {
            try {
                fs.rmSync(buildDir, { recursive: true, force: true });
                buildDir = undefined;
            } catch (error) {
                console.warn(`[提示] 临时目录清理失败（签名前）: ${buildDir}`);
            }
        }

        if (!staging) {
            cleanElectronCache();
            if (!resignFn(resourcesDir)) {
                let rollbackDir;
                try {
                    rollbackDir = fs.mkdtempSync(path.join(resourcesDir, '.antigravity-rollback-'));
                    const rollbackArchiveFile = path.join(rollbackDir, 'previous.asar');
                    fs.writeFileSync(rollbackArchiveFile, originalLive);
                    replaceFileWithRetry(rollbackArchiveFile, asarPath, !noKill);
                    if (plistBackup && plistPath) fs.writeFileSync(plistPath, plistBackup);
                    if (refreshBackup && fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
                } catch (rollbackError) {
                    if (rollbackDir) {
                        buildDir = rollbackDir;
                        retainRecoveryFiles = true;
                    }
                    throw new Error(`macOS 签名失败且回滚失败，原始文件保留于 ${buildDir || resourcesDir}: ${rollbackError.message}`);
                }
                if (rollbackDir) {
                    try { fs.rmSync(rollbackDir, { recursive: true, force: true }); } catch {}
                }
                return false;
            }
            if (macWatcherSession && macBundleForPlist) {
                commitMacWatcherSync(macWatcherSession, macBundleForPlist, asarPath);
            }
        }

        console.log(`[√] Antigravity 2.0 汉化部署完成！`);
        return true;
    } catch (error) {
        console.error(`[错误] 汉化未完成，未提交的候选包不会替换客户端: ${error.message}`);
        return false;
    } finally {
        cleanupMacWatcherSync(macWatcherSession);
        if (buildDir && !retainRecoveryFiles) {
            try { fs.rmSync(buildDir, { recursive: true, force: true }); } catch (error) {
                console.warn(`[提示] 临时目录已保留: ${buildDir}`);
            }
        }
    }
}

function restore20(resourcesDir, noKill = false, options = {}) {
    const asarPath = path.join(resourcesDir, "app.asar");
    const bakPath = path.join(resourcesDir, "app.asar.bak");
    const resignFn = typeof options.resignFn === 'function' ? options.resignFn : resignAppOnMac;

    if (!fs.existsSync(bakPath)) {
        console.log("[!] 未找到备份文件 app.asar.bak，可能尚未安装过汉化或备份被删除。");
        return false;
    }

    console.log("[还原] 正在用官方备份文件恢复...");
    let restoreDir;
    let retainRestoreFiles = false;
    try {
        restoreDir = fs.mkdtempSync(path.join(resourcesDir, '.antigravity-restore-'));
        const candidate = path.join(restoreDir, 'app.asar');
        const previousLive = fs.existsSync(asarPath) ? fs.readFileSync(asarPath) : null;
        const macBundleForPlist = process.platform === 'darwin' ? resolveMacAppBundle(resourcesDir) : null;
        const plistPath = macBundleForPlist ? path.join(macBundleForPlist, 'Contents', 'Info.plist') : null;
        const plistBackup = plistPath && fs.existsSync(plistPath) ? fs.readFileSync(plistPath) : null;

        fs.copyFileSync(bakPath, candidate);
        readAsarLayout(candidate);
        replaceFileWithRetry(candidate, asarPath, !noKill);

        // Clean restoreDir from Contents/Resources before codesign seals the bundle.
        try {
            fs.rmSync(restoreDir, { recursive: true, force: true });
            restoreDir = undefined;
        } catch {}

        if (!resignFn(resourcesDir)) {
            let rollbackDir;
            try {
                if (previousLive) {
                    rollbackDir = fs.mkdtempSync(path.join(resourcesDir, '.antigravity-restore-rb-'));
                    const previousBackup = path.join(rollbackDir, 'previous.asar');
                    fs.writeFileSync(previousBackup, previousLive);
                    replaceFileWithRetry(previousBackup, asarPath, !noKill);
                }
                if (plistBackup && plistPath) fs.writeFileSync(plistPath, plistBackup);
            } catch (rollbackError) {
                if (rollbackDir) {
                    restoreDir = rollbackDir;
                    retainRestoreFiles = true;
                }
                throw new Error(`macOS 恢复签名失败且回滚失败，原文件保留于 ${restoreDir || resourcesDir}: ${rollbackError.message}`);
            }
            if (rollbackDir) {
                try { fs.rmSync(rollbackDir, { recursive: true, force: true }); } catch {}
            }
            return false;
        }
    } catch (e) {
        console.error(`[错误] 恢复备份失败: ${e.message}`);
        if (process.platform === 'darwin' && e.code === 'EPERM') {
            console.error(`[提示] macOS 写入受限，请使用管理员权限运行脚本。`);
        }
        return false;
    } finally {
        if (restoreDir && !retainRestoreFiles) {
            try { fs.rmSync(restoreDir, { recursive: true, force: true }); } catch (_e) {}
        }
    }
    console.log("[√] 官方 app.asar 已成功恢复！");
    return true;
}

// ==========================================
// 交互式品牌显示选单 & 入口
// ==========================================
function readLineSyncFromStdin() {
    const chunks = [];
    const buf = Buffer.alloc(1);
    while (true) {
        try {
            const bytesRead = fs.readSync(0, buf, 0, 1, null);
            if (bytesRead === 0) break;
            if (buf[0] === 0x0a) break;
            if (buf[0] !== 0x0d) chunks.push(buf[0]);
        } catch (err) {
            if (err && err.code === 'EAGAIN') {
                sleepSync(20);
                continue;
            }
            break;
        }
    }
    return Buffer.from(chunks).toString('utf8').trim();
}

function promptBrandTitleInteractive() {
    if (USE_TW) {
        process.stdout.write('=======================================================\n');
        process.stdout.write('  Antigravity 2.0 繁體中文化一鍵安裝程式 (台灣 zh-TW)\n');
        process.stdout.write('=======================================================\n');
        process.stdout.write('\n請選擇左上角品牌顯示方式：\n');
        process.stdout.write('  [1] 保留官方英文「Antigravity」（預設，直接按 Enter）\n');
        process.stdout.write('  [2] 隱藏品牌標題列\n');
        process.stdout.write('  [3] 顯示為繁體中文譯名\n');
        process.stdout.write('請輸入選項 [1/2/3]（預設 1）：');
    } else {
        process.stdout.write('\n请选择左上角品牌显示方式：\n');
        process.stdout.write('  [1] 保留官方英文「Antigravity」（默认，直接按 Enter）\n');
        process.stdout.write('  [2] 隐藏品牌标题栏\n');
        process.stdout.write('  [3] 显示为简体中文译名\n');
        process.stdout.write('请输入选项 [1/2/3]（默认 1）：');
    }
    const answer = readLineSyncFromStdin();
    if (answer === '2') return 'hidden';
    if (answer === '3') return 'translated';
    return 'english';
}

function main() {
    if (!checkSupportedNodeVersion()) {
        process.exit(1);
    }
    let huifu = false;
    let manualDir = "";
    let noKill = false;
    let staging = false;
    let interactive = false;
    let syncWatcher = false;

    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--huifu') {
            huifu = true;
        } else if (args[i] === '--install-dir') {
            manualDir = args[i + 1] || "";
            i++;
        } else if (args[i] === '--no-kill') {
            noKill = true;
        } else if (args[i] === '--staging') {
            staging = true;
        } else if (args[i] === '--interactive') {
            interactive = true;
        } else if (args[i] === '--sync-watcher') {
            syncWatcher = true;
        } else if (args[i] === '--brand-title') {
            i++;
        }
    }

    if (interactive && !HAS_BRAND_TITLE_ARG && !huifu && !staging) {
        BRAND_TITLE_MODE = promptBrandTitleInteractive();
    }

    // 1. 探测路径
    const installDir = detectInstallationDir(manualDir);

    // 2. 检测客户端是否正在运行，并根据参数决定是否关闭以解除文件锁定
    wasAppRunning = checkIfAppIsRunning();
    if (noKill) {
        console.log("[跳过] 检测到 --no-kill 参数，跳过关闭 Antigravity 运行进程。");
    } else if (wasAppRunning) {
        closeAntigravityProcesses();
    }

    // 3. 找到 resources 资源目录
    let resourcesDir = "";
    if (fs.existsSync(path.join(installDir, "resources"))) {
        resourcesDir = path.join(installDir, "resources");
    } else if (fs.existsSync(path.join(installDir, "Contents", "Resources"))) {
        resourcesDir = path.join(installDir, "Contents", "Resources");
    } else if (installDir.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase().endsWith("/resources")) {
        resourcesDir = installDir;
    } else {
        if (fs.existsSync(path.join(installDir, "app.asar"))) {
            resourcesDir = installDir;
        } else {
            resourcesDir = path.join(installDir, "resources");
        }
    }

    if (!fs.existsSync(resourcesDir)) {
        console.error(`[错误] 无法定位有效的资源(resources)目录: ${resourcesDir}`);
        process.exit(1);
    }

    ensureWritePermission(resourcesDir);

    // 4. 执行安装或卸载恢复
    let success = false;

    if (huifu) {
        console.log("====== 正在卸载中文汉化，恢复官方原版 ======");
        success = restore20(resourcesDir, noKill);
    } else {
        console.log("====== 正在安装 Antigravity 中文汉化 ======");
        success = install20(resourcesDir, noKill, staging, { syncWatcher });
    }

    if (success && !huifu && !staging && process.platform === 'win32' && (syncWatcher || isRealAppInstallDir(installDir))) {
        syncActiveWindowsWatcher(installDir, resourcesDir);
    }

    // 5. 校验通过且原来客户端在运行，则自动重新启动客户端（仅当目标为有效客户端包/可执行程序时触发，避免自定义目录误弹 Finder）
    const macAppBundle = process.platform === 'darwin' ? resolveMacAppBundle(installDir) : null;
    const canRestartApp = process.platform === 'win32'
        ? fs.existsSync(path.join(installDir, 'Antigravity.exe'))
        : Boolean(macAppBundle);
    if (success && wasAppRunning && !noKill && canRestartApp) {
        console.log("\n[启动] 检测到安装前反重力客户端处于开启状态，正在重新启动客户端...");
        try {
            if (process.platform === 'win32') {
                const exePath = path.join(installDir, 'Antigravity.exe');
                const child = child_process.spawn(exePath, [], {
                    detached: true,
                    stdio: 'ignore'
                });
                child.unref();
                console.log("[启动] 客户端启动成功！");
            } else if (process.platform === 'darwin') {
                if (process.env.SUDO_USER && process.env.SUDO_USER !== 'root') {
                    child_process.exec(`sudo -u "${process.env.SUDO_USER}" open "${macAppBundle}"`);
                } else {
                    child_process.exec(`open "${macAppBundle}"`);
                }
                console.log("[启动] 客户端启动成功！");
            }
        } catch (e) {
            console.warn(`[警告] 客户端启动失败: ${e.message}`);
        }
    }

    if (success && !huifu && !staging && noKill && wasAppRunning) {
        console.warn("[提醒] Antigravity 目前仍在运行，内存仍加载旧版资源。请完全退出应用（macOS 请按 Cmd+Q 或从菜单栏图标选择「结束」，勿仅关闭窗口）后再重新打开，新翻译才会完整生效。");
    }

    if (!success) {
        process.exit(1);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateJs,
        loadRuntimeRules,
        install20,
        restore20,
        detectInstallationDir,
        checkIfAppIsRunning,
        closeAntigravityProcesses,
        ensureWritePermission,
        promptBrandTitleInteractive,
        cleanElectronCache,
        getPackageVersion,
        isRealAppInstallDir,
        discoverMacWatcherRuntimes,
        prepareMacWatcherSync,
        acquireWatcherLockSync,
        commitMacWatcherSync,
        cleanupMacWatcherSync,
        syncActiveWindowsWatcher
    };
}

if (require.main === module) main();

