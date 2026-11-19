const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let dictsDir = path.join(__dirname, '../dicts');
let dictsTwDir = path.join(__dirname, '../dicts_tw');

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dicts-dir' && args[i + 1]) {
        dictsDir = path.resolve(args[++i]);
    } else if (args[i] === '--dicts-tw-dir' && args[i + 1]) {
        dictsTwDir = path.resolve(args[++i]);
    }
}

// Strict Simplified-only characters that should never appear in Traditional Chinese (dicts_tw)
const STRICT_SC_CHARS_REGEX = /[们这来个时后会里为么没现让着给从还进种开实长见问间样动体机设浏账终资访对划专码并请与库发图级联议点线网链户显关选编辑删复贴换缩书签记录数调页栏项状态错确择寻检视载执将组储虚词阅围离频计认产单条仓价协约织缝触凭诊无据]/;

// Forbidden mainland / non-standard terminology & HK variants in Traditional Chinese (dicts_tw) per AGENTS.md
const FORBIDDEN_TC_TERMS = [
    '智能體', '代碼', '文檔', '賬號', '賬戶', '帳號', '應用程序', '自定義', '默認', '剪貼板',
    '設置', '窗口', '插件', '快捷鍵', '控制台', '拆分', '檔案資源管理器', '訪達',
    '全局', '腳本', '日誌', '打開', '開啓', '添加', '刷新', '本地', '遠程', '會話', '標籤頁',
    '啓', '爲', '錄制', '複制', '訂制', '髮送',
    '許可權', '登錄', '發送', '反饋', '視圖', '滾動', '函數', '禁用', '重置', '拖拽',
    '拖動', '沙盒', '佈局', '構建', '令牌', '重命名', '超時', '音頻', '視頻', '縮略圖',
    '選中', '聯繫', '導入', '導出', '菜單', '實例', '後台', '域名', '只讀', '組件',
    '副本', '套餐', '頭像', '查找', '字符', '二進制', '網關', '進程', '隊列', '字體',
    '二維碼', '白名單', '黑名單', '彈窗', '粘貼', '告警', '回調', '鉤子', '網頁端',
    '桌面端', '移動端', '倉庫', '置頂', '歸檔', '流式', '導航', '共享', '站點', '排查',
    '選項卡', '交付件', '小部件', '內聯', '枚舉', '提示框', '主目錄', '全域性',
    '產物', '身份', '訪問', '獲取', '保存', '列表', '批准', '審批', '替換', '雙擊',
    '單擊', '拉取請求', '當前', '“', '”', '‘', '’', '定時任務', '定時器', '並行', '完全完成', '發佈',
    '數據', '服務器', '客戶端', '內存', '軟件', '硬件', '鼠標', '網絡',
    '打印', '兼容', '克隆', '字節', '元數據', '憑據', '密鑰', '證書',
    '光標', '回車', '支持', '質量', '正則表達式', '佔位符', '通配符',
    '線程', '異步', '報錯', '調試', '簡歷', '博客', '在線', '緩存',
    '計算機', '缺省', '字節碼', '激光', '分辨率', '句柄', '指針', '類庫',
    '的時候', '賦能', '抓手', '閉環', '底層邏輯', '頂層設計', '降本增效',
    '組合拳', '賽道', '認知躍遷', '能力沉澱', '拉通', '全鏈路', '進度條',
    '復選框', '單選框', '滑塊', '下拉框', '彈出框', '自動補全', '加粗',
    '下劃線', '刪除線', '縮進', '截屏', '錄屏',
    '工作空間', '查看', '內核', '助力', '異常退出'
];

const FORBIDDEN_TC_REGEXES = [
    [/終端(?!機)/, '終端 (should be 終端機)'],
    [/工作流(?!程)/, '工作流 (should be 工作流程)'],
    [/虛擬機(?!器)/, '虛擬機 (should be 虛擬機器)'],
    [/時間戳(?!記)/, '時間戳 (should be 時間戳記)'],
    [/(?<!版面)配置/, '配置 (should be 設定)'],
    [/(?<!圓)餅圖/, '餅圖 (should be 圓餅圖)'],
    [/(?<!最)高級(?!別)/, '高級 (should be 進階)'],
    [/(?<!連)字號/, '字號 (should be 字級)'],
    [/全屏(?!障)/, '全屏 (should be 全螢幕)'],
    [/並發(?!布|佈)/, '並發 (should be 並行／同時)'],
    [/(?<!已)更改/, '更改 (should be 變更)'],
    [/進行(?:分析|修改|優化|配置|管理|分享|登入|建構|操作)/, '進行... (L0 輕動詞包裝，應直接使用動詞)'],
    [/(?<!被)被(?!(?:動|迫|害))[\u4e00-\u9fff]/, '被... (L0 嚴禁被動語態，應改為主動陳述)'],
    [/[。，！？：；][^\S\r\n]+[\u4e00-\u9fff]/, '全形標點後方不可加空格']
];

const RESERVED_SLASH_COMMAND_KEYS = new Set([
    'goal', 'swarm', 'boost', 'egm-boost', 'learn', 'compact', 'btw', 'grill-me', 'teamwork'
]);

function normalizeText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ')
               .trim()
               .replace(/[‘’]/g, "'")
               .replace(/[“”]/g, '"')
               .replace(/…/g, '...');
}

function compareDicts(targetDictsDir = dictsDir, targetDictsTwDir = dictsTwDir) {
    let hasError = false;
    
    if (!fs.existsSync(targetDictsDir) || !fs.existsSync(targetDictsTwDir)) {
        console.error('Error: dicts or dicts_tw directory does not exist.');
        return false;
    }
    
    const scFiles = fs.readdirSync(targetDictsDir).filter(f => f.endsWith('.json'));
    const tcFiles = fs.readdirSync(targetDictsTwDir).filter(f => f.endsWith('.json'));
    
    // Check if the set of files is identical
    const allFiles = Array.from(new Set([...scFiles, ...tcFiles])).sort();
    const seenAcrossFiles = new Map();
    const seenNormalizedAcrossFiles = new Map();
    
    for (const file of allFiles) {
        const scFilePath = path.join(targetDictsDir, file);
        const tcFilePath = path.join(targetDictsTwDir, file);
        
        if (!fs.existsSync(scFilePath)) {
            console.error(`Error: File ${file} exists in dicts_tw but is missing in dicts.`);
            hasError = true;
            continue;
        }
        if (!fs.existsSync(tcFilePath)) {
            console.error(`Error: File ${file} exists in dicts but is missing in dicts_tw.`);
            hasError = true;
            continue;
        }
        
        try {
            const scData = JSON.parse(fs.readFileSync(scFilePath, 'utf8'));
            const tcData = JSON.parse(fs.readFileSync(tcFilePath, 'utf8'));

            if (!scData || typeof scData !== 'object' || Array.isArray(scData)) {
                console.error(`Error in dicts/${file}: Root JSON value must be a plain object.`);
                hasError = true;
                continue;
            }
            if (!tcData || typeof tcData !== 'object' || Array.isArray(tcData)) {
                console.error(`Error in dicts_tw/${file}: Root JSON value must be a plain object.`);
                hasError = true;
                continue;
            }
            
            const scKeys = Object.keys(scData);
            const tcKeys = Object.keys(tcData);
            
            const scKeySet = new Set(scKeys);
            const tcKeySet = new Set(tcKeys);
            
            // Check keys in SC but not in TC, empty SC values, and cross-file duplicate keys
            for (const key of scKeys) {
                if (!tcKeySet.has(key)) {
                    console.error(`Error in ${file}: Key "${key}" exists in dicts but is missing in dicts_tw.`);
                    hasError = true;
                }
                const scVal = scData[key];
                if (typeof scVal !== 'string' || scVal.trim() === '') {
                    console.error(`Error in dicts/${file}: Key "${key}" has empty or non-string value.`);
                    hasError = true;
                }
                if (seenAcrossFiles.has(key)) {
                    console.error(`Error: Duplicate key "${key}" found in both ${seenAcrossFiles.get(key)} and ${file}.`);
                    hasError = true;
                } else {
                    seenAcrossFiles.set(key, file);
                }
                const normKey = normalizeText(key);
                if (normKey) {
                    if (seenNormalizedAcrossFiles.has(normKey) && seenNormalizedAcrossFiles.get(normKey).raw !== key) {
                        const prev = seenNormalizedAcrossFiles.get(normKey);
                        console.error(`Error: Normalized key collision "${normKey}" between ${prev.file} ("${prev.raw}") and ${file} ("${key}").`);
                        hasError = true;
                    } else if (!seenNormalizedAcrossFiles.has(normKey)) {
                        seenNormalizedAcrossFiles.set(normKey, { file, raw: key });
                    }
                }
            }
            
            // Check keys in TC but not in SC, empty TC values, and Simplified/forbidden leaks
            for (const key of tcKeys) {
                if (!scKeySet.has(key)) {
                    console.error(`Error in ${file}: Key "${key}" exists in dicts_tw but is missing in dicts.`);
                    hasError = true;
                }
                if (/^\/[a-zA-Z0-9_.:-]+$/.test(key) || RESERVED_SLASH_COMMAND_KEYS.has(key)) {
                    console.error(`Error in dicts_tw/${file}: Key "${key}" is a reserved Slash command identifier and must not be translated.`);
                    hasError = true;
                }
                const tcVal = tcData[key];
                if (typeof tcVal !== 'string' || tcVal.trim() === '') {
                    console.error(`Error in dicts_tw/${file}: Key "${key}" has empty or non-string value.`);
                    hasError = true;
                } else {
                    const scMatch = tcVal.match(STRICT_SC_CHARS_REGEX);
                    if (scMatch) {
                        console.error(`Error in dicts_tw/${file}: Key "${key}" contains Simplified Chinese character "${scMatch[0]}" in value: ${tcVal}`);
                        hasError = true;
                    }
                    for (const term of FORBIDDEN_TC_TERMS) {
                        if (tcVal.includes(term)) {
                            console.error(`Error in dicts_tw/${file}: Key "${key}" contains forbidden term "${term}" in value: ${tcVal}`);
                            hasError = true;
                        }
                    }
                    for (const [re, desc] of FORBIDDEN_TC_REGEXES) {
                        if (re.test(tcVal)) {
                            console.error(`Error in dicts_tw/${file}: Key "${key}" contains forbidden term ${desc} in value: ${tcVal}`);
                            hasError = true;
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`Error parsing JSON file ${file}:`, e.message);
            hasError = true;
        }
    }
    
    if (!hasError) {
        console.log('All dictionaries are perfectly aligned!');
    }
    return !hasError;
}

if (require.main === module) {
    process.exit(compareDicts() ? 0 : 1);
}

module.exports = {
    compareDicts,
    normalizeText,
    STRICT_SC_CHARS_REGEX,
    FORBIDDEN_TC_TERMS,
    FORBIDDEN_TC_REGEXES
};
