(() => {
    if (typeof window !== 'undefined' && typeof window.__agCnRuntimeStart === 'function') {
        window.__agCnRuntimeStart();
        return;
    }
    // V13.0 模块化表驱动物理隔离引擎 (原生独立 JS 运行时)
    const USE_TW = __USE_TW_PLACEHOLDER__;
    const RUNTIME_RULES = RULES_PLACEHOLDER || {};
    const RULE_PROTECTED = (RUNTIME_RULES.protected && typeof RUNTIME_RULES.protected === 'object') ? RUNTIME_RULES.protected : {};
    function resolveStringSet(defaults, configured) {
        const list = Array.isArray(configured) ? configured : defaults;
        const set = new Set();
        for (const item of list) {
            if (typeof item === 'string' && item.trim()) set.add(item);
        }
        return set;
    }
    const map = new Map(Object.entries(DICT_PLACEHOLDER));
    const lowerMap = new Map();
    const LOWER_WORDS_EXCLUDE = resolveStringSet([
        'on', 'in', 'to', 'at', 'by', 'for', 'with', 'as', 'system', 'review', 'active',
        'browser', 'global', 'including', 'and', 'or', 'file', 'files', 'help', 'app',
        'plan', 'search', 'coordinator', 'goal', 'goals', 'swarm', 'boost', 'learn',
        'schedule', 'compact', 'automation', 'plugin', 'plugins', 'btw', 'clear', 'init',
        'teamwork', 'grill-me', 'egm-boost', 'split', 'commit', 'reset', 'stop', 'status',
        'filter', 'new', 'open', 'start', 'manage', 'custom', 'default', 'rules',
        'low', 'medium', 'high', 'extra', 'max', 'thinking effort',
        'apply', 'create', 'hide', 'show', 'remove', 'replace', 'verify', 'block',
        'folder', 'repository', 'error', 'other', 'environment', 'before', 'after',
        'added', 'approved', 'protocol', 'variables', 'website', 'design'
    ], RULE_PROTECTED.lowerWordsExclude);
    for (const [k, v] of map.entries()) {
        const lowerK = k.toLowerCase();
        if (LOWER_WORDS_EXCLUDE.has(lowerK) && k !== lowerK) {
            continue;
        }
        lowerMap.set(lowerK, v);
    }

    const longEntries = Array.from(map.entries())
        .filter(([k]) => k.length > 15 && k.includes(' '))
        .sort((a, b) => b[0].length - a[0].length)
        .map(([k, v]) => [k, v, k.toLowerCase()]);
    const translatedValues = new WeakMap();
    const unchangedTextValues = new WeakMap();
    const longMissCache = new WeakMap();

    // 轻量级安全隔离：跳过脚本、样式、代码块(pre/code)及文档头元数据
    const SKIP_TAGS = ['SCRIPT', 'STYLE', 'PRE', 'CODE', 'HEAD', 'LINK', 'META', 'NOSCRIPT'];

    // 代码、富文本输入框及对话内容隔离选择器：排除 Lexical 输入框、用户消息、AI 响应正文、思考内容、代码块、终端、文件路径及模型思考強度選項
    const CODE_ISOLATION_SELECTOR = 'script, style, pre, code, .monaco-editor, .cm-editor, .cm-line, [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""], [data-lexical-editor], .terminal, .xterm, .code-line, .code-block, .line-content, [aria-label="File Viewer"], [aria-label="文件查看器"], [aria-label="檔案檢視器"], [data-file-uri], [data-uri], [class*="diffEditor"], .token, .hljs, [class*="mtk"], .font-mono, [data-quotable-inline="true"], .context-scope-mention, [data-mention-menu] [data-testid="menu-option-label"], [role="listbox"][aria-label="Mentions"] [data-testid="menu-option-label"], [data-testid="model-selector-effort-option"], [data-testid*="model-selector-effort"], [data-testid*="effort-option"], [data-testid="file-title-name"], [data-testid="entity-pill"], [data-project-card="true"], [data-testid="conversation-row-sidebar"] span.truncate, [data-testid="conversation-row-history"] span.truncate, [translate="no"], .notranslate, .md-divider-spacing, .cursor-edit, [data-testid="user-input-step"] [data-quotable="true"], [data-testid="user-input-step"] .whitespace-pre-wrap, [data-testid="planner-response-text"], [data-testid="thinking-collapsible-trigger"] + div, [data-testid="thinking-collapsible-trigger"] ~ div, .msg-body, .sys-text, .node-label, .raw-meta .path, .o2-mauth, .hv-nm, .o2-wchip.bee > span:last-child, .o2-m[data-o2who]:not(.all) > span:last-child';

    // 字型圖示容器：文字內容是圖示名稱，不是介面文字
    const ICON_FONT_SELECTOR = '.google-symbols, .material-symbols-outlined, .material-symbols-rounded, .material-symbols-sharp, .material-icons';
    // Antigravity 2.35.1 內建 SVG 表缺少、會退回字型渲染的圖示（由 main.js 圖示元件與 icon 屬性比對得出）
    const ICON_FONT_FALLBACK_PATHS = {
        restore_page: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
        comment: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
        format_quote: ['M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z', 'M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z'],
        laptop_shield: ['M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16', 'M12 8l3 1.2v1.8c0 1.6-1.3 2.7-3 3.2-1.7-.5-3-1.6-3-3.2V9.2z']
    };
    // 權限預設膠囊鈕短標籤 [簡體, 繁體]
    const PERMISSION_PILL_LABELS = {
        'Request Review': ['请求审查', '請求審查'],
        'Default': ['默认', '預設'],
        'Auto': ['自动', '自動'],
        'Turbo': ['极速', '極速'],
        // 「Full machine」的短標籤；字典裡的 Machine 指雲端執行環境，不適用於此
        'Machine': ['整机', '全機']
    };

    function isCodeOrEditor(node) {
        try {
            if (!node) return false;
            let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
            if (!el && typeof node.getRootNode === 'function') {
                el = node.getRootNode().host || null;
            }
            if (!el) return false;
            if (el.isContentEditable) return true;
            if (node.nodeType === Node.TEXT_NODE && el) {
                if (el.tagName === 'TEXTAREA') return true;
                if (el.tagName === 'OPTION' && !el.hasAttribute('value')) return true;
            }
            const active = typeof document !== 'undefined' ? document.activeElement : null;
            if (active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active.getAttribute && active.getAttribute('data-lexical-editor') === 'true')) && (active === el || active.contains(el))) {
                return true;
            }
            while (el) {
                if (el.isContentEditable) return true;
                if (typeof el.closest === 'function' && el.closest(CODE_ISOLATION_SELECTOR)) {
                    return true;
                }
                const root = typeof el.getRootNode === 'function' ? el.getRootNode() : null;
                el = (root && root.host) ? root.host : null;
            }
            return false;
        } catch (e) {
            return true;
        }
    }

    function norm(s) {
        if (!s) return '';
        return s.replace(/\s+/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').trim();
    }

    function makeFlexibleRegex(str) {
        let pattern = '';
        for (let i = 0; i < str.length; i++) {
            const ch = str[i];
            if (ch === "'" || ch === '’' || ch === '‘') {
                pattern += "['’‘]";
            } else if (ch === '"' || ch === '“' || ch === '”') {
                pattern += '["“”]';
            } else if (str.substr(i, 3) === '...' || ch === '…') {
                pattern += '(?:\.\.\.|…)';
                if (str.substr(i, 3) === '...') i += 2;
            } else if (/\s/.test(ch)) {
                pattern += '\\s+';
            } else {
                pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }
        }
        return new RegExp(pattern, 'g');
    }

    function translateWithShortcut(val) {
        if (!val) return null;
        const match = val.match(/^(.+?)\s*\(((?:Ctrl|Cmd|Alt|Shift|⌘|⌥|⇧|⌃)\+?[^)]*|Enter|Escape|Esc|Space|Tab|Backspace|Delete|⏎|←|→|↑|↓|Aa|ab|\.\*|-|0|[a-zA-Z0-9])\)$/i);
        if (match) {
            const prefix = match[1].trim();
            const normPref = norm(prefix);
            const lowerPref = normPref.toLowerCase();
            let transPref = null;
            if (map.has(normPref)) {
                transPref = map.get(normPref);
            } else if (lowerMap.has(lowerPref)) {
                transPref = lowerMap.get(lowerPref);
            }
            if (transPref) {
                return transPref + " (" + match[2] + ")";
            }
        }
        return null;
    }

    // ==========================================
    // 原生系统右键菜单 (Native Context Menu) 汉化拦截
    // ==========================================
    function translateContextMenuLabel(label) {
        if (!label || typeof label !== 'string') return label;
        let trimmed = norm(label);
        if (!trimmed) return label;

        let isDefault = false;
        if (/\s*\((?:Default|預設|默认)\)$/i.test(trimmed)) {
            trimmed = trimmed.replace(/\s*\((?:Default|預設|默认)\)$/i, '').trim();
            isDefault = true;
        }

        let translated = null;
        const shortcutTrans = translateWithShortcut(trimmed);
        if (shortcutTrans) {
            translated = shortcutTrans;
        } else if (map.has(trimmed)) {
            translated = map.get(trimmed);
        } else if (lowerMap.has(trimmed.toLowerCase())) {
            translated = lowerMap.get(trimmed.toLowerCase());
        }

        if (translated) {
            return isDefault ? (translated + (USE_TW ? " (預設)" : " (默认)")) : translated;
        } else if (isDefault) {
            return trimmed + (USE_TW ? " (預設)" : " (默认)");
        }
        return label;
    }

    function translateContextMenuItems(items) {
        if (!Array.isArray(items)) return items;
        return items.map(item => {
            if (!item || typeof item !== 'object') return item;
            const newItem = Object.assign({}, item);
            if (newItem.label) {
                newItem.label = translateContextMenuLabel(newItem.label);
            }
            if (Array.isArray(newItem.submenu)) {
                newItem.submenu = translateContextMenuItems(newItem.submenu);
            }
            if (Array.isArray(newItem.items)) {
                newItem.items = translateContextMenuItems(newItem.items);
            }
            return newItem;
        });
    }

    function hookNativeContextMenu() {
        try {
            const electronModule = typeof electron_1 !== 'undefined' ? electron_1 : (typeof require === 'function' ? require('electron') : null);
            if (electronModule && electronModule.ipcRenderer && !electronModule.ipcRenderer._cnContextMenuHooked) {
                electronModule.ipcRenderer._cnContextMenuHooked = true;
                const origInvoke = electronModule.ipcRenderer.invoke.bind(electronModule.ipcRenderer);
                electronModule.ipcRenderer.invoke = function(channel, ...args) {
                    if (channel === 'window:show-context-menu' && Array.isArray(args[0])) {
                        try {
                            args[0] = translateContextMenuItems(args[0]);
                        } catch (e) {}
                    }
                    return origInvoke(channel, ...args);
                };
            }
        } catch (e) {}

        try {
            if (typeof window !== 'undefined' && window.electronNative && !window.electronNative._cnContextMenuHooked) {
                const origShow = window.electronNative.showContextMenu;
                if (typeof origShow === 'function') {
                    window.electronNative._cnContextMenuHooked = true;
                    window.electronNative.showContextMenu = function(items) {
                        try {
                            items = translateContextMenuItems(items);
                        } catch (e) {}
                        return origShow.call(this, items);
                    };
                }
            }
        } catch (e) {}
    }

    hookNativeContextMenu();

    function isFilePathOrUri(s) {
        if (!s) return false;
        return /^[a-zA-Z]:[\\/]/.test(s) || /^[\\/~].*[\\/]/.test(s) || /[\\/]SKILL\.md/i.test(s) || /[\\/]\.gemini[\\/]/i.test(s) || /^file:\/\//i.test(s);
    }

    function formatUsageDuration(value) {
        const text = value.trim();
        const tokens = /([0-9]+(?:\.[0-9]+)?)\s*(years?|yr|months?|mo|weeks?|w|days?|d|hours?|h|minutes?|min|m|seconds?|sec|s)(?![a-z])/gi;
        const parts = [];
        let end = 0;
        for (const match of text.matchAll(tokens)) {
            const gap = text.slice(end, match.index);
            if (!/^[\s,]*$/.test(gap) && !(end === 0 && gap.trim() === '<')) return null;
            const unit = match[2].toLowerCase();
            const name = /^(year|yr)/.test(unit) ? '年'
                : /^(month|mo)/.test(unit) ? (USE_TW ? '個月' : '个月')
                : /^(week|w)/.test(unit) ? (USE_TW ? '週' : '周')
                : /^(day|d)/.test(unit) ? '天'
                : /^(hour|h)/.test(unit) ? (USE_TW ? '小時' : '小时')
                : /^(minute|min|m)$/.test(unit) || /^minutes$/.test(unit) ? (USE_TW ? '分鐘' : '分钟') : '秒';
            parts.push((end === 0 && gap.trim() === '<' ? '<' : '') + match[1] + ' ' + name);
            end = match.index + match[0].length;
        }
        return parts.length && !text.slice(end).trim() ? parts.join(' ') : null;
    }

    function translateLimitLabel(raw) {
        const s = raw.trim();
        if (/^daily\s+limit$/i.test(s)) return USE_TW ? '每日上限' : '每日限额';
        if (/^weekly\s+limit$/i.test(s)) return USE_TW ? '每週上限' : '每周限额';
        if (/^monthly\s+limit$/i.test(s)) return USE_TW ? '每月上限' : '每月限额';
        const m = s.match(/^([0-9]+)(?:[- ]*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?|w|wk|weeks?))\s+limit$/i);
        if (m) {
            const unit = m[2].toLowerCase();
            const unitName = /^(?:w|wk|weeks?)$/.test(unit) ? (USE_TW ? '週' : '周')
                : /^(?:d|days?)$/.test(unit) ? '天'
                : /^(?:h|hr|hours?)$/.test(unit) ? (USE_TW ? '小時' : '小时')
                : /^(?:m|min|minutes?)$/.test(unit) ? (USE_TW ? '分鐘' : '分钟') : '秒';
            return m[1] + ' ' + unitName + (USE_TW ? '上限' : '限额');
        }
        return null;
    }

    function translateResetPart(raw) {
        const reset = raw.trim().match(/^(?:Resets|Refreshes)\s+in\s+(.+)$/i);
        if (!reset) return null;
        const duration = formatUsageDuration(reset[1]);
        return duration ? (duration + (USE_TW ? '後重設' : '后重置')) : null;
    }

    function translateUsageText(value) {
        const combo = value.match(/^(.+?),\s*((?:resets|refreshes)\s+in\s+.+)$/i);
        if (combo) {
            const limitPart = translateLimitLabel(combo[1]) || map.get(combo[1].trim()) || lowerMap.get(combo[1].trim().toLowerCase());
            const resetPart = translateResetPart(combo[2]);
            if (limitPart && resetPart) return limitPart + '，' + resetPart;
        }
        const limitLabel = translateLimitLabel(value);
        if (limitLabel) return limitLabel;
        const remaining = value.match(/^([0-9]+(?:\.[0-9]+)?\s*%|%)\s+left$/i);
        if (remaining) return remaining[1] + (USE_TW ? ' 剩餘' : ' 剩余');
        const reset = translateResetPart(value);
        if (reset) return reset;
        return null;
    }

    function isModelMenuText(node) {
        const menu = node.parentElement && node.parentElement.closest('[role="menu"], [role="listbox"]');
        if (!menu) return false;
        let label = menu.getAttribute('aria-label');
        if (!label) {
            const root = menu.getRootNode();
            label = (menu.getAttribute('aria-labelledby') || '').trim().split(/\s+/).map(id => {
                const target = (root.getElementById && root.getElementById(id)) || document.getElementById(id);
                return target ? (target.getAttribute('aria-label') || target.textContent || '') : '';
            }).join(' ');
        }
        return /^(Select model|选择模型|選擇模型)/i.test(norm(label || ''));
    }

    const PROTECTED_MODEL_EFFORT_LABELS = resolveStringSet(
        ['Low', 'Medium', 'High', 'Extra', 'Max', 'Thinking Effort', 'Thinking effort'],
        RULE_PROTECTED.modelEffortLabels
    );

    function isModelEffortLabelProtected(node, valNorm) {
        try {
            if (!PROTECTED_MODEL_EFFORT_LABELS.has(valNorm)) return false;
            const el = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
            if (!el || typeof el.closest !== 'function') return false;
            return Boolean(
                isModelMenuText(node) ||
                el.closest('[data-testid="model-selector-effort-option"], [data-testid*="model-selector"], [aria-label^="Select model" i], [aria-label^="選擇模型"], [aria-label^="选择模型"]')
            );
        } catch (e) {}
        return false;
    }

    const KNOWN_SLASH_COMMANDS = resolveStringSet([
        'goal', 'swarm', 'boost', 'egm-boost', 'learn', 'schedule', 'plan', 'browser',
        'compact', 'grill-me', 'teamwork', 'automation', 'plugin', 'btw', 'clear',
        'help', 'init', 'review', 'split', 'commit', 'reset', 'stop', 'status', 'filter',
        'swarm-autonomous-pipeline'
    ], RULE_PROTECTED.slashCommands);
    const SLASH_ITEM_SELECTOR = '[role="option"], [cmdk-item], [data-testid*="slash"], [data-testid*="typeahead"], [data-testid*="autocomplete"], [data-testid*="mention"], [data-testid*="fastpick"], [class*="typeahead"], [class*="autocomplete"], [class*="mention"], [class*="fastpick" i]';
    const SLASH_LIST_SELECTOR = '[role="listbox"], [cmdk-list], [data-lexical-typeahead-menu], [data-mention-menu], [data-testid*="slash"], [data-testid*="typeahead"], [data-testid*="autocomplete"], [data-testid*="mention"], [data-testid*="fastpick"], [class*="typeahead"], [class*="autocomplete"], [class*="mention"], [class*="fastpick" i]';

    function isSlashCommandNameNode(node, valNorm) {
        try {
            if (!valNorm) return false;
            if (/^\/[a-zA-Z0-9_.:-]+$/.test(valNorm)) return true;
            const el = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
            if (!el) return false;
            if (typeof el.closest === 'function') {
                if (el.closest('[data-testid="menu-option-description"], [data-testid="menu-option-trailing-label"], [class*="desc" i], [data-testid*="desc" i], [class*="subtitle" i], [class*="detail" i], [class*="hint" i]')) {
                    return false;
                }
            }
            // 拆分節點（如 <span>/</span><span>goal</span> 或 <span>/<span>goal</span></span>）
            let cur = el;
            for (let depth = 0; depth < 3 && cur; depth++) {
                const txt = norm(cur.textContent || '');
                if (/^\/[a-zA-Z][a-zA-Z0-9_.:-]*$/.test(txt)) return true;
                cur = cur.parentElement;
            }
            const prevSib = (node.previousSibling && node.previousSibling.textContent) || (el.previousSibling && el.previousSibling.textContent) || '';
            if (prevSib.trim() === '/' && /^[a-zA-Z][a-zA-Z0-9_.:-]*$/.test(valNorm)) return true;

            if (typeof el.closest !== 'function') return false;
            const item = el.closest(SLASH_ITEM_SELECTOR);
            const list = el.closest(SLASH_LIST_SELECTOR);
            if (!item && !list) return false;

            if (el.closest('[data-mention-menu] [data-testid="menu-option-label"], [role="listbox"][aria-label="Mentions"] [data-testid="menu-option-label"]')) {
                return true;
            }
            if (!/^\/?[a-zA-Z][a-zA-Z0-9_.:-]{0,48}$/.test(valNorm)) return false;

            const itemText = item ? String(item.textContent || '').trimStart() : '';
            const itemVal = item ? ((item.getAttribute && (item.getAttribute('data-value') || item.getAttribute('value'))) || '') : '';
            const listLabel = list && list.getAttribute ? (list.getAttribute('aria-label') || '') : '';
            const isConfirmedSlashMenu = Boolean(
                el.closest('[data-lexical-typeahead-menu], [data-mention-menu], [data-testid*="slash"], [data-testid*="typeahead"], [data-testid*="command-menu"], [class*="typeahead"], [class*="slash-command"]') ||
                /slash|command|typeahead|autocomplete|mention/i.test(listLabel) ||
                itemText.startsWith('/') ||
                itemVal.trim().startsWith('/')
            );

            const hasNameMarker = Boolean(
                (el.matches && el.matches('code, kbd, .font-mono, [data-testid="menu-option-label"], [class*="name" i], [class*="title" i], [class*="label" i], [class*="command" i], [class*="cmd" i], [data-testid*="name" i], [data-testid*="command" i], [data-testid*="title" i], [data-testid*="label" i]')) ||
                el.closest('code, kbd, .font-mono, [data-testid="menu-option-label"], [data-testid*="command" i]')
            );
            const lowerVal = valNorm.toLowerCase();
            if (isConfirmedSlashMenu) {
                if (hasNameMarker || valNorm === lowerVal || KNOWN_SLASH_COMMANDS.has(lowerVal)) {
                    return true;
                }
            }
            if (KNOWN_SLASH_COMMANDS.has(lowerVal)) {
                const hasDescSibling = Boolean(item && item.querySelector && item.querySelector('[data-testid="menu-option-description"], [class*="desc" i], [data-testid*="desc" i], [class*="subtitle" i], [class*="detail" i]'));
                if (valNorm === lowerVal || valNorm.includes('-') || hasDescSibling) {
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }

    function refreshMenusLabelledBy(target) {
        if (!target.id) return;
        const roots = new Set([document, target.getRootNode()]);
        for (const root of roots) {
            if (!root.querySelectorAll) continue;
            for (const menu of root.querySelectorAll('[role="menu"][aria-labelledby]')) {
                if ((menu.getAttribute('aria-labelledby') || '').split(/\s+/).includes(target.id)) {
                    translateNode(menu);
                }
            }
        }
    }

    // ==========================================
    // 声明式动态正则规则表 (Table-Driven Dynamic Rules)
    // ==========================================
    const UNIT_MAP = {
        s: ['秒', '秒'],
        m: ['分钟', '分鐘'],
        h: ['小时', '小時'],
        d: ['天', '天'],
        w: ['周', '週'],
        mo: ['个月', '個月'],
        yr: ['年', '年']
    };

    const EN_MONTHS = {
        january: 1, jan: 1,
        february: 2, feb: 2,
        march: 3, mar: 3,
        april: 4, apr: 4,
        may: 5,
        june: 6, jun: 6,
        july: 7, jul: 7,
        august: 8, aug: 8,
        september: 9, sep: 9, sept: 9,
        october: 10, oct: 10,
        november: 11, nov: 11,
        december: 12, dec: 12
    };

    function formatEnglishDate(dateStr) {
        if (!dateStr) return '';
        const trimmed = String(dateStr).trim().replace(/[.]+$/, '');
        const m1 = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
        if (m1) {
            const mon = EN_MONTHS[m1[1].toLowerCase()];
            if (mon) return m1[3] + ' 年 ' + mon + ' 月 ' + m1[2] + ' 日';
        }
        const m2 = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
        if (m2) {
            const mon = EN_MONTHS[m2[2].toLowerCase()];
            if (mon) return m2[3] + ' 年 ' + mon + ' 月 ' + m2[1] + ' 日';
        }
        const m3 = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (m3) {
            return m3[1] + ' 年 ' + parseInt(m3[2], 10) + ' 月 ' + parseInt(m3[3], 10) + ' 日';
        }
        return trimmed;
    }

    function formatPlanAudience(audienceStr) {
        if (!audienceStr || typeof audienceStr !== 'string') return audienceStr;
        const s = norm(audienceStr).replace(/[.]+$/, '');
        const isSubscribers = /subscriber/i.test(s);
        const hasPlanWord = /\bplans?\b/i.test(s);
        const hasPaid = /\bpaid\b/i.test(s);
        const lower = s.toLowerCase();

        if (lower.includes('pro') && lower.includes('ultra')) {
            const proFirst = lower.indexOf('pro') < lower.indexOf('ultra');
            const tierPair = proFirst
                ? (USE_TW ? 'Pro 與 Ultra' : 'Pro 与 Ultra')
                : (USE_TW ? 'Ultra 與 Pro' : 'Ultra 与 Pro');
            if (isSubscribers) {
                if (hasPaid && hasPlanWord) {
                    return tierPair + (USE_TW ? ' 付費方案訂閱者' : ' 付费方案订阅者');
                }
                if (hasPaid) {
                    return tierPair + (USE_TW ? ' 付費訂閱者' : ' 付费订阅者');
                }
                if (hasPlanWord) {
                    return tierPair + (USE_TW ? ' 方案訂閱者' : ' 方案订阅者');
                }
                return tierPair + (USE_TW ? ' 訂閱者' : ' 订阅者');
            }
            if (hasPaid) {
                return tierPair + (USE_TW ? ' 付費方案' : ' 付费方案');
            }
            return tierPair + (USE_TW ? ' 方案' : ' 方案');
        }
        if (lower.includes('ultra')) {
            if (isSubscribers) {
                if (hasPaid && hasPlanWord) {
                    return USE_TW ? 'Ultra 付費方案訂閱者' : 'Ultra 付费方案订阅者';
                }
                if (hasPaid) {
                    return USE_TW ? 'Ultra 付費訂閱者' : 'Ultra 付费订阅者';
                }
                return hasPlanWord
                    ? (USE_TW ? 'Ultra 方案訂閱者' : 'Ultra 方案订阅者')
                    : (USE_TW ? 'Ultra 訂閱者' : 'Ultra 订阅者');
            }
            return hasPaid
                ? (USE_TW ? 'Ultra 付費方案' : 'Ultra 付费方案')
                : (USE_TW ? 'Ultra 方案' : 'Ultra 方案');
        }
        if (lower.includes('pro')) {
            if (isSubscribers) {
                if (hasPaid && hasPlanWord) {
                    return USE_TW ? 'Pro 付費方案訂閱者' : 'Pro 付费方案订阅者';
                }
                if (hasPaid) {
                    return USE_TW ? 'Pro 付費訂閱者' : 'Pro 付费订阅者';
                }
                if (hasPlanWord) {
                    return USE_TW ? 'Pro 方案訂閱者' : 'Pro 方案订阅者';
                }
                return USE_TW ? 'Pro 訂閱者' : 'Pro 订阅者';
            }
            return hasPaid
                ? (USE_TW ? 'Pro 付費方案' : 'Pro 付费方案')
                : (USE_TW ? 'Pro 方案' : 'Pro 方案');
        }
        return audienceStr;
    }

    function formatCompactDuration(str) {
        return String(str || '').trim()
            .replace(/(\d+)\s*d\b/gi, '$1 天')
            .replace(/(\d+)\s*h\b/gi, USE_TW ? '$1 小時' : '$1 小时')
            .replace(/(\d+)\s*m\b/gi, USE_TW ? '$1 分鐘' : '$1 分钟')
            .replace(/(\d+)\s*s\b/gi, '$1 秒');
    }

    const SCOPED_SWARM_MAP = (() => {
        const out = {};
        const srcMap = RUNTIME_RULES.scopedMaps && RUNTIME_RULES.scopedMaps.swarm;
        if (srcMap && typeof srcMap === 'object') {
            for (const [k, pair] of Object.entries(srcMap)) {
                if (pair && typeof pair.sc === 'string' && typeof pair.tw === 'string') {
                    out[k] = [pair.sc, pair.tw];
                }
            }
        }
        return out;
    })();

    function isSwarmUiContext(el) {
        try {
            const doc = (el && el.ownerDocument) || (typeof document !== 'undefined' ? document : null);
            if (doc && (doc.getElementById('swarm-title') || doc.getElementById('replay-label') || doc.querySelector('[data-testid^="swarm-"]'))) {
                return true;
            }
            if (el && typeof el.closest === 'function') {
                return Boolean(el.closest('[data-testid^="swarm-"], .o2, .player, .graph-legend, .raw-toolbar'));
            }
        } catch (e) {}
        return false;
    }

    function translateSwarmComposite(raw) {
        if (!raw || typeof raw !== 'string') return null;
        const trimmed = raw.trim();
        const edgeMatch = trimmed.match(/^([^\s→]+)\s*→\s*([^\s:]+):\s*(\d+)\s+direct(?:,\s*(\d+)\s+via @all)?$/i);
        if (edgeMatch) {
            return edgeMatch[1] + ' → ' + edgeMatch[2] + '：' + edgeMatch[3] + ' 次直接提及' +
                (edgeMatch[4] ? ('，' + edgeMatch[4] + (USE_TW ? ' 次透過 @all' : ' 次通过 @all')) : '');
        }
        const outsiderMatch = trimmed.match(/^(\S+)\s+\(not on the roster\)$/i);
        if (outsiderMatch) {
            return outsiderMatch[1] + (USE_TW ? '（不在成員名單中）' : '（不在成员名单中）');
        }
        const sharedBoardMatch = trimmed.match(/^Shared\s+(.+?)\s+board(?:\s+(.*))?$/i);
        if (sharedBoardMatch) {
            return (USE_TW ? '共用 ' : '共享 ') + sharedBoardMatch[1] + ' 看板' + (sharedBoardMatch[2] ? ' ' + sharedBoardMatch[2] : '');
        }
        const runsOnMatch = trimmed.match(/^Runs on\s+(.+)$/);
        if (runsOnMatch) {
            return (USE_TW ? '執行於 ' : '运行于 ') + runsOnMatch[1];
        }
        const errMatch = trimmed.match(/^Error:\s*(.+)$/i);
        if (errMatch) {
            return (USE_TW ? '錯誤：' : '错误：') + errMatch[1];
        }
        const openMemberMatch = trimmed.match(/^Open\s+(@?[a-z0-9][a-z0-9._-]*)$/);
        if (openMemberMatch) {
            return (USE_TW ? '開啟 ' : '打开 ') + openMemberMatch[1];
        }
        const workingForMatch = trimmed.match(/^Working for\s+(@\S+)$/i);
        if (workingForMatch) {
            return USE_TW ? ('為 ' + workingForMatch[1] + ' 執行中') : ('正在为 ' + workingForMatch[1] + ' 工作');
        }
        const waitingOnMemberMatch = trimmed.match(/^Waiting on\s+(@\S+)$/i);
        if (waitingOnMemberMatch) {
            return '正在等待 ' + waitingOnMemberMatch[1];
        }
        const waitingOnCountMatch = trimmed.match(/^Waiting on\s+(\d+)$/i);
        if (waitingOnCountMatch) {
            return USE_TW ? ('正在等待 ' + waitingOnCountMatch[1] + ' 位成員') : ('正在等待 ' + waitingOnCountMatch[1] + ' 位成员');
        }
        const waitersChipMatch = trimmed.match(/^(\d+)\s+waiting on\s+(@\S+)$/i);
        if (waitersChipMatch) {
            return waitersChipMatch[1] + ' 位正在等待 ' + waitersChipMatch[2];
        }
        const ofDoneMatch = trimmed.match(/^(\d+)\s+of\s+(\d+)\s+(?:tasks\s+)?done$/i);
        if (ofDoneMatch) {
            return '已完成 ' + ofDoneMatch[1] + ' / ' + ofDoneMatch[2] + (USE_TW ? ' 項' : ' 项');
        }
        const beeCountMatch = trimmed.match(/^(\d+)\s+bees?$/i);
        if (beeCountMatch) {
            return beeCountMatch[1] + (USE_TW ? ' 位成員' : ' 位成员');
        }
        const chipSummaryMatch = trimmed.match(/^(\d+)\s+(stuck|needs?\s+you|in\s+review|active|working|waiting|done|threads?\s+open)$/i);
        if (chipSummaryMatch) {
            const cnt = chipSummaryMatch[1];
            const k = chipSummaryMatch[2].toLowerCase().replace(/\s+/g, ' ');
            if (k === 'stuck') return cnt + (USE_TW ? ' 項受阻' : ' 项卡住');
            if (k === 'needs you' || k === 'need you') return cnt + (USE_TW ? ' 項待您處理' : ' 项待您处理');
            if (k === 'in review') return cnt + (USE_TW ? ' 項審查中' : ' 项审查中');
            if (k === 'active') return cnt + (USE_TW ? ' 項執行中' : ' 项活跃');
            if (k === 'working') return cnt + (USE_TW ? ' 個工作中' : ' 个工作中');
            if (k === 'waiting') return cnt + (USE_TW ? ' 個等待中' : ' 个等待中');
            if (k === 'done') return cnt + (USE_TW ? ' 個已完成' : ' 个已完成');
            return cnt + (USE_TW ? ' 個討論串進行中' : ' 条工作线进行中');
        }
        const liveTipMatch = trimmed.match(/^(Thinking|Latest action):\s*(.+)$/s);
        if (liveTipMatch) {
            const lbl = liveTipMatch[1] === 'Thinking'
                ? '思考中：'
                : (USE_TW ? '最新動作：' : '最新动作：');
            return lbl + liveTipMatch[2];
        }
        const lastSeenMatch = trimmed.match(/^last seen\s+(.+)\s+ago$/i);
        if (lastSeenMatch) {
            const dur = formatCompactDuration(lastSeenMatch[1]);
            return (USE_TW ? '最近活躍於 ' : '最近活跃于 ') + dur + ' 前';
        }
        const sysAlertMatch = trimmed.match(/^@(\S+)\s+(ran out of quota|looks stuck|hit an error)$/i);
        if (sysAlertMatch) {
            const k = sysAlertMatch[2].toLowerCase();
            const msg = k === 'ran out of quota'
                ? (USE_TW ? ' 配額已耗盡' : ' 配额已耗尽')
                : k === 'looks stuck' ? ' 似乎卡住了' : (USE_TW ? ' 發生錯誤' : ' 发生错误');
            return '@' + sysAlertMatch[1] + msg;
        }
        const exportPctMatch = trimmed.match(/^Exporting\s+(\d+%)$/i);
        if (exportPctMatch) {
            return (USE_TW ? '正在匯出 ' : '正在导出 ') + exportPctMatch[1];
        }
        const exportFileMatch = trimmed.match(/^(Exporting|Rendering)\s+(.+?)(?:\.\.\.|…)$/i);
        if (exportFileMatch) {
            const verb = exportFileMatch[1].toLowerCase() === 'exporting'
                ? (USE_TW ? '正在匯出 ' : '正在导出 ')
                : (USE_TW ? '正在算圖 ' : '正在渲染 ');
            return verb + exportFileMatch[2] + '…';
        }
        const exportedMatch = trimmed.match(/^Exported\s+(.+?)\s+\((.+)\)$/i);
        if (exportedMatch) {
            const meta = translateSwarmComposite(exportedMatch[2]) || exportedMatch[2];
            return (USE_TW ? '已匯出 ' : '已导出 ') + exportedMatch[1] + '（' + meta + '）';
        }
        const downloadMatch = trimmed.match(/^Download\s+(.+)$/i);
        if (downloadMatch) {
            return (USE_TW ? '下載 ' : '下载 ') + downloadMatch[1];
        }
        const replayTitleMatch = trimmed.match(/^(.+?)\s+graph replay$/i);
        if (replayTitleMatch) {
            return replayTitleMatch[1] + (USE_TW ? ' 關係圖重播' : ' 关系图回放');
        }
        const narratorFailMatch = trimmed.match(/^The narrator's last step failed:\s*(.+)$/i);
        if (narratorFailMatch) {
            return (USE_TW ? '解說員最後一步失敗：' : '解说员最后一步失败：') + narratorFailMatch[1];
        }
        const noPostsTipMatch = trimmed.match(/^([^:]+):\s*No posts yet$/i);
        if (noPostsTipMatch) {
            return noPostsTipMatch[1] + (USE_TW ? '：尚無訊息' : '：暂无消息');
        }
        if (!raw.includes('·') && !raw.includes('\n')) return null;
        let changed = false;
        const lines = raw.split('\n').map(line => {
            const ln = norm(line);
            if (map.has(ln)) {
                changed = true;
                return map.get(ln);
            }
            if (!line.includes(' · ')) return line;
            const segs = line.split(' · ').map(seg => {
                const s = seg.trim();
                if (s === 'Coordinator') { changed = true; return USE_TW ? '協調器' : '协调器'; }
                if (s === 'Working') { changed = true; return '工作中'; }
                if (s === 'Active') { changed = true; return USE_TW ? '執行中' : '活跃'; }
                if (s === 'Waiting') { changed = true; return '等待中'; }
                if (s === 'Killed') { changed = true; return USE_TW ? '已終止' : '已终止'; }
                if (s === 'Swarm start') { changed = true; return USE_TW ? '蜂群啟動' : '蜂群启动'; }
                if (/^\d+\s+posts?$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+posts?$/i, (_, n) => n + (USE_TW ? ' 則訊息' : ' 条消息')); }
                if (/^\d+\s+members?$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+members?$/i, (_, n) => n + (USE_TW ? ' 位成員' : ' 位成员')); }
                if (/^\d+\s+frames?$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+frames?$/i, (_, n) => n + (USE_TW ? ' 格' : ' 帧')); }
                if (/^\d+\s+steps?$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+steps?$/i, '$1 步'); }
                if (/^\d+\s+unaddressed$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+unaddressed$/i, (_, n) => n + (USE_TW ? ' 則未指定對象' : ' 条未指定对象')); }
                if (/^\d+\s+unread$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+unread$/i, (_, n) => n + (USE_TW ? ' 則未讀' : ' 条未读')); }
                if (/^runs on\s+(.+)$/i.test(s)) { changed = true; return s.replace(/^runs on\s+(.+)$/i, (_, h) => (USE_TW ? '執行於 ' : '运行于 ') + h); }
                if (Object.prototype.hasOwnProperty.call(SCOPED_SWARM_MAP, s)) { changed = true; return SCOPED_SWARM_MAP[s][USE_TW ? 1 : 0]; }
                if (!s.includes('·') && !s.includes('\n')) {
                    const sub = translateSwarmComposite(s);
                    if (sub !== null) { changed = true; return sub; }
                }
                return seg;
            });
            return segs.join(' · ');
        });
        return changed ? lines.join('\n') : null;
    }

    function translatePermissionChoice(value) {
        if (typeof value !== 'string') return null;

        const saveRule = value.match(/^\s*Yes,\s+save rule for\s+('[\s\S]*'|"[\s\S]*")\s+(in this conversation|globally)\s*$/i);
        if (saveRule) {
            const pattern = saveRule[1];
            const isConv = saveRule[2].toLowerCase() === 'in this conversation';
            if (USE_TW) {
                return isConv ? ('是，在此對話中為 ' + pattern + ' 儲存規則') : ('是，全域為 ' + pattern + ' 儲存規則');
            }
            return isConv ? ('是，在此会话中为 ' + pattern + ' 保存规则') : ('是，全局为 ' + pattern + ' 保存规则');
        }

        const match = value.match(/^\s*Yes,\s+and always allow\s+([\s\S]+)$/i);
        if (!match || /^in this (?:project|conversation)$/i.test(norm(match[1]))) return null;

        // 客户端在命令外层引号之后追加作用域，需先保留命令原文再拼接范围前缀
        const scoped = match[1].match(/^('[\s\S]*'|"[\s\S]*")\s+in this (project|conversation)\s*$/i);
        const command = scoped ? scoped[1] : match[1].trimEnd();
        const scope = scoped && scoped[2] ? scoped[2].toLowerCase() : '';
        if (USE_TW) {
            if (scope === 'conversation') return '是，且在此對話中一律允許執行 ' + command;
            if (scope === 'project') return '是，且在此專案中一律允許執行 ' + command;
            return '是，且一律允許執行 ' + command;
        }
        if (scope === 'conversation') return '是，且在此会话中始终允许运行 ' + command;
        if (scope === 'project') return '是，且在此项目中始终允许运行 ' + command;
        return '是，且始终允许运行 ' + command;
    }

    function lookupDict(s) {
        const k = norm(s);
        return map.get(k) || lowerMap.get(k.toLowerCase()) || null;
    }

    const ENTITY_NOUN_MAP = {
        project: ['项目', '專案'],
        projects: ['项目', '專案'],
        workspace: ['工作区', '工作區'],
        workspaces: ['工作区', '工作區'],
        worktree: ['Worktree', 'Worktree'],
        folder: ['文件夹', '資料夾'],
        folders: ['文件夹', '資料夾'],
        rule: ['规则', '規則'],
        rules: ['规则', '規則'],
        workflow: ['工作流程', '工作流程'],
        workflows: ['工作流程', '工作流程'],
        agent: ['智能体', '代理'],
        agents: ['智能体', '代理'],
        subagent: ['子智能体', '子代理'],
        subagents: ['子智能体', '子代理'],
        group: ['分组', '群組'],
        bundle: ['套件', '套件'],
        bundles: ['套件', '套件'],
        plugin: ['插件', '外掛程式'],
        plugins: ['插件', '外掛程式'],
        permission: ['权限', '權限'],
        permissions: ['权限', '權限'],
        preset: ['预设', '預設'],
        presets: ['预设', '預設'],
        skill: ['技能', '技能'],
        skills: ['技能', '技能'],
        server: ['服务器', '伺服器'],
        servers: ['服务器', '伺服器'],
        'mcp server': ['MCP 服务器', 'MCP 伺服器'],
        'mcp servers': ['MCP 服务器', 'MCP 伺服器'],
        site: ['网站', '網站'],
        sites: ['网站', '網站'],
        host: ['主机', '主機'],
        hosts: ['主机', '主機'],
        account: ['账户', '帳戶'],
        secret: ['密钥', '密鑰'],
        shortcut: ['快捷键', '快速鍵'],
        shortcuts: ['快捷键', '快速鍵'],
        conversation: ['会话', '對話'],
        conversations: ['会话', '對話'],
        'side question': ['侧边提问', '側邊提問'],
        automation: ['自动化任务', '自動化任務'],
        'scheduled task': ['定时任务', '排程任務'],
        file: ['文件', '檔案'],
        files: ['文件', '檔案'],
        tab: ['标签页', '分頁'],
        window: ['窗口', '視窗'],
        panel: ['面板', '面板'],
        terminal: ['终端', '終端機'],
        recording: ['录音', '錄音'],
        recordings: ['录音', '錄音'],
        voice: ['声音', '聲音'],
        model: ['模型', '模型'],
        models: ['模型', '模型'],
        environment: ['环境', '環境'],
        artifact: ['产物', '成品'],
        plan: ['计划', '計畫'],
        comment: ['评论', '評論'],
        preview: ['预览', '預覽'],
        browser: ['浏览器', '瀏覽器'],
        'virtual machine': ['虚拟机', '虛擬機器'],
        cookies: ['Cookie', 'Cookie'],
        app: ['应用', '應用程式'],
        apps: ['应用', '應用程式'],
        command: ['命令', '指令'],
        commands: ['命令', '指令'],
        result: ['结果', '結果'],
        results: ['结果', '結果'],
        item: ['项目', '項目'],
        items: ['项目', '項目'],
        extension: ['扩展', '擴充功能'],
        extensions: ['扩展', '擴充功能'],
        tool: ['工具', '工具'],
        tools: ['工具', '工具']
    };

    function translateNoun(word) {
        const k = norm(word);
        const low = k.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(ENTITY_NOUN_MAP, low)) {
            return ENTITY_NOUN_MAP[low][USE_TW ? 1 : 0];
        }
        return lookupDict(k) || k;
    }

    const DYNAMIC_RULES = [
        // 列表展开 / 收起明细
        // 省略號跟著原文：「Show 3 more」不補「...」
        [/^Show\s+(\d+)\s+more(\s+(results?|items?|commands?|options?))?(\.\.\.|…)?$/i, (m, num, p2, type, ell) => {
            const tail = ell || '';
            if (type) {
                if (/result/i.test(type)) return (USE_TW ? ("顯示另外 " + num + " 個結果") : ("显示另外 " + num + " 个结果")) + tail;
                if (/command/i.test(type)) return (USE_TW ? ("顯示另外 " + num + " 個指令") : ("显示另外 " + num + " 个命令")) + tail;
                if (/item/i.test(type)) return (USE_TW ? ("顯示另外 " + num + " 個項目") : ("显示另外 " + num + " 个项目")) + tail;
                if (/option/i.test(type)) return (USE_TW ? ("顯示另外 " + num + " 個選項") : ("显示另外 " + num + " 个选项")) + tail;
            }
            return (USE_TW ? ("顯示另外 " + num + " 個") : ("显示另外 " + num + " 个")) + tail;
        }],
        [/^Show\s+(\d+)\s+breakdown(s)?$/i, (m, num) => USE_TW ? ("顯示 " + num + " 項明細") : ("显示 " + num + " 项细目")],
        [/^Hide\s+breakdown(s)?$/i, () => USE_TW ? "收起明細" : "收起细目"],
        [/^Show\s+breakdown(s)?$/i, () => USE_TW ? "顯示明細" : "显示细目"],
        [/^(?:\+\s*)?See\s+(\d+)\s+more(?:\s+(.+))?$/i, (m, num) => {
            const hasPlus = /^\+/.test(m);
            return (hasPlus ? "+ " : "") + (USE_TW ? ("展開另外 " + num + " 項") : ("展开另外 " + num + " 项"));
        }],
        [/^See\s+more\s+in\s+(.+)$/i, (m, name) => USE_TW ? ("在 " + name + " 中展開更多") : ("在 " + name + " 中展开更多")],
        [/^See all\s*\((\d+)\)$/i, (m, num) => USE_TW ? ("顯示全部 (" + num + ")") : ("显示全部 (" + num + ")")],

        // 会话删除与统计
        [/^(?:(Permanently delete)\s+)?(.+?)\s+including\s+(\d+)\s+active conversations?([.。])?$/i, (m, del, name, count, dot) => {
            const delPrefix = del ? (USE_TW ? "永久刪除 " : "永久删除 ") : "";
            const suffix = dot ? "。" : "";
            return delPrefix + name + (USE_TW ? ("（包含 " + count + " 個活躍對話）") : ("（包含 " + count + " 个活跃会话）")) + suffix;
        }],
        [/^including\s+(\d+)\s+active conversations?([.。])?$/i, (m, count, dot) => (USE_TW ? ("包含 " + count + " 個活躍對話") : ("包含 " + count + " 个活跃会话")) + (dot ? "。" : "")],
        [/^(\d+)\s+active conversations?([.。])?$/i, (m, count, dot) => (USE_TW ? (count + " 個活躍對話") : (count + " 个活跃会话")) + (dot ? "。" : "")],
        [/^Are you sure you want to delete (the |this )?project (.+?)\??$/i, (m, article, name) => USE_TW ? ("您確定要刪除專案 " + name + " 嗎？") : ("您确定要删除项目 " + name + " 吗？")],
        [/^Marked\s+(\d+)\s+conversations?\s+as\s+read$/i, (m, count) => USE_TW ? ("已將 " + count + " 個對話標記為已讀") : ("已将 " + count + " 个会话标记为已读")],
        [/^No more older messages,\s*showing\s+(\d+)\s+of\s+(\d+)$/i, (m, a, b) => USE_TW ? ("沒有更多歷史訊息，目前顯示 " + a + " / " + b + " 則") : ("没有更多历史消息，当前显示 " + a + " / " + b + " 条")],

        // 问候语与语音交互
        [/^Hey\s+(.+?),\s+what should we build today\??$/i, (m, name) => name.trim().toLowerCase() === 'there' ? (USE_TW ? "嗨，今天我們要打造什麼？" : "嗨，今天我们要构建什么？") : (USE_TW ? ("嗨 " + name.trim() + "，今天我們要打造什麼？") : ("嗨 " + name.trim() + "，今天我们要构建什么？"))],
        [/^,?\s*what should we build today\??$/i, () => USE_TW ? "，今天我們要打造什麼？" : "，今天我们要构建什么？"],
        [/^what should we build today\??$/i, () => USE_TW ? "今天我們要打造什麼？" : "今天我们要构建什么？"],
        [/^Welcome back,\s*(.+?)\.\s*Where should we pick up\??$/i, (m, name) => USE_TW ? ("歡迎回來，" + name.trim() + "。我們從哪裡繼續？") : ("欢迎回来，" + name.trim() + "。我们从哪里继续？")],
        [/^Welcome back\.\s*Where should we pick up\??$/i, () => USE_TW ? "歡迎回來。我們從哪裡繼續？" : "欢迎回来。我们从哪里继续？"],
        [/^Good to see you,\s*(.+?)\.\s*What's next\??$/i, (m, name) => USE_TW ? ("很高興見到您，" + name.trim() + "。接下來做什麼？") : ("很高兴见到您，" + name.trim() + "。接下来做什么？")],
        [/^Good to see you\.\s*What's next\??$/i, () => USE_TW ? "很高興見到您。接下來做什麼？" : "很高兴见到您。接下来做什么？"],
        [/^Hi\s+(.+?),\s+what can we get done today\??$/i, (m, name) => USE_TW ? ("嗨 " + name + "，今天有什麼我們可以一起完成的？") : ("嗨 " + name + "，今天有什么我们可以一起完成的？")],
        [/^What can we get done today\??$/i, () => USE_TW ? "今天有什麼我們可以一起完成的？" : "今天有什么我们可以一起完成的？"],
        [/^Good to see you(?:,\s*(.+?))?[.!]*$/i, (m, name) => (name && name.trim()) ? (USE_TW ? ("很高興見到您，" + name.trim() + "。") : ("很高兴见到您，" + name.trim() + "。")) : (USE_TW ? "很高興見到您。" : "很高兴见到您。")],
        [/^Welcome back(?:,\s*(.+?))?[.!]*$/i, (m, name) => (name && name.trim()) ? (USE_TW ? ("歡迎回來，" + name.trim() + "。") : ("欢迎回来，" + name.trim() + "。")) : (USE_TW ? "歡迎回來。" : "欢迎回来。")],
        [/^Hello,\s*(.+?)[.!]*$/i, (m, name) => USE_TW ? ("你好，" + name.trim() + "。") : ("你好，" + name.trim() + "。")],
        [/^Hello[.!]$/i, () => "你好。"],
        [/^Hi there[.!]*$/i, () => "您好。"],
        [/^Hi\s+([^\s.!]+)[.!]*$/i, (m, name) => name.toLowerCase() === 'there' ? "您好。" : (USE_TW ? ("嗨，" + name.trim() + "。") : ("嗨，" + name.trim() + "。"))],
        [/^(.+?),\s+voice\s+(\d+)\s+of\s+(\d+)$/i, (m, name, curr, total) => USE_TW ? (name + "，聲音 " + curr + " / " + total) : (name + "，音色 " + curr + " / " + total)],

        // 按钮与快捷提示
        [/^Send message\s+(Enter|⏎|\u23ce)$/i, (m, key) => (USE_TW ? "傳送訊息 " : "发送消息 ") + key],
        [/^Queue message\s+(Enter|⏎|\u23ce)$/i, (m, key) => (USE_TW ? "佇列傳送訊息 " : "排队发送消息 ") + key],
        [/^Send all\s*\((\d+)\)$/i, (m, num) => USE_TW ? ("全部傳送 (" + num + ")") : ("全部发送 (" + num + ")")],
        [/^Open (Live transcript|Voice transcript),\s*(.+?)(?:\.\s*Summarizing call)?$/i, (m, kind, dur) => {
            const kZh = /^Live/i.test(kind) ? (USE_TW ? "即時逐字稿" : "实时转录") : (USE_TW ? "語音逐字稿" : "语音转录");
            const suffix = /Summarizing call$/i.test(m) ? (USE_TW ? "。正在摘要通話" : "。正在总结通话") : "";
            return (USE_TW ? "開啟" : "打开") + kZh + "，" + dur + suffix;
        }],
        [/^Select all in$/i, () => USE_TW ? "全選 " : "全选 "],
        [/^Uses your local clone,$/i, () => USE_TW ? "使用本機複製版本，" : "使用本地克隆版本，"],
        [/^to have the agent generate a plan\.?$/i, () => USE_TW ? "讓代理產生計畫。" : "让智能体生成计划。"],

        // 配额刷新与 AI 额度提示
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) days?, (\d+) hours?\.?$/i, (m, d, h) => USE_TW ? (d + " 天 " + h + " 小時後更新") : (d + " 天 " + h + " 小时后刷新")],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) hours?, (\d+) minutes?\.?$/i, (m, h, min) => USE_TW ? (h + " 小時 " + min + " 分鐘後更新") : (h + " 小时 " + min + " 分钟后刷新")],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) days?\.?$/i, (m, d) => USE_TW ? (d + " 天後更新") : (d + " 天后刷新")],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) hours?\.?$/i, (m, h) => USE_TW ? (h + " 小時後更新") : (h + " 小时后刷新")],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) minutes?\.?$/i, (m, min) => USE_TW ? (min + " 分鐘後更新") : (min + " 分钟后刷新")],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in less than a minute\.?$/i, () => USE_TW ? "不到 1 分鐘後更新" : "不到 1 分钟后刷新"],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in a few seconds\.?$/i, () => USE_TW ? "幾秒後更新" : "几秒后刷新"],
        [/^Available AI Credits:\s*(.+)$/i, (m, val) => (USE_TW ? "可用 AI 點數：" : "可用 AI 额度：") + val],
        [/^Your plan's baseline quota will refresh on (.+?)\.?\s*To continue using this model now, enable AI Credit overages\.?$/i, (m, when) => USE_TW ? ("您方案的基準配額將於 " + when + " 重設。如需立即繼續使用此模型，請啟用 AI 點數超額使用。") : ("您方案的基础配额将于 " + when + " 刷新。如需立即继续使用此模型，请启用 AI 额度超量使用。")],
        [/^Your plan's baseline quota will refresh on (.+?)\.?$/i, (m, when) => USE_TW ? ("您方案的基準配額將於 " + when + " 重設。") : ("您方案的基础配额将于 " + when + " 刷新。")],
        [/^You have hit your (weekly|daily|monthly|\d+-hour) limit,\s*it (?:will refresh|refreshes) in (.+?)\.\s*If on a supported paid plan, you can use AI credits in the interim(?:\s*(or upgrade to a higher tier))?\.?$/i, (m, unit, when, upgrade) => {
            const u = unit.toLowerCase();
            const uTw = u === 'weekly' ? '每週額度' : u === 'daily' ? '每日額度' : u === 'monthly' ? '每月額度' : (' ' + u.replace(/-hour$/i, '') + ' 小時');
            const uSc = u === 'weekly' ? '每周额度' : u === 'daily' ? '每日额度' : u === 'monthly' ? '每月额度' : (' ' + u.replace(/-hour$/i, '') + ' 小时');
            const dur = formatUsageDuration(when) || when;
            const upTw = upgrade ? '，或升級至更高層級' : '';
            const upSc = upgrade ? '，或升级至更高层级' : '';
            return USE_TW
                ? ("您已達到" + uTw + "限制，將於 " + dur + "重設。若您使用受支援的付費方案，可在此期間使用 AI 點數" + upTw + "。")
                : ("您已达到" + uSc + "限制，将于 " + dur + "刷新。若您使用受支持的付费计划，可在此期间使用 AI 额度" + upSc + "。");
        }],
        [/^You have hit your (weekly|daily|monthly|\d+-hour) limit,\s*(?:so\s+)?the (weekly|daily|monthly|\d+-hour) limit does not currently apply\.\s*Your (?:weekly|daily|monthly|\d+-hour) limit will (?:(fully)\s+)?refresh in (.+?)\.?$/i, (m, hit, other, fully, when) => {
            const label = (w, tw) => {
                const l = w.toLowerCase();
                if (l === 'weekly') return tw ? '每週額度' : '每周额度';
                if (l === 'daily') return tw ? '每日額度' : '每日额度';
                if (l === 'monthly') return tw ? '每月額度' : '每月额度';
                const h = l.replace(/-hour$/i, '');
                return tw ? (' ' + h + ' 小時') : (' ' + h + ' 小时');
            };
            const hitTw = label(hit, true), otherTw = label(other, true).trimStart();
            const hitSc = label(hit, false), otherSc = label(other, false).trimStart();
            const dur = formatUsageDuration(when) || when;
            return USE_TW
                ? ("您已達到" + hitTw + "限制，" + otherTw + "限制目前不適用。您的" + hitTw + "限制將於 " + dur + (fully ? "完全重設" : "重設") + "。")
                : ("您已达到" + hitSc + "限制，" + otherSc + "限制目前不适用。您的" + hitSc + "限制将于 " + dur + (fully ? "完全刷新" : "刷新") + "。");
        }],
        [/^You have used some of your (weekly|daily|monthly|\d+-hour) limit,\s*it will (?:(fully)\s+)?refresh in (.+?)\.?$/i, (m, unit, fully, when) => {
            const l = unit.toLowerCase();
            const uTw = l === 'weekly' ? '每週額度' : l === 'daily' ? '每日額度' : l === 'monthly' ? '每月額度' : (' ' + l.replace(/-hour$/i, '') + ' 小時');
            const uSc = l === 'weekly' ? '每周额度' : l === 'daily' ? '每日额度' : l === 'monthly' ? '每月额度' : (' ' + l.replace(/-hour$/i, '') + ' 小时');
            const dur = /^less than a minute$/i.test(when.trim()) ? (USE_TW ? '不到 1 分鐘' : '不到 1 分钟') : (formatUsageDuration(when) || when);
            return USE_TW
                ? ("您已使用部分" + uTw + "限制，將於 " + dur + (fully ? "完全重設" : "重設") + "。")
                : ("您已使用部分" + uSc + "限制，将于 " + dur + (fully ? "完全刷新" : "刷新") + "。");
        }],
        [/^Models within this group:\s*(.+)$/i, (m, models) => USE_TW ? ("此群組包含的模型：" + models) : ("此分组包含的模型：" + models)],
        [/^(.+?)\s+(Weekly|Daily|Monthly|Five[- ]Hour|5[- ]Hour)\s+Limit$/i, (m, prefix, unit) => {
            const u = unit.toLowerCase();
            const uTw = u === 'weekly' ? '每週上限' : u === 'daily' ? '每日上限' : u === 'monthly' ? '每月上限' : '5 小時上限';
            const uSc = u === 'weekly' ? '每周限额' : u === 'daily' ? '每日限额' : u === 'monthly' ? '每月限额' : '5 小时限额';
            return USE_TW ? (prefix + " " + uTw) : (prefix + " " + uSc);
        }],
        [/^For paid Pro plans,\s*(.+?)\s+quota is separate\.\s*Higher\s+\1\s+quota\s*\(included as part of the larger\s+(.+?)\s+quota bucket\)\s*is available on Ultra plans\.?$/i, (m, model, bucket) => USE_TW ? ("在 Pro 付費方案中，" + model + " 配額會獨立計算。Ultra 方案則提供更高的 " + model + " 配額（納入較大的 " + bucket + " 配額池中）。") : ("在 Pro 付费方案中，" + model + " 配额独立计算。Ultra 方案提供更高的 " + model + " 配额（包含在更大的 " + bucket + " 配额池中）。")],
        [/^You can upgrade to a\s+(.+?)\s+plan to receive higher rate limits\.?$/i, (m, plan) => USE_TW ? ("您可以升級至 " + plan + " 方案以獲得更高的速率限制。") : ("您可以升级到 " + plan + " 计划以获得更高的速率限制。")],
        [/^The original\s+(.+?)\s+model for advanced workflows\.?$/i, (m, model) => USE_TW ? ("適合進階工作流程的初代 " + model + " 模型") : ("适用于高级工作流的初代 " + model + " 模型")],
        [/^Waiting for (\d+) timers$/i, (m, n) => USE_TW ? ("正在等待 " + n + " 個計時器") : ("正在等待 " + n + " 个计时器")],
        [/^Waiting for timer$/i, () => USE_TW ? "正在等待計時器" : "正在等待计时器"],
        [/^(\d+) (subagents\/tasks|subagents?|tasks?) running$/i, (m, n, kind) => {
            const k = kind.toLowerCase();
            const lTw = k === 'subagents/tasks' ? ' 個子代理／任務' : k.startsWith('subagent') ? ' 個子代理' : ' 個任務';
            const lSc = k === 'subagents/tasks' ? ' 个子智能体/任务' : k.startsWith('subagent') ? ' 个子智能体' : ' 个任务';
            return USE_TW ? (n + lTw + "執行中") : (n + lSc + "运行中");
        }],
        [/^(\d+) subagents? blocked$/i, (m, n) => USE_TW ? (n + " 個子代理受阻") : (n + " 个子智能体受阻")],

        // 预设、权限与工具 Token 预算
        [/^Learn more about$/i, () => USE_TW ? "瞭解更多關於" : "了解更多关于"],
        [/^Learn more about (.+)$/i, (m, p) => {
            let translatedPreset = p;
            const pLow = p.toLowerCase();
            if (pLow === 'default' || pLow.includes('默认') || pLow.includes('預設')) translatedPreset = USE_TW ? "預設 (Default)" : "默认 (Default)";
            else if (pLow === 'inherit global' || pLow.includes('继承全局') || pLow.includes('繼承全域')) translatedPreset = USE_TW ? "繼承全域 (Inherit Global)" : "继承全局 (Inherit Global)";
            else if (pLow === 'full machine' || pLow.includes('全机') || pLow.includes('全機')) translatedPreset = USE_TW ? "全機存取 (Full Machine)" : "全机访问 (Full Machine)";
            else if (pLow === 'turbo mode' || pLow.includes('极速') || pLow.includes('極速')) translatedPreset = USE_TW ? "極速模式 (Turbo Mode)" : "极速模式 (Turbo Mode)";
            else if (pLow === 'custom' || pLow.includes('自定义') || pLow.includes('自訂')) translatedPreset = USE_TW ? "自訂 (Custom)" : "自定义 (Custom)";
            return USE_TW ? ("瞭解更多關於 " + translatedPreset + " 的詳細資訊") : ("了解更多关于 " + translatedPreset + " 的信息");
        }],
        [/^Yes, allow downloads from (.+) for this run$/i, (m, site) => USE_TW ? ("是，本次執行允許從 " + site + " 下載") : ("是，本次运行允许从 " + site + " 下载")],
        [/^Yes, allow downloads from (.+) in this conversation$/i, (m, site) => USE_TW ? ("是，在此對話中允許從 " + site + " 下載") : ("是，在此会话中允许从 " + site + " 下载")],
        [/^Yes, always allow downloads from (.+)$/i, (m, site) => USE_TW ? ("是，一律允許從 " + site + " 下載") : ("是，始终允许从 " + site + " 下载")],
        [/^Yes, allow (.+) in this conversation$/i, (m, target) => USE_TW ? ("是，在此對話中允許 " + target) : ("是，在此会话中允许 " + target)],
        [/^Yes, always allow (.+)$/i, (m, target) => USE_TW ? ("是，一律允許 " + target) : ("是，始终允许 " + target)],
        [/^(\d+) tools? enabled$/i, (m, num) => USE_TW ? (num + " 個工具已啟用") : (num + " 个工具已启用")],
        [/^Hide\s+tools$/i, () => "收起工具"],
        [/^(\d+)\s+tools?$/i, (m, num) => num + (USE_TW ? " 個工具" : " 个工具")],
        [/^(\d+)\s+tools?\s+·\s+sign in for more$/i, (m, num) => num + (USE_TW ? " 個工具 · 登入以取得更多" : " 个工具 · 登录以获取更多")],
        [/^(\d+)\s+tools?\s+excluded$/i, (m, num) => num + (USE_TW ? " 個工具已排除" : " 个工具已排除")],
        [/^Exceeded the rules token budget\.\s+Full rule content\s+\(([\d,]+)\s+tokens?\)\s+was replaced with a lightweight file-path pointer in context\.$/i, (m, num) => USE_TW ? ("已超出規則 Token 預算。完整規則內容 (" + num + " 個 Token) 已在上下文中換成輕量級檔案路徑指標。") : ("已超出规则 Token 预算。完整规则内容 (" + num + " 个 Token) 已在上下文中替换为轻量级文件路径指针。")],
        [/^All tools in this MCP server\s+\(([\d,]+)\s+tokens?\)\s+exceeded the customization budget and were excluded from context\.$/i, (m, num) => USE_TW ? ("此 MCP 伺服器中的所有工具 (" + num + " 個 Token) 均已超出自訂項預算，並已從上下文中排除。") : ("此 MCP 服务器中的所有工具 (" + num + " 个 Token) 均已超出自定义项预算，并已从上下文中排除。")],
        [/^(\d+)\s+tools?\s+in this MCP server\s+\(([\d,]+)\s+tokens?\)\s+exceeded the customization budget and were excluded from context\.$/i, (m, tCount, num) => USE_TW ? ("此 MCP 伺服器中有 " + tCount + " 個工具 (" + num + " 個 Token) 超出自訂項預算，並已從上下文中排除。") : ("此 MCP 服务器中有 " + tCount + " 个工具 (" + num + " 个 Token) 超出自定义项预算，并已从上下文中排除。")],
        [/^Exceeded the customization token budget\s+\(([\d,]+)\s+tokens?\)\s+and was excluded from context\.$/i, (m, num) => USE_TW ? ("超出自訂項 Token 預算 (" + num + " 個 Token)，已從上下文中排除。") : ("超出自定义项 Token 预算 (" + num + " 个 Token)，已从上下文中排除。")],
        [/^(Rules|Skills|Mcp Tools): ([\d,]+) tokens$/i, (m, kind, num) => {
            const kindMap = { "Rules": USE_TW ? "規則" : "规则", "Skills": "技能", "Mcp Tools": "MCP 工具" };
            return (kindMap[kind] || kind) + "：" + num + " Token";
        }],

        // 版本、时间戳与超时报错
        [/^Version\s+([\d.]+)$/i, (m, v) => "版本 " + v],
        [/^just now$/i, () => USE_TW ? "剛剛" : "刚刚"],
        [/^(\d+)(s|m|h|d|w|mo|yr)\s+ago$/i, (m, num, unit) => {
            const pair = UNIT_MAP[unit.toLowerCase()];
            return num + (pair ? pair[USE_TW ? 1 : 0] : unit) + "前";
        }],
        [/^(.+?): context deadline exceeded$/i, (m, prefix) => prefix + (USE_TW ? ": 要求逾時 (context deadline exceeded)" : ": 请求超时 (context deadline exceeded)")],
        [/^(.+?): i\/o timeout$/i, (m, prefix) => prefix + (USE_TW ? ": I/O 逾時 (i/o timeout)" : ": I/O 超时 (i/o timeout)")],

        // 远程 MCP 通用描述句式
        [/^The (.+?) remote MCP server lets you access and run (.+?) tools to (.+)$/i, (m, name, tools) => name + (USE_TW ? " 遠端 MCP 伺服器可讓您存取並執行 " : " 远程 MCP 服务器可让您访问并运行 ") + tools + (USE_TW ? " 工具以進行管理與操作。" : " 工具以进行管理与操作。")],
        [/^The (.+?) remote MCP server lets you manage (.+) resources\.?$/i, (m, name, res) => name + (USE_TW ? " 遠端 MCP 伺服器可讓您管理 " : " 远程 MCP 服务器可让您管理 ") + res + (USE_TW ? " 資源。" : " 资源。")],
        [/^The (.+?) remote MCP server (allows you to|lets you) (.+)$/i, (m, name, verb, rest) => {
            const text = rest.replace(/enroll projects/gi, USE_TW ? "註冊專案" : "注册项目")
                             .replace(/generate audit and scope reports/gi, USE_TW ? "產生稽核與範圍報告" : "生成审计与范围报告")
                             .replace(/check resource enrollment statuses/gi, USE_TW ? "檢查資源註冊狀態" : "检查资源注册状态")
                             .replace(/in the (.+?) region/gi, (rm, r) => (USE_TW ? "在 " + r + " 區域" : "在 " + r + " 区域"));
            return name + (USE_TW ? " 遠端 MCP 伺服器允許您 " : " 远程 MCP 服务器允许您 ") + text;
        }],

        // 反馈、思考状态、浏览器安全警告与步骤汇总
        [/^Send feedback as(\s+(.+))?$/i, (m, p1, email) => email ? ("以 " + email + (USE_TW ? " 身分傳送意見回饋" : " 身份发送反馈")) : (USE_TW ? "以此身分傳送意見回饋：" : "以如下身份发送反馈：")],
        [/^(Thought|Thinking|Worked) for\s+(.+)$/i, (m, verb, rest) => {
            const vZh = /^Thought/i.test(verb) ? "已思考 " : (/^Thinking/i.test(verb) ? "正在思考 " : "已工作 ");
            let durPart = rest.trim();
            let updateSuffix = "";
            const updMatch = durPart.match(/^(.*?)\s*·\s*(\d+)\s+updates?$/i);
            if (updMatch) {
                durPart = updMatch[1].trim();
                updateSuffix = " · " + updMatch[2] + (USE_TW ? " 項更新" : " 项更新");
            }
            const dZh = durPart.replace(/(\d+)\s*h(?:ours?|r)?/gi, USE_TW ? "$1 小時" : "$1 小时").replace(/(\d+)\s*m(?:inutes?|in)?/gi, USE_TW ? "$1 分鐘" : "$1 分钟").replace(/(\d+)\s*s(?:econds?|ec)?/gi, "$1 秒");
            return vZh + dZh + updateSuffix;
        }],
        [/^(?:(·\s*))?(\d+)\s+updates?$/i, (m, dot, num) => (dot ? " · " : "") + num + (USE_TW ? " 項更新" : " 项更新")],
        [/^Low contrast ratio \(([^)]+)\)\.\s*Text may be hard to read\.?$/i, (m, ratio) => USE_TW ? ("對比度過低 (" + ratio + ")，文字可能難以閱讀。") : ("对比度过低 (" + ratio + ")，文字可能难以阅读。")],
        [/^Preview unavailable\s*[—–-]\s*(.+)$/i, (m, reason) => (USE_TW ? "預覽不可用 — " : "预览不可用 — ") + reason],
        [/^Proceed to\s+(.+?)\s+\(unsafe\)$/i, (m, host) => USE_TW ? ("繼續前往 " + host + "（不安全）") : ("继续前往 " + host + "（不安全）")],
        [/^\(?for example, passwords, messages, or credit cards\)?\.?$/i, () => USE_TW ? "（例如：密碼、訊息或信用卡）。" : "（例如：密码、通讯内容或信用卡）。"],
        [/^may sign you out of this site\.?$/i, () => USE_TW ? "可能會導致您退出此網站。" : "可能会导致您退出此网站。"],
        [/^normally uses encryption to protect your information\. When the browser tried to connect to$/i, () => USE_TW ? "通常使用加密技術來保護您的資訊。當瀏覽器本次嘗試連線至 " : "通常使用加密技术来保护您的信息。当浏览器本次尝试连接到 "],
        [/^this time, the website sent back unusual and incorrect credentials\.?$/i, () => USE_TW ? " 時，該網站傳回了異常且不正確的憑證。" : " 时，该网站发回了异常且不正确的凭据。"],
        [/^(.+?)\s+normally uses encryption to protect your information\.\s*When the browser tried to connect to\s+(.+?)\s+this time,\s*the website sent back unusual and incorrect credentials\.?$/i, (m, h1, h2) => USE_TW ? (h1 + " 通常使用加密技術來保護您的資訊。當瀏覽器本次嘗試連線至 " + h2 + " 時，該網站傳回了異常且不正確的憑證。") : (h1 + " 通常使用加密技术来保护您的信息。当浏览器本次尝试连接到 " + h2 + " 时，该网站发回了异常且不正确的凭据。")],
        [/^The certificate was rejected \((.+)\)\.\s*$/i, (m, code) => USE_TW ? ("憑證未通過驗證 (" + code + ")。") : ("证书未通过验证 (" + code + ")。")],
        [/^Nothing is running on port (\d+)$/i, (m, port) => USE_TW ? ("連接埠 " + port + " 上沒有執行中的服務") : ("端口 " + port + " 上没有正在运行的服务")],
        [/^Resume the conversation to start its workspace again, then start the server on port (\d+) and retry\.$/i, (m, port) => USE_TW ? ("請恢復對話以重新啟動其工作區，然後在連接埠 " + port + " 上啟動伺服器並重試。") : ("请恢复会话以重新启动其工作区，然后在端口 " + port + " 上启动服务器并重试。")],
        [/^No server is listening on port (\d+) inside the remote workspace\. Start it, or ask the agent to, then retry\.$/i, (m, port) => USE_TW ? ("遠端工作區內的連接埠 " + port + " 沒有伺服器正在監聽。請啟動伺服器（或請代理啟動），然後重試。") : ("远程工作区内的端口 " + port + " 没有服务器正在监听。请启动服务器（或让智能体启动），然后重试。")],
        [/^Help us improve\s+(.+?)\.?$/i, (m, app) => USE_TW ? ("協助我們改進 " + app + "。") : ("帮助我们改进 " + app + "。")],
        [/^Get Anything Done with\s+(.+)$/i, (m, app) => USE_TW ? ("使用 " + app + " 搞定一切") : ("用 " + app + " 搞定一切")],
        [/^Customize your experience from visual themes to how autonomous your agent acts and what\s+(.+?)\s+says\.?$/i, (m, app) => USE_TW ? ("自訂您的使用體驗，從視覺佈景主題到代理的自主程度以及 " + app + " 的提示音。") : ("自定义您的使用体验，从视觉主题到智能体的自主程度以及 " + app + " 的提示音。")],
        [/^(.+?)'s agents are powerful\.\s*They can edit files,\s*run commands,\s*and browse the web\.?$/i, (m, app) => USE_TW ? (app + " 的代理功能強大，可以編輯檔案、執行指令以及瀏覽網頁。") : (app + " 的智能体功能强大，可以编辑文件、运行命令以及浏览网页。")],
        [/^Google\s+(.+?)\s+Terms of Service$/i, (m, app) => USE_TW ? ("Google " + app + " 服務條款") : ("Google " + app + " 服务条款")],
        [/^Review permissions for\s+(.+)$/i, (m, name) => USE_TW ? ("檢視 " + name + " 的權限") : ("查看 " + name + " 的权限")],
        [/^Auth code for\s+(.+)$/i, (m, name) => USE_TW ? (name + " 的授權碼") : (name + " 的授权码")],
        [/^(.+?),\s*(\d+)\s+grants?$/i, (m, name, count) => USE_TW ? (name + "，" + count + " 項授權") : (name + "，" + count + " 项授权")],
        [/^Set up\s+(.+)$/i, (m, name) => USE_TW ? ("設定 " + name) : ("配置 " + name)],
        [/^On top of those defaults,\s*(.+?)\s+requests the access below\.$/i, (m, name) => USE_TW ? ("除上述預設權限外，" + name + " 還請求以下存取權限。") : ("除上述默认权限外，" + name + " 还请求以下访问权限。")],
        [/^(\d+)\s+calls?\s*·\s*([0-9.]+)\s*MB$/i, (m, count, mb) => USE_TW ? (count + " 次通話 · " + mb + " MB") : (count + " 次通话 · " + mb + " MB")],
        [/^Deleted\s+(\d+)\s+recordings?\s*\(([0-9.]+)\s*MB\)$/i, (m, count, mb) => USE_TW ? ("已刪除 " + count + " 筆錄音（" + mb + " MB）") : ("已删除 " + count + " 条录音（" + mb + " MB）")],
        [/^Failed to delete recordings:\s*(.+)$/i, (m, err) => USE_TW ? ("刪除錄音失敗：" + err) : ("删除录音失败：" + err)],
        [/^This deletes\s+(\d+)\s+call recordings?\s*\(([0-9.]+)\s*MB\)\s+from your machine\.\s*You can't undo this\.$/i, (m, count, mb) => USE_TW ? ("這將從您的電腦中刪除 " + count + " 筆通話錄音（" + mb + " MB）。此操作無法復原。") : ("这将从您的计算机中删除 " + count + " 条通话录音（" + mb + " MB）。此操作无法撤销。")],
        [/^Step\s+(\d+)\s+of\s+(\d+)$/i, (m, a, b) => USE_TW ? ("第 " + a + " 步，共 " + b + " 步") : ("第 " + a + " 步，共 " + b + " 步")],
        [/^\+(\d+)\s+more$/i, (m, num) => USE_TW ? ("另外 +" + num + " 項") : ("另外 +" + num + " 项")],
        [/^Not referenced by any feature\s*\((\d+)\)$/i, (m, num) => USE_TW ? ("尚無任何功能參照 (" + num + ")") : ("未被任何功能引用 (" + num + ")")],
        [/^Zipping\s+(.+?)(\.\.\.|…)?$/i, (m, name) => USE_TW ? ("正在壓縮 " + name + "...") : ("正在压缩 " + name + "...")],
        [/^There are currently no Build with\s+(.+?)\s+plugins available\.?$/i, (m, partner) => USE_TW ? ("目前沒有可用的 Build with " + partner + " 外掛程式。") : ("当前没有可用的 Build with " + partner + " 插件。")],
        [/^To switch accounts,\s*sign out in the\s+(.+?)\s+and sign in again\.?$/i, (m, place) => USE_TW ? ("如需切換帳戶，請在" + place + "中登出並重新登入。") : ("如需切换账户，请在" + place + "中退出登录并重新登录。")],
        [/^No MCP servers found for\s+"(.+)"$/i, (m, q) => USE_TW ? ('找不到與「' + q + '」相關的 MCP 伺服器') : ('未找到与“' + q + '”相关的 MCP 服务器')],
        [/^Agents created by\s+(.+?)\s+can apply across workspaces,\s*while project agents apply to\s+(.+?)\.?$/i, (m, a, b) => USE_TW ? ("由 " + a + " 建立的代理可跨工作區套用，而專案代理僅套用至 " + b + "。") : ("由 " + a + " 创建的智能体可跨工作区生效，而项目智能体仅作用于 " + b + "。")],
        [/^An?\s+(automation|scheduled task)\s+with this name already exists\.\s*Choose a different name\.?$/i, (m, kind) => USE_TW ? ("已存在同名的" + (/automation/i.test(kind) ? "自動化任務" : "排程任務") + "，請選擇其他名稱。") : ("已存在同名的" + (/automation/i.test(kind) ? "自动化任务" : "定时任务") + "，请选择其他名称。")],
        [/^(?:(Exploring|Explored|Editing|Edited|Running|Ran)\s+)?(\d+)\s+(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?)(?:,\s*(?:(Exploring|Explored|Editing|Edited|Running|Ran)\s+)?(\d+)\s+(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?))*$/i, (m) => {
            const verbMap = USE_TW
                ? { exploring: '正在探索', explored: '已探索', editing: '正在編輯', edited: '已編輯', running: '正在執行', ran: '已執行' }
                : { exploring: '正在探索', explored: '已探索', editing: '正在编辑', edited: '已编辑', running: '正在运行', ran: '已运行' };
            const nounMap = USE_TW
                ? { file: '個檔案', files: '個檔案', folder: '個資料夾', folders: '個資料夾', search: '次搜尋', searches: '次搜尋', command: '個指令', commands: '個指令', task: '個任務', tasks: '個任務', page: '個網頁', pages: '個網頁', browser: '次瀏覽器操作', browsers: '次瀏覽器操作', image: '張圖片', images: '張圖片', action: '項操作', actions: '項操作', artifact: '個成品', artifacts: '個成品' }
                : { file: '个文件', files: '个文件', folder: '个文件夹', folders: '个文件夹', search: '次搜索', searches: '次搜索', command: '个命令', commands: '个命令', task: '个任务', tasks: '个任务', page: '个网页', pages: '个网页', browser: '次浏览器操作', browsers: '次浏览器操作', image: '张图片', images: '张图片', action: '项操作', actions: '项操作', artifact: '个工件', artifacts: '个工件' };
            return m.split(/\s*,\s*/).map(part => {
                const pm = part.match(/^(?:(Exploring|Explored|Editing|Edited|Running|Ran)\s+)?(\d+)\s+(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?)$/i);
                if (!pm) return part;
                const v = pm[1] ? (verbMap[pm[1].toLowerCase()] || pm[1]) + ' ' : '';
                const n = nounMap[pm[3].toLowerCase()] || pm[3];
                return v + pm[2] + ' ' + n;
            }).join('，');
        }],

        // Swarm 伴生面板 (Sidecar) 动态消息、回放、关系图与概览状态
        [/^(\d+)\s+posts?$/i, (m, n) => n + (USE_TW ? " 則訊息" : " 条消息")],
        [/^(\d+)\s+posts?\s+since the view was updated$/i, (m, n) => USE_TW ? ("自檢視上次更新以來有 " + n + " 則新訊息") : ("自视图上次更新以来有 " + n + " 条新消息")],
        [/^Narrator read up to #(\d+) of (\d+)$/i, (m, a, b) => USE_TW ? ("解說員已讀至 #" + a + " / " + b) : ("解说员已读至 #" + a + " / " + b)],
        [/^read #(\d+)(?:\s*·\s*updated\s+(.+?)\s+ago)?$/i, (m, seq, dur) => (USE_TW ? "已讀至 #" : "已读至 #") + seq + (dur ? (" · " + formatCompactDuration(dur) + "前更新") : "")],
        [/^Posted in #([^\s;]+);\s*click to show only #([^\s;]+)$/i, (m, c1, c2) => USE_TW ? ("發布於 #" + c1 + "；按一下僅顯示 #" + c2) : ("发布于 #" + c1 + "；点击仅显示 #" + c2)],
        [/^#([^\s]+)\s+\(archived\)$/i, (m, ch) => "#" + ch + (USE_TW ? "（已封存）" : "（已归档）")],
        [/^#([^\s]+)\s+is archived:\s*this addresses nobody$/i, (m, ch) => "#" + ch + (USE_TW ? " 已封存：不會通知任何成員" : " 已归档：不会通知任何成员")],
        [/^Everyone in #([^\s]+)$/i, (m, ch) => "#" + ch + (USE_TW ? " 中的所有成員" : " 中的所有成员")],
        [/^Go to #(\d+)(?:\s*\(([^)]+)\))?$/i, (m, seq, who) => (USE_TW ? "前往 #" : "跳转到 #") + seq + (who ? (" (" + who + ")") : "")],
        [/^The narrator's last step failed:\s*(.+)$/i, (m, detail) => (USE_TW ? "解說員上一步驟失敗：" : "解说员上一步执行失败：") + detail],
        [/^the narrator's view failed \((.+)\)$/i, (m, r) => USE_TW ? ("解說員檢視載入失敗 (" + r + ")") : ("解说员视图加载失败 (" + r + ")")],
        [/^overview\s*·\s*from the narrator's notes\s*\((.+)\)$/i, (m, r) => {
            const rNorm = norm(r);
            const rZh = map.get(rNorm) || r;
            return (USE_TW ? "概覽 · 來自解說員筆記（" : "概览 · 来自解说员笔记（") + rZh + "）";
        }],
        [/^Opening (.+?)'s conversation needs the app\.$/i, (m, who) => USE_TW ? ("需要在應用程式中開啟 " + who + " 的對話。") : ("需要在客户端应用中打开 " + who + " 的会话。")],
        [/^(.+?) runs on (.+?); open it there\.$/i, (m, name, host) => USE_TW ? (name + " 執行於 " + host + "；請在該處開啟。") : (name + " 运行于 " + host + "；请在该处打开。")],
        [/^Copied ["“](.+)["”]\.\s*Paste it in the chat\.$/i, (m, txt) => USE_TW ? ("已複製「" + txt + "」。請貼到對話框中。") : ("已复制“" + txt + "”。请粘贴到聊天框中。")],
        [/^Type ["“](.+)["”]\s+in the chat\.$/i, (m, txt) => USE_TW ? ("請在對話框中輸入「" + txt + "」。") : ("请在聊天框中输入“" + txt + "”。")],
        [/^Copied ["“](.+)["”]\.\s*Paste it to the coordinator and say what you want changed\.$/i, (m, txt) => USE_TW ? ("已複製「" + txt + "」。請貼給協調器並說明您想修改的內容。") : ("已复制“" + txt + "”。请粘贴给协调器并说明您想修改的内容。")],
        [/^Tell the coordinator:\s*["“](.+)["”]$/i, (m, txt) => USE_TW ? ("請告訴協調器：「" + txt + "」") : ("请告诉协调器：“" + txt + "”")],
        [/^@([^\s]+)\s+ran out of quota(?:\s+for\s+(.+?))?(?:\s+—\s+(.+))?$/i, (m, who, dur, detail) => "@" + who + (USE_TW ? " 配額已耗盡" : " 配额已耗尽") + (dur ? ((USE_TW ? "（已持續 " : "（已持续 ") + formatCompactDuration(dur) + "）") : "") + (detail ? (" — " + detail) : "")],
        [/^@([^\s]+)\s+looks stuck(?:\s+for\s+(.+?))?(?:\s+—\s+(.+))?$/i, (m, who, dur, detail) => "@" + who + " 似乎卡住了" + (dur ? ((USE_TW ? "（已持續 " : "（已持续 ") + formatCompactDuration(dur) + "）") : "") + (detail ? (" — " + detail) : "")],
        [/^@([^\s]+)\s+hit an error(?:\s+for\s+(.+?))?(?:\s+—\s+(.+))?$/i, (m, who, dur, detail) => "@" + who + (USE_TW ? " 發生錯誤" : " 遇到错误") + (dur ? ((USE_TW ? "（已持續 " : "（已持续 ") + formatCompactDuration(dur) + "）") : "") + (detail ? (" — " + detail) : "")],
        [/^seen just now$/i, () => USE_TW ? "剛剛上線" : "刚刚在线"],
        [/^last seen (\d+(?:s|m|h|d)) ago$/i, (m, dur) => (USE_TW ? "上次上線：" : "上次在线：") + formatCompactDuration(dur) + "前"],
        [/^(\d+)\s+of\s+(\d+)\s+tasks?\s+done$/i, (m, d, tot) => d + " / " + tot + (USE_TW ? " 項任務已完成" : " 项任务已完成")],
        [/^([0-9]+\/[0-9]+|[0-9]+%)\s+done$/i, (m, lbl) => "已完成 " + lbl],
        [/^(\d+)\s+needs?\s+you$/i, (m, n) => n + (USE_TW ? " 項待你處理" : " 项待你处理")],
        [/^(\d+)\s+blocked$/i, (m, n) => n + (USE_TW ? " 項受阻" : " 项受阻")],
        [/^(\d+)\s+threads?\s+open$/i, (m, n) => n + (USE_TW ? " 個討論串進行中" : " 条工作线进行中")],
        [/^(\d+)\s+active$/i, (m, n) => n + (USE_TW ? " 項進行中" : " 项进行中")],
        [/^Up next\s*·\s*(\d+)$/i, (m, n) => (USE_TW ? "接下來 · " : "接下来 · ") + n],
        [/^Last change:\s*[“"](.+)[”"]$/i, (m, txt) => (USE_TW ? "上次變更：「" : "上次变更：“") + txt + (USE_TW ? "」" : "”")],
        [/^Remote\s*·\s*(\d+)\s+machines?$/i, (m, n) => (USE_TW ? "遠端 · " : "远程 · ") + n + (USE_TW ? " 台機器" : " 台机器")],
        [/^Remote\s*·\s*(reconnecting|connecting|unavailable)$/i, (m, st) => {
            const stLow = st.toLowerCase();
            const stZh = stLow === 'reconnecting'
                ? (USE_TW ? '正在重新連線' : '正在重连')
                : (stLow === 'connecting' ? (USE_TW ? '正在連線' : '正在连接') : '不可用');
            return (USE_TW ? "遠端 · " : "远程 · ") + stZh;
        }],
        [/^Message from\s+(.+)$/, (m, sender) => {
            const sNorm = norm(sender);
            const sZh = sNorm === 'Parent Agent'
                ? (USE_TW ? '父級代理' : '父级智能体')
                : (map.get(sNorm) || sender);
            const isCjk = /[\u4e00-\u9fff]/.test(sZh);
            return (isCjk ? (USE_TW ? '來自' : '来自') : (USE_TW ? '來自 ' : '来自 ')) + sZh + (isCjk ? (USE_TW ? '的訊息' : '的消息') : (USE_TW ? ' 的訊息' : ' 的消息'));
        }],
        [/^@([^\s]+)\s+was stopped$/i, (m, who) => "@" + who + (USE_TW ? " 已停止" : " 已停止")],
        [/^@([^\s]+)\s+was killed$/i, (m, who) => "@" + who + (USE_TW ? " 已終止" : " 已终止")],
        [/^@([^\s]+)\s+is working(?:\.\.\.|…)?$/i, (m, who) => "@" + who + (USE_TW ? " 工作中..." : " 工作中...")],
        [/^@([^\s]+)\s+is waiting$/i, (m, who) => "@" + who + (USE_TW ? " 等待中" : " 等待中")],
        [/^@([^\s]+)\s+is idle$/i, (m, who) => "@" + who + (USE_TW ? " 閒置中" : " 空闲中")],
        [/^@([^\s]+)\s+is done$/i, (m, who) => "@" + who + (USE_TW ? " 已完成" : " 已完成")],
        [/^@([^\s]+)\s+has completed its task$/i, (m, who) => "@" + who + (USE_TW ? " 已完成任務" : " 已完成任务")],
        [/^Swarm\s*·\s*(\d+)\s+members?$/i, (m, n) => (USE_TW ? "蜂群 · " : "蜂群 · ") + n + (USE_TW ? " 位成員" : " 位成员")],
        [/^Swarm\s*·\s*(\d+)\s+workers?$/i, (m, n) => (USE_TW ? "蜂群 · " : "蜂群 · ") + n + (USE_TW ? " 位成員" : " 位成员")],
        [/^(\d+)\s+members?$/i, (m, n) => n + (USE_TW ? " 位成員" : " 位成员")],
        [/^(\d+)\s+workers?$/i, (m, n) => n + (USE_TW ? " 位成員" : " 位成员")],

        // v2.32.1 新增界面：草稿胶囊、SSH 远程主机、多智能体视图与插件云端凭据
        [/^(\d+)\s+Drafts?$/i, (m, n) => n + (USE_TW ? " 則草稿" : " 条草稿")],
        [/^Resume\s+(\d+)\s+comment drafts?$/i, (m, n) => USE_TW ? ("恢復 " + n + " 則評論草稿") : ("恢复 " + n + " 条评论草稿")],
        [/^Couldn't connect to\s+(.+)$/i, (m, rest) => (USE_TW ? "無法連線至 " : "无法连接到 ") + rest],
        [/^Connecting to\s+(.+?)(\.\.\.|…)?$/i, (m, host, ell) => (USE_TW ? "正在連線至 " : "正在连接到 ") + host + (ell || "")],
        [/^Connected to\s+(.+)$/i, (m, host) => (USE_TW ? "已連線至 " : "已连接到 ") + host],
        [/^SSH Config\s*\((.+)\)$/i, (m, cfg) => (USE_TW ? "SSH 設定 (" : "SSH 配置 (") + cfg + ")"],
        [/^(\d+)\s+hidden hosts?$/i, (m, n) => n + (USE_TW ? " 個已隱藏的主機" : " 个已隐藏的主机")],
        [/^Hide\s+(.+?)\s+from this list$/i, (m, host) => USE_TW ? ("從此清單中隱藏 " + host) : ("从此列表中隐藏 " + host)],
        [/^Show\s+(.+?)\s+in the list again$/i, (m, host) => USE_TW ? ("重新在清單中顯示 " + host) : ("重新在列表中显示 " + host)],
        [/^(.+?)\s*\((Focus this tile|Back to all agents)\)$/i, (m, prefix, action) => prefix + "（" + (/^Focus/i.test(action) ? (USE_TW ? "聚焦此窗格" : "聚焦此视图") : (USE_TW ? "返回所有代理" : "返回全部智能体")) + "）"],
        [/^Sign-ins to (.+?) are kept in the cloud with your account\.(?:\s*(Other credentials stay on this machine\.))?(?:\s*(Credentials are only sent to the domains listed\.))?$/i, (m, providers, otherPart, domainPart) => {
            let res = USE_TW
                ? (providers + " 的登入資訊會隨您的帳戶儲存在雲端。")
                : (providers + " 的登录信息会随您的账户保存在云端。");
            if (otherPart) res += USE_TW ? "其他憑證保留在本機上。" : "其他凭据保留在本机上。";
            if (domainPart) res += USE_TW ? "憑證僅會傳送至所列出的網域。" : "凭据仅会发送至所列出的域名。";
            return res;
        }],
        [/^No sites match [“"](.+?)[”"]\.$/i, (m, q) => USE_TW ? (`找不到符合「${q}」的網站。`) : (`未找到匹配“${q}”的站点。`)],
        [/^Couldn't delete cookies for (.+?)\. Try again\.$/i, (m, site) => USE_TW ? (`無法刪除 ${site} 的 Cookie，請再試一次。`) : (`无法删除 ${site} 的 Cookie，请重试。`)],
        [/^(.+?)\s+needs?\s+the terminal sandbox,\s+which isn't available on this host\.$/i, (m, presets) => {
            const labels = presets.split(/\s+and\s+/i).map(p => {
                const k = norm(p);
                return map.get(k) || lowerMap.get(k.toLowerCase()) || k;
            });
            const joined = labels.join(USE_TW ? " 與 " : " 和 ");
            return joined + (USE_TW ? " 需要終端機沙箱，但此主機無法使用。" : " 需要终端沙盒，但此主机不可用。");
        }],
        [/^(Messaging|Messaged)\s+(.+)$/, (m, verb, role) => {
            const rTrim = role.trim();
            if (rTrim.length > 60 || /[.!?。！？]$/.test(rTrim)) return m;
            const rNorm = norm(rTrim);
            const rZh = map.get(rNorm) || rTrim;
            if (verb === 'Messaging') {
                return (USE_TW ? "正在傳送訊息給 " : "正在向 ") + rZh + (USE_TW ? "" : " 发送消息");
            }
            return (USE_TW ? "已傳送訊息給 " : "已向 ") + rZh + (USE_TW ? "" : " 发送消息");
        }],
        [/^Failed to save project settings:\s*(.+)$/i, (m, err) => (USE_TW ? "儲存專案設定失敗：" : "保存项目设置失败：") + err],
        [/^Failed to save cloud permission settings:\s*(.+)$/i, (m, err) => (USE_TW ? "儲存雲端權限設定失敗：" : "保存云端权限设置失败：") + err],
        [/^Failed to save project permissions:\s*(.+)$/i, (m, err) => (USE_TW ? "儲存專案權限失敗：" : "保存项目权限失败：") + err],
        [/^Failed to save settings:\s*(.+)$/i, (m, err) => (USE_TW ? "儲存設定失敗：" : "保存设置失败：") + err],
        [/^Failed to create project:\s*(.+)$/i, (m, err) => (USE_TW ? "建立專案失敗：" : "创建项目失败：") + err],
        [/^Failed to select workspace:\s*(.+)$/i, (m, err) => (USE_TW ? "選取工作區失敗：" : "选择工作区失败：") + err],
        [/^Failed to unarchive project:\s*(.+)$/i, (m, err) => (USE_TW ? "取消封存專案失敗：" : "取消归档项目失败：") + err],
        [/^Failed to resolve folder:\s*(.+)$/i, (m, err) => (USE_TW ? "解析資料夾失敗：" : "解析文件夹失败：") + err],

        // 语音、麦克风权限、浏览器拦截与插件动态模板
        [/^Choose\s+(.+?)['’]s\s+Voice$/i, (m, app) => USE_TW ? ("選擇 " + app + " 的聲音") : ("选择 " + app + " 的声音")],
        [/^Microphone blocked\.\s*Allow in\s+(.+?)\.?$/i, (m, place) => USE_TW ? ("麥克風已封鎖，請在 " + place + " 中允許存取。") : ("麦克风已被阻止，请在 " + place + " 中允许访问。")],
        [/^Microphone access for\s+(.+?)\s+was denied\.\s*Quit and reopen the app to be asked again\.?$/i, (m, host) => USE_TW ? (host + " 的麥克風存取權限已遭拒絕。請結束並重新開啟應用程式以再次詢問。") : (host + " 的麦克风访问权限已被拒绝。请退出并重新打开应用以再次询问。")],
        [/^Agent needs permission to act on\s+(.+)$/i, (m, target) => USE_TW ? ("代理需要權限才能對 " + target + " 執行操作") : ("智能体需要权限才能对 " + target + " 执行操作")],
        [/^The browser blocked the download of\s+(.+)$/i, (m, file) => USE_TW ? ("瀏覽器已封鎖下載 " + file) : ("浏览器已阻止下载 " + file)],
        [/^Blocked cross-origin subframe\s+["“](.+)["”]$/i, (m, url) => USE_TW ? ("已封鎖跨來源子框架「" + url + "」") : ("已阻止跨源子框架“" + url + "”")],
        [/^Blocked external popup navigation to\s+["“](.+)["”]$/i, (m, url) => USE_TW ? ("已封鎖外部彈出式導覽至「" + url + "」") : ("已阻止外部弹窗导航至“" + url + "”")],
        [/^Blocked navigation to\s+["“](.+)["”]$/i, (m, url) => USE_TW ? ("已封鎖導覽至「" + url + "」") : ("已阻止导航至“" + url + "”")],
        [/^Blocked popup to\s+["“](.+)["”]$/i, (m, url) => USE_TW ? ("已封鎖彈出視窗「" + url + "」") : ("已阻止弹窗“" + url + "”")],
        [/^Build with\s+(.+?)\s+Plugins$/i, (m, partner) => USE_TW ? ("使用 " + partner + " 外掛程式建置") : ("使用 " + partner + " 插件构建")],
        [/^Open the\s+(.+?)\s+plugin$/i, (m, name) => USE_TW ? ("開啟 " + name + " 外掛程式") : ("打开 " + name + " 插件")],
        [/^Open\s+(.+?)\s+skill$/i, (m, name) => USE_TW ? ("開啟 " + name + " 技能") : ("打开 " + name + " 技能")],
        [/^Configure\s+([A-Za-z0-9._-]+)$/i, (m, srv) => (USE_TW ? "設定 " : "配置 ") + srv],
        [/^Manage\s+(.+?)\s+app settings\.?$/i, (m, app) => USE_TW ? ("管理 " + app + " 應用程式設定。") : ("管理 " + app + " 应用设置。")],
        [/^The\s+(.+?)\s+MCP server requires configuration parameters before it can be started\.?$/i, (m, srv) => USE_TW ? (srv + " MCP 伺服器需要設定參數後才能啟動。") : (srv + " MCP 服务器需要配置参数后才能启动。")],
        [/^Cannot add folder:\s*["“](.+?)["”]\s+is not a valid folder location\.?$/i, (m, p) => USE_TW ? ("無法新增資料夾：「" + p + "」不是有效的資料夾位置。") : ("无法添加文件夹：“" + p + "”不是有效的文件夹位置。")],
        [/^The folder\s+["“](.+?)["”]\s+does not exist\.\s*Would you like to create it\??$/i, (m, p) => USE_TW ? ("資料夾「" + p + "」不存在。是否要建立此資料夾？") : ("文件夹“" + p + "”不存在。是否要创建该文件夹？")],
        [/^["“](.+?)["”]\s+isn['’]t a valid folder name\.?$/i, (m, p) => USE_TW ? ("「" + p + "」不是有效的資料夾名稱。") : ("“" + p + "”不是有效的文件夹名称。")],
        [/^Can['’]t create this path\s*[—–-]\s*["“](.+?)["”]\s+is a file,\s*not a folder\.?$/i, (m, p) => USE_TW ? ("無法建立此路徑 —「" + p + "」是檔案，不是資料夾。") : ("无法创建此路径 —“" + p + "”是文件，不是文件夹。")],
        [/^A file already exists at\s+(.+?)\.?$/i, (m, p) => USE_TW ? (p + " 位置已存在檔案。") : (p + " 位置已存在文件。")],
        [/^Created automation\s+["“](.+?)["”]\.?$/i, (m, name) => USE_TW ? ("已建立自動化任務「" + name + "」。") : ("已创建自动化任务“" + name + "”。")],
        [/^Enabled\s+["“](.+?)["”]\.?$/i, (m, name) => USE_TW ? ("已啟用「" + name + "」。") : ("已启用“" + name + "”。")],
        [/^Deleted\s+["“](.+?)["”]\.?$/i, (m, name) => USE_TW ? ("已刪除「" + name + "」。") : ("已删除“" + name + "”。")],
        [/^Started\s+["“](.+?)["”]\.?$/i, (m, name) => USE_TW ? ("已啟動「" + name + "」。") : ("已启动“" + name + "”。")],
        [/^Restarted\s+["“](.+?)["”]\.?$/i, (m, name) => USE_TW ? ("已重新啟動「" + name + "」。") : ("已重启“" + name + "”。")],
        [/^Failed to start\s+["“](.+?)["”]\.?$/i, (m, name) => USE_TW ? ("無法啟動「" + name + "」。") : ("无法启动“" + name + "”。")],
        [/^Failed to delete\s+["“](.+?)["”]\.?$/i, (m, name) => USE_TW ? ("刪除「" + name + "」失敗") : ("删除“" + name + "”失败")],
        [/^Failed to save\s+["“](.+?)["”]\.?$/i, (m, name) => USE_TW ? ("儲存「" + name + "」失敗") : ("保存“" + name + "”失败")],
        [/^Failed to update\s+["“](.+?)["”]\.?$/i, (m, name) => USE_TW ? ("更新「" + name + "」失敗") : ("更新“" + name + "”失败")],
        [/^Remove\s+(.+?)\s+from Recent$/i, (m, host) => USE_TW ? ("從最近項目中移除 " + host) : ("从最近项目中移除 " + host)],
        [/^This window['’]s agents,\s*files,\s*and terminals are on\s+(.+?)\.?$/i, (m, host) => USE_TW ? ("此視窗的代理、檔案與終端機皆位於 " + host + "。") : ("此窗口的智能体、文件和终端均位于 " + host + "。")],
        [/^(.+?)\s+\(Remote\)$/i, (m, name) => name + (USE_TW ? "（遠端）" : "（远程）")],
        [/^Stop\s+(\d+)\s+agents?\?$/i, (m, n) => USE_TW ? ("停止 " + n + " 個代理？") : ("停止 " + n + " 个智能体？")],
        [/^(\d+)\s+files?\s+changed$/i, (m, n) => n + (USE_TW ? " 個檔案已變更" : " 个文件已更改")],
        [/^(\d+)\s+comments?$/i, (m, n) => n + (USE_TW ? " 則評論" : " 条评论")],
        [/^(\d+(?:\.\d+)?)\s+seconds?$/i, (m, n) => n + " 秒"],
        [/^System default\s*\((.+)\)$/i, (m, mic) => (USE_TW ? "系統預設 (" : "系统默认 (") + mic + ")"],
        [/^Unfold lines\s+(\d+-\d+)$/i, (m, range) => (USE_TW ? "展開第 " : "展开第 ") + range + " 行"],
        [/^Search Google for\s+["“](.+)["”]$/i, (m, q) => (USE_TW ? "在 Google 搜尋「" : "在 Google 搜索“") + q + (USE_TW ? "」" : "”")],
        [/^Move to Group:\s*(.+)$/i, (m, g) => (USE_TW ? "移至群組：" : "移至分组：") + g],
        [/^App view for\s+(.+)$/i, (m, v) => (USE_TW ? "應用程式檢視：" : "应用视图：") + v],
        [/^(.+?)\s+\(Experimental\)$/i, (m, label) => label + (USE_TW ? "（實驗性）" : "（实验性）")],
        [/^When toggled on,\s*(.+?)\s+collects usage data to help Google enhance performance and features\.?$/i, (m, app) => USE_TW ? ("開啟後，" + app + " 將收集使用量資料以協助 Google 改進效能與功能。") : ("开启后，" + app + " 将收集使用数据以帮助 Google 改进性能和功能。")],
        [/^When toggled on,\s*(.+?)\s+will use your AI credits to fulfill model requests once you['’]re out of model quota\.\s*\1\s+will always use your model quota first before using AI credits\.?$/i, (m, app) => USE_TW ? ("開啟後，當模型配額用盡時，" + app + " 將使用您的 AI 點數來完成模型請求。" + app + " 永遠會優先使用您的模型配額，再使用 AI 點數。") : ("开启后，当模型配额用尽时，" + app + " 将使用您的 AI 额度来完成模型请求。" + app + " 始终会优先使用您的模型配额，然后再使用 AI 额度。")],
        [/^Receive product updates,\s*tips,\s*and promotions from Google\s+(.+?)\s+via email\.?$/i, (m, app) => USE_TW ? ("透過電子郵件接收 Google " + app + " 的產品更新、使用技巧與優惠活動。") : ("通过电子邮件接收 Google " + app + " 的产品更新、技巧和促销信息。")],

        // 模型選擇器付費方案可用性與第三方模型移除警示 (動態方案、模型與下架日期適配)
        [/^(.+?)\s+is (?:currently|now) available (?:to|on)\s+(.+?)\.\s*(.+?)\s+will no longer be available on your current plan starting on\s+(.+?)\.?$/i, (m, m1, aud, m3, dateStr) => {
            const model = m1.trim();
            const audZh = formatPlanAudience(aud);
            const isSubscribers = /subscriber/i.test(aud);
            const isCurrently = /currently/i.test(m);
            const part1 = isSubscribers
                ? (USE_TW ? (model + (isCurrently ? " 目前僅提供給 " : " 現已提供給 ") + audZh + "使用。") : (model + (isCurrently ? " 目前仅提供给 " : " 现已提供给 ") + audZh + "使用。"))
                : (USE_TW ? (model + (isCurrently ? " 目前在 " : " 現已在 ") + audZh + "中提供。") : (model + (isCurrently ? " 目前在 " : " 现已在 ") + audZh + "中提供。"));
            const dZh = formatEnglishDate(dateStr);
            const isThirdParty = /third-party model access/i.test(m3.trim());
            const part2 = isThirdParty
                ? (USE_TW ? ("自 " + dZh + "起，您目前的方案將不再提供第三方模型存取權限。") : ("自 " + dZh + "起，您当前的方案将不再提供第三方模型访问权限。"))
                : (USE_TW ? ("自 " + dZh + "起，您目前的方案將不再提供 " + m3.trim() + "。") : ("自 " + dZh + "起，您当前的方案将不再提供 " + m3.trim() + "。"));
            return part1 + part2;
        }],
        [/^(.+?)\s+is (?:currently|now) available (?:to|on)\s+(.+?)\.\s*(.+?)\s+will be removed from\s+(.+?)\s+on\s+(.+?)\.?$/i, (m, m1, aud, m3, app, dateStr) => {
            const model = m1.trim();
            const audZh = formatPlanAudience(aud);
            const isSubscribers = /subscriber/i.test(aud);
            const isCurrently = /currently/i.test(m);
            const part1 = isSubscribers
                ? (USE_TW ? (model + (isCurrently ? " 目前僅提供給 " : " 現已提供給 ") + audZh + "使用。") : (model + (isCurrently ? " 目前仅提供给 " : " 现已提供给 ") + audZh + "使用。"))
                : (USE_TW ? (model + (isCurrently ? " 目前在 " : " 現已在 ") + audZh + "中提供。") : (model + (isCurrently ? " 目前在 " : " 现已在 ") + audZh + "中提供。"));
            const dZh = formatEnglishDate(dateStr);
            const part2 = USE_TW
                ? (m3.trim() + " 將於 " + dZh + "自 " + app.trim() + " 下架。")
                : (m3.trim() + " 将于 " + dZh + "自 " + app.trim() + " 下架。");
            return part1 + part2;
        }],
        [/^(.+?)\s+is (?:currently|now) available (?:to|on)\s+(.+?)\.?$/i, (m, m1, aud) => {
            const hasPeriod = /[.]$/.test(m.trim());
            const period = hasPeriod ? "。" : "";
            const model = m1.trim();
            const audZh = formatPlanAudience(aud);
            const isSubscribers = /subscriber/i.test(aud);
            const isCurrently = /currently/i.test(m);
            if (isSubscribers) {
                return USE_TW
                    ? (model + (isCurrently ? " 目前僅提供給 " : " 現已提供給 ") + audZh + "使用" + period)
                    : (model + (isCurrently ? " 目前仅提供给 " : " 现已提供给 ") + audZh + "使用" + period);
            }
            return USE_TW
                ? (model + (isCurrently ? " 目前在 " : " 現已在 ") + audZh + "中提供" + period)
                : (model + (isCurrently ? " 目前在 " : " 现已在 ") + audZh + "中提供" + period);
        }],
        [/^(.+?)\s+will be removed from\s+(.+?)\s+on\s+(.+?)\.?$/i, (m, m1, app, dateStr) => {
            const hasPeriod = /[.]$/.test(m.trim());
            const period = hasPeriod ? "。" : "";
            const dZh = formatEnglishDate(dateStr);
            return USE_TW
                ? (m1.trim() + " 將於 " + dZh + "自 " + app.trim() + " 下架" + period)
                : (m1.trim() + " 将于 " + dZh + "自 " + app.trim() + " 下架" + period);
        }],
        [/^(.+?)\s+will be removed on\s+(.+?)\.?$/i, (m, m1, dateStr) => {
            const hasPeriod = /[.]$/.test(m.trim());
            const period = hasPeriod ? "。" : "";
            const dZh = formatEnglishDate(dateStr);
            return USE_TW
                ? (m1.trim() + " 將於 " + dZh + "下架" + period)
                : (m1.trim() + " 将于 " + dZh + "下架" + period);
        }],
        [/^(.+?)\s+will be (?:discontinued|deprecated) on\s+(.+?)\.?$/i, (m, m1, dateStr) => {
            const hasPeriod = /[.]$/.test(m.trim());
            const period = hasPeriod ? "。" : "";
            const dZh = formatEnglishDate(dateStr);
            return USE_TW
                ? (m1.trim() + " 將於 " + dZh + "停止提供" + period)
                : (m1.trim() + " 将于 " + dZh + "停止提供" + period);
        }],
        [/^(.+?)\s+will no longer be available on your current plan starting on\s+(.+?)\.?$/i, (m, m1, dateStr) => {
            const hasPeriod = /[.]$/.test(m.trim());
            const period = hasPeriod ? "。" : "";
            const dZh = formatEnglishDate(dateStr);
            const isThirdParty = /third-party model access/i.test(m1.trim());
            return isThirdParty
                ? (USE_TW ? ("自 " + dZh + "起，您目前的方案將不再提供第三方模型存取權限" + period) : ("自 " + dZh + "起，您当前的方案将不再提供第三方模型访问权限" + period))
                : (USE_TW ? ("自 " + dZh + "起，您目前的方案將不再提供 " + m1.trim() + period) : ("自 " + dZh + "起，您当前的方案将不再提供 " + m1.trim() + period));
        }],
        [/^Third-party model access will no longer be available starting on\s+(.+?)\.?$/i, (m, dateStr) => {
            const hasPeriod = /[.]$/.test(m.trim());
            const period = hasPeriod ? "。" : "";
            const dZh = formatEnglishDate(dateStr);
            return USE_TW ? ("自 " + dZh + "起將不再提供第三方模型存取權限" + period) : ("自 " + dZh + "起将不再提供第三方模型访问权限" + period);
        }],

        // 帳號資格、地區不支援與登入錯誤動態提示
        [/^Your current account is not eligible for\s+(.+?),\s*because it is not currently available in your\s+(?:location|region|country|area)\.?$/i, (m, app) => {
            const period = /\.$/.test(m.trim()) ? "。" : "";
            return USE_TW
                ? `您目前的帳戶不符合使用 ${app.trim()} 的資格，因為您所在的地區目前不支援此服務${period}`
                : `您当前的账户无权使用 ${app.trim()}，因为您所在的地区目前暂不支持此服务${period}`;
        }],
        [/^(?:Your current|This)\s+account is not eligible (?:for|to use)\s+(.+?)\.?$/i, (m, app) => {
            const period = /\.$/.test(m.trim()) ? "。" : "";
            return USE_TW
                ? `目前帳戶不符合使用 ${app.trim()} 的資格${period}`
                : `当前账户无权使用 ${app.trim()}${period}`;
        }],
        [/^Sorry,\s*this account is ineligible to use\s+(.+?)\.?$/i, (m, app) => {
            const period = /\.$/.test(m.trim()) ? "。" : "";
            return USE_TW
                ? `抱歉，目前帳戶無權使用 ${app.trim()}${period}`
                : `抱歉，当前账户无权使用 ${app.trim()}${period}`;
        }],
        [/^Further action is required to use\s+(.+?)\.?$/i, (m, app) => {
            const period = /\.$/.test(m.trim()) ? "。" : "";
            return USE_TW
                ? `需要採取進一步行動才能使用 ${app.trim()}${period}`
                : `需要采取进一步操作才能使用 ${app.trim()}${period}`;
        }],
        [/^(?:This service|The service|Antigravity|Jetski)\s+is not (?:currently\s+)?available in your\s+(?:location|region|country|area)\.?$/i, (m) => {
            const period = /\.$/.test(m.trim()) ? "。" : "";
            return USE_TW
                ? `您所在的地區目前不支援此服務${period}`
                : `您所在的地区目前暂不支持此服务${period}`;
        }],
        [/^Your (?:current\s+)?(?:location|region|country|area) is not supported\.?$/i, (m) => {
            const period = /\.$/.test(m.trim()) ? "。" : "";
            return USE_TW
                ? `目前不支援您所在的地區${period}`
                : `当前不支持您所在的地区${period}`;
        }],
        [/^(.+?)\s+is not (?:currently\s+)?available in your\s+(?:location|region|country|area)\.?$/i, (m, target) => {
            const period = /\.$/.test(m.trim()) ? "。" : "";
            return USE_TW
                ? `您所在的地區目前不支援 ${target.trim()}${period}`
                : `您所在的地区目前暂不支持 ${target.trim()}${period}`;
        }],
        [/^You['’]re signing in on\s+(.+?)\.\s*Your sign-in stays on that machine\.?$/i, (m, host) => {
            const period = /\.$/.test(m.trim()) ? "。" : "";
            return USE_TW
                ? `您正在 ${host.trim()} 上登入。您的登入狀態會保留在該電腦上${period}`
                : `您正在 ${host.trim()} 上登录。您的登录状态将保留在该设备上${period}`;
        }],

        // v2.33.0 介面動態模板與錯誤訊息
        [/^Available AI Credits:\s*(.+)$/i, (m, val) => (USE_TW ? "可用 AI 點數：" : "可用 AI 额度：") + val],
        [/^(\d+)\s+results?$/i, (m, n) => n + (USE_TW ? " 個結果" : " 个结果")],
        [/^See all\s*\((\d+)\)$/i, (m, n) => USE_TW ? ("顯示全部 (" + n + ")") : ("查看全部 (" + n + ")")],
        [/^Account this MCP server uses:\s*(.+)$/i, (m, acc) => (USE_TW ? "此 MCP 伺服器使用的帳戶：" : "此 MCP 服务器使用的账户：") + acc],
        [/^Add shortcut for\s+(.+)$/i, (m, cmd) => USE_TW ? ("新增「" + cmd + "」的快速鍵") : ("为“" + cmd + "”添加快捷键")],
        [/^Remove shortcut\s+(.+?)\s+for\s+(.+)$/i, (m, key, cmd) => USE_TW ? ("移除「" + cmd + "」的快速鍵 " + key) : ("移除“" + cmd + "”的快捷键 " + key)],
        [/^Shortcut\s+(.+?)\s+for\s+(.+)$/i, (m, key, cmd) => USE_TW ? ("「" + cmd + "」的快速鍵 " + key) : ("“" + cmd + "”的快捷键 " + key)],
        [/^Recording shortcut for\s+(.+?)\.\s*Press keys to bind,\s*Enter to save,\s*Escape to cancel\.?$/i, (m, cmd) => USE_TW ? ("正在錄製「" + cmd + "」的快速鍵。按下按鍵以綁定，按 Enter 儲存，按 Escape 取消。") : ("正在录制“" + cmd + "”的快捷键。按下按键以绑定，按 Enter 保存，按 Escape 取消。")],
        [/^Connect GitHub:\s*(.+)$/i, (m, t) => (USE_TW ? "連線 GitHub：" : "连接 GitHub：") + t],
        [/^Delete cookies for\s+(.+)$/i, (m, site) => USE_TW ? ("刪除 " + site + " 的 Cookie") : ("删除 " + site + " 的 Cookie")],
        [/^Delete side question:\s*(.+)$/i, (m, q) => (USE_TW ? "刪除側邊提問：" : "删除侧边提问：") + q],
        [/^Details for\s+(.+)$/i, (m, t) => t + (USE_TW ? " 的詳細資訊" : " 的详细信息")],
        [/^Duplicate\s+(.+?)\s+name$/i, (m, t) => t + (USE_TW ? " 名稱重複" : " 名称重复")],
        [/^Edit comment:\s*(.+)$/i, (m, c) => (USE_TW ? "編輯評論：" : "编辑评论：") + c],
        [/^Edit\s+(.+?)\s+name$/i, (m, t) => (USE_TW ? "編輯 " : "编辑 ") + t + (USE_TW ? " 名稱" : " 名称")],
        [/^Install folder\s+["“](.+?)["”]\s+is already in use$/i, (m, p) => USE_TW ? ("安裝資料夾「" + p + "」已被使用") : ("安装文件夹“" + p + "”已被占用")],
        [/^Make\s+(.+?)\s+the default\s+(.+?)\s+account$/i, (m, acc, svc) => USE_TW ? ("將 " + acc + " 設為預設的 " + svc + " 帳戶") : ("将 " + acc + " 设为默认的 " + svc + " 账户")],
        [/^More actions for\s+(.+)$/i, (m, t) => t + (USE_TW ? " 的更多操作" : " 的更多操作")],
        [/^More for\s+(.+)$/i, (m, t) => USE_TW ? ("更多 " + t + " 選項") : ("更多 " + t + " 选项")],
        [/^New secret for\s+(.+)$/i, (m, svc) => svc + (USE_TW ? " 的新密鑰" : " 的新密钥")],
        [/^Secret for a new\s+(.+?)\s+account$/i, (m, svc) => USE_TW ? ("新 " + svc + " 帳戶的密鑰") : ("新 " + svc + " 账户的密钥")],
        [/^Secret for\s+(.+)$/i, (m, svc) => svc + (USE_TW ? " 的密鑰" : " 的密钥")],
        [/^Open Subagent:\s*(.+)$/i, (m, t) => (USE_TW ? "開啟子代理：" : "打开子代理：") + t],
        [/^Open URL in system browser:\s*(.+)$/i, (m, u) => (USE_TW ? "在系統瀏覽器中開啟網址：" : "在系统浏览器中打开网址：") + u],
        [/^Opens external link:\s*(.+)$/i, (m, u) => (USE_TW ? "開啟外部連結：" : "打开外部链接：") + u],
        [/^Page\s+(\d+)\s+failed to load$/i, (m, n) => USE_TW ? ("第 " + n + " 頁載入失敗") : ("第 " + n + " 页加载失败")],
        [/^Plan,\s*(\d+)\s+of\s+(\d+)\s+steps done$/i, (m, d, tot) => USE_TW ? ("計畫，已完成 " + d + " / " + tot + " 個步驟") : ("计划，已完成 " + d + " / " + tot + " 步")],
        [/^Question\s+(\d+)\s+of\s+(\d+)$/i, (m, c, tot) => USE_TW ? ("第 " + c + " 題（共 " + tot + " 題）") : ("第 " + c + " 题（共 " + tot + " 题）")],
        [/^Turn\s+(\d+)\s+of\s+(\d+)$/i, (m, c, tot) => USE_TW ? ("第 " + c + " 輪（共 " + tot + " 輪）") : ("第 " + c + " 轮（共 " + tot + " 轮）")],
        [/^Go to page\s+(\d+)$/i, (m, n) => USE_TW ? ("前往第 " + n + " 頁") : ("跳至第 " + n + " 页")],
        [/^Go to slide\s+(\d+)$/i, (m, n) => USE_TW ? ("前往第 " + n + " 張投影片") : ("跳至第 " + n + " 张幻灯片")],
        [/^Go to turn\s+(\d+)\s+of\s+(\d+)$/i, (m, c, tot) => USE_TW ? ("前往第 " + c + " / " + tot + " 輪") : ("跳至第 " + c + " / " + tot + " 轮")],
        [/^Playback speed\s+([0-9.]+)x$/i, (m, s) => (USE_TW ? "播放速度 " : "播放速度 ") + s + "x"],
        [/^Plugins in\s+(.+)$/i, (m, loc) => loc + (USE_TW ? " 中的外掛程式" : " 中的插件")],
        [/^Remove context from\s+(.+)$/i, (m, t) => USE_TW ? ("從 " + t + " 移除上下文") : ("从 " + t + " 移除上下文")],
        [/^Remove\s+(.+?)\s+from list$/i, (m, t) => USE_TW ? ("從清單中移除 " + t) : ("从列表中移除 " + t)],
        [/^Reset\s+(.+?)\s+to default$/i, (m, t) => USE_TW ? ("將 " + t + " 重設為預設值") : ("将 " + t + " 重置为默认值")],
        [/^Review\s+(.+?)\s+before installing$/i, (m, t) => USE_TW ? ("安裝前請先檢閱 " + t) : ("安装前请先查看 " + t)],
        [/^Run\s+(.+?)\s+now$/i, (m, t) => (USE_TW ? "立即執行 " : "立即运行 ") + t],
        [/^Scroll to:\s*(.+?)\s+on page\s+(\d+)$/i, (m, t, p) => USE_TW ? ("捲動至第 " + p + " 頁的「" + t + "」") : ("滚动至第 " + p + " 页的“" + t + "”")],
        [/^Search match on page\s+(\d+)$/i, (m, p) => USE_TW ? ("第 " + p + " 頁的搜尋相符項目") : ("第 " + p + " 页的搜索匹配项")],
        [/^Bounding box on page\s+(\d+)$/i, (m, p) => USE_TW ? ("第 " + p + " 頁的定界框") : ("第 " + p + " 页的边界框")],
        [/^Comment on page\s+(\d+)$/i, (m, p) => USE_TW ? ("第 " + p + " 頁的評論") : ("第 " + p + " 页的评论")],
        [/^Show\s+(.+?)\s+in folder$/i, (m, t) => USE_TW ? ("在資料夾中顯示 " + t) : ("在文件夹中显示 " + t)],
        [/^Sign in to\s+(.+?)\s+remotely$/i, (m, t) => (USE_TW ? "遠端登入 " : "远程登录 ") + t],
        [/^Sign in to\s+(.+)$/i, (m, t) => (USE_TW ? "登入 " : "登录 ") + t],
        [/^Switch environment\s*\((.+)\)$/i, (m, env) => (USE_TW ? "切換環境 (" : "切换环境 (") + env + ")"],
        [/^Toggle Word Wrap(.*)$/i, (m, rest) => (USE_TW ? "切換自動換行" : "切换自动换行") + rest],
        [/^Using default\s+(.+?)\s+name$/i, (m, t) => USE_TW ? ("使用預設的 " + t + " 名稱") : ("使用默认的 " + t + " 名称")],
        [/^Version\s+([0-9A-Za-z._-]+)$/i, (m, v) => "版本 " + v],
        [/^View Diff for\s+(.+)$/i, (m, t) => USE_TW ? ("檢視 " + t + " 的差異") : ("查看 " + t + " 的差异")],
        [/^Zoom\s+(\d+)%,\s*reset to fit$/i, (m, z) => USE_TW ? ("縮放 " + z + "%（重設為符合畫面大小）") : ("缩放 " + z + "%（重置为适合画面）")],
        [/^Cost summary:\s*(.+)$/i, (m, s) => (USE_TW ? "費用摘要：" : "费用摘要：") + s],
        [/^Fix with Agent:\s*(.+)$/i, (m, s) => (USE_TW ? "交由代理修復：" : "交由智能体修复：") + s],
        [/^Filter skills and rules:\s*(.+)$/i, (m, s) => (USE_TW ? "篩選技能與規則：" : "筛选技能和规则：") + s],
        [/^Failed to archive\s+(.+)$/i, (m, t) => USE_TW ? ("封存 " + t + " 失敗") : ("归档 " + t + " 失败")],
        [/^Failed to create\s+(.+?)\.?$/i, (m, t) => USE_TW ? ("建立 " + t + " 失敗" + (/\.$/.test(m) ? "。" : "")) : ("创建 " + t + " 失败" + (/\.$/.test(m) ? "。" : ""))],
        [/^Failed to delete\s+(.+?):\s*(.+)$/i, (m, t, err) => USE_TW ? ("刪除 " + t + " 失敗：" + err) : ("删除 " + t + " 失败：" + err)],
        [/^Failed to delete\s+(.+)$/i, (m, t) => USE_TW ? ("刪除 " + t + " 失敗") : ("删除 " + t + " 失败")],
        [/^Failed to\s+(.+?)\s+conversation$/i, (m, act) => USE_TW ? ("無法對對話執行「" + act + "」操作") : ("无法对对话执行“" + act + "”操作")],
        [/^Couldn['’]t connect to\s+(.+)$/i, (m, t) => (USE_TW ? "無法連線至 " : "无法连接至 ") + t],
        [/^Couldn['’]t\s+(.+?)\s+conversation$/i, (m, act) => USE_TW ? ("無法對對話執行「" + act + "」操作") : ("无法对对话执行“" + act + "”操作")],
        [/^Low contrast ratio\s*\((.+?):1\)\.\s*Text may be hard to read\.?$/i, (m, r) => USE_TW ? ("對比度過低（" + r + ":1），文字可能難以閱讀。") : ("对比度过低（" + r + ":1），文字可能难以阅读。")],
        [/^Preview unavailable\s*[—–-]\s*(.+)$/i, (m, r) => (USE_TW ? "無法預覽 — " : "无法预览 — ") + r],
        [/^Help us improve\s+(.+?)\.?$/i, (m, app) => USE_TW ? ("協助我們改進 " + app.trim() + (/\.$/.test(m) ? "。" : "")) : ("帮助我们改进 " + app.trim() + (/\.$/.test(m) ? "。" : ""))],
        [/^Endpoint\s+(.+?)\s+not implemented$/i, (m, ep) => USE_TW ? ("端點 " + ep + " 尚未實作") : ("端点 " + ep + " 尚未实现")],
        [/^Malformed Worker RPC params for\s+(.+?):\s*expected plain object$/i, (m, fn) => USE_TW ? (fn + " 的 Worker RPC 參數格式錯誤：預期為一般物件") : (fn + " 的 Worker RPC 参数格式错误：预期为普通对象")],
        [/^Failed to save project Google3 configuration:\s*(.+)$/i, (m, err) => (USE_TW ? "儲存專案 Google3 設定失敗：" : "保存项目 Google3 配置失败：") + err],
        [/^Failed to save project:\s*(.+)$/i, (m, err) => (USE_TW ? "儲存專案失敗：" : "保存项目失败：") + err],
        [/^(?:Auth|Authorization) code for\s+(.+)$/i, (m, app) => app + (USE_TW ? " 的授權碼" : " 的授权码")],
        [/^Worker sandbox initialization failed:\s*(.+)$/i, (m, err) => (USE_TW ? "Worker 沙箱初始化失敗：" : "Worker 沙箱初始化失败：") + err],
        // v2.35.0 / v2.35.1 多分支動態規則與語義組裝
        [/^New\s+(.+?)\.\.\.$/, (m, kind) => (USE_TW ? "新增" : "新建") + translateNoun(kind) + "..."],
        [/^You need (at least \d+|more) AI Credits to send messages\. To continue using (.+?) now, purchase more AI Credits\.$/i, (m, amt, target) => {
            const amtZh = /^more$/i.test(amt) ? "更多" : amt.replace(/^at least\s+/i, "至少 ");
            const tZh = /^this model$/i.test(target.trim()) ? "此模型" : target.trim();
            return USE_TW
                ? ("您需要" + amtZh + " AI 點數才能傳送訊息。若要立即繼續使用 " + tZh + "，請購買更多 AI 點數。")
                : ("您需要" + amtZh + " AI 额度才能发送消息。要立即继续使用 " + tZh + "，请购买更多 AI 额度。");
        }],
        [/^Your quota for (.+?) will reset on (.+?)\. Switch to another available model to continue\.$/i, (m, model, when) => {
            const mZh = /^this model$/i.test(model.trim()) ? "此模型" : model.trim();
            return USE_TW
                ? ("您的 " + mZh + " 配額將於 " + when + " 重設。請切換至其他可用模型以繼續。")
                : ("您的 " + mZh + " 配额将于 " + when + " 重置。请切换至其他可用模型以继续。");
        }],
        [/^Your quota for (.+?) has been reached\. Switch to another available model to continue\.$/i, (m, model) => {
            const mZh = /^this model$/i.test(model.trim()) ? "此模型" : model.trim();
            return USE_TW
                ? ("您的 " + mZh + " 配額已用盡。請切換至其他可用模型以繼續。")
                : ("您的 " + mZh + " 配额已用完。请切换至其他可用模型以继续。");
        }],
        [/^Model unavailable,\s*retrying(?:\s+in\s+(\d+)s)?(?:\s*\(attempt\s+(\d+)\/(\d+)\))?$/i, (m, sec, att, max) => {
            const attZh = att ? (USE_TW ? ("（第 " + att + "/" + max + " 次嘗試）") : ("（第 " + att + "/" + max + " 次尝试）")) : "";
            if (sec) return USE_TW ? ("模型暫時無法使用，" + sec + " 秒後重試" + attZh) : ("模型暂不可用，" + sec + " 秒后重试" + attZh);
            return USE_TW ? ("模型暫時無法使用，正在重試" + attZh) : ("模型暂不可用，正在重试" + attZh);
        }],
        [/^Using browser(?:\s*·\s*(.+?))?(?:\s*\((\d+)s\))?$/i, (m, action, s) => {
            const act = action ? (" · " + (lookupDict(action) || action)) : "";
            const dur = s ? (" (" + s + " 秒)") : "";
            return (USE_TW ? "正在使用瀏覽器" : "正在使用浏览器") + act + dur;
        }],
        [/^(Started|Stopped) voice chat\s*·\s*(.+)$/i, (m, act, rest) => {
            const verb = /^Started/i.test(act) ? (USE_TW ? "已開始語音對話 · " : "已开始语音对话 · ") : (USE_TW ? "已結束語音對話 · " : "已结束语音对话 · ");
            return verb + rest;
        }],
        [/^Turns?\s+(\d+)(?:[–-](\d+))?$/i, (m, a, b) => b ? ("第 " + a + "–" + b + (USE_TW ? " 輪" : " 轮")) : ("第 " + a + (USE_TW ? " 輪" : " 轮"))],
        [/^(Turn|Tot):\s*(\d+)\/(\d+)$/i, (m, kind, a, b) => (/^Turn/i.test(kind) ? (USE_TW ? "輪次：" : "轮次：") : (USE_TW ? "總計：" : "总计：")) + a + "/" + b],
        [/^(Today|Tomorrow|Yesterday)\s+(.+)$/i, (m, day, time) => {
            const dLow = day.toLowerCase();
            const dZh = dLow === "today" ? "今天" : (dLow === "tomorrow" ? "明天" : "昨天");
            return dZh + " " + time;
        }],
        [/^Every\s+(\d+)\s+(hours?|minutes?)(.*)$/i, (m, n, unit, rest) => {
            const uZh = /^hour/i.test(unit) ? (USE_TW ? " 小時" : " 小时") : (USE_TW ? " 分鐘" : " 分钟");
            return "每 " + n + uZh + (rest || "");
        }],
        [/^(?:(\d+)d\s+)?(?:(\d+)h\s+)?(?:(\d+)m|(\d+)s)\s+left$/i, (m, d, h, min, sec) => {
            const parts = [];
            if (d) parts.push(d + " 天");
            if (h) parts.push(h + (USE_TW ? " 小時" : " 小时"));
            if (min) parts.push(min + (USE_TW ? " 分鐘" : " 分钟"));
            if (sec) parts.push(sec + " 秒");
            return (USE_TW ? "剩餘 " : "剩余 ") + parts.join(" ");
        }],
        [/^(\d+)\s+(image|video|audio)\s+attachments?$/i, (m, n, kind) => {
            const kZh = kind.toLowerCase() === "image" ? (USE_TW ? "張圖片附件" : "张图片附件")
                : kind.toLowerCase() === "video" ? (USE_TW ? "個影片附件" : "个视频附件")
                : (USE_TW ? "個音訊附件" : "个音频附件");
            return n + " " + kZh;
        }],
        [/^(\d+)\s+(questions?|turns?|comments?|subagents?|chunks?|accounts?|rows?)$/i, (m, n, kind) => {
            const k = kind.toLowerCase();
            const mapZh = USE_TW
                ? { question: "個問題", questions: "個問題", turn: "輪", turns: "輪", comment: "則評論", comments: "則評論", subagent: "個子代理", subagents: "個子代理", chunk: "個區塊", chunks: "個區塊", account: "個帳戶", accounts: "個帳戶", row: "列", rows: "列" }
                : { question: "个问题", questions: "个问题", turn: "轮", turns: "轮", comment: "条评论", comments: "条评论", subagent: "个子智能体", subagents: "个子智能体", chunk: "个区块", chunks: "个区块", account: "个账户", accounts: "个账户", row: "行", rows: "行" };
            return n + " " + (mapZh[k] || kind);
        }],
        [/^(Generating|Generated|Generate) with (.+?) 🍌$/i, (m, verb, model) => {
            const vZh = /^Generating/i.test(verb) ? "正在使用 " : (/^Generated/i.test(verb) ? "已使用 " : "使用 ");
            return vZh + model + (USE_TW ? " 產生 🍌" : " 生成 🍌");
        }],
        [/^(?:Searched web|Searched for|Internal search|Code search|Browser task):\s*"(.+)"$/i, (m, q) => {
            const prefix = /^Searched web/i.test(m) ? (USE_TW ? "已搜尋網頁：" : "已搜索网页：")
                : /^Searched for/i.test(m) ? (USE_TW ? "已搜尋：" : "已搜索：")
                : /^Internal search/i.test(m) ? (USE_TW ? "內部搜尋：" : "内部搜索：")
                : /^Code search/i.test(m) ? (USE_TW ? "程式碼搜尋：" : "代码搜索：")
                : (USE_TW ? "瀏覽器任務：" : "浏览器任务：");
            return prefix + (USE_TW ? ("「" + q + "」") : ("“" + q + "”"));
        }],
        [/^Runs even when your computer is off\.\s*(Schedules and events\.|Schedules only\.)$/i, (m, kind) => (USE_TW ? "即使電腦關機也會執行。" : "即使计算机关闭也会运行。") + (/events/i.test(kind) ? (USE_TW ? "排程與事件。" : "定时与事件。") : (USE_TW ? "僅排程。" : "仅定时。"))],
        [/^The selected (.+?) can't be found\. Pick another (.+?) from the (.+?) selector to send\.$/i, (m, n1, n2, n3) => USE_TW
            ? ("找不到所選的" + translateNoun(n1) + "。請從" + translateNoun(n3) + "選擇器選取其他" + translateNoun(n2) + "以傳送。")
            : ("找不到所选的" + translateNoun(n1) + "。请从" + translateNoun(n3) + "选择器中选择其他" + translateNoun(n2) + "以发送。")],
        [/^This (.+?) overrides your global permission settings\.$/i, (m, kind) => USE_TW ? ("此" + translateNoun(kind) + "會覆寫您的全域權限設定。") : ("此" + translateNoun(kind) + "会覆盖您的全局权限设置。")],
        [/^(.+?) needs (.+?) to use your computer\.$/i, (m, app, perms) => {
            if (/^both$/i.test(perms.trim())) return app + (USE_TW ? " 需要這兩項權限才能操作您的電腦。" : " 需要这两项权限才能控制您的电脑。");
            const pZh = perms.replace(/Accessibility/gi, USE_TW ? "「輔助使用」" : "“辅助功能”").replace(/Screen Recording/gi, USE_TW ? "「螢幕錄製」" : "“屏幕录制”");
            return app + " 需要" + pZh + (USE_TW ? "權限才能操作您的電腦。" : "权限才能控制您的电脑。");
        }],
        [/^Check if there is a typo in (.+?), or open the page in your external browser\.$/i, (m, h) => {
            const hZh = /^the address$/i.test(h.trim()) ? (USE_TW ? "網址" : "地址") : h.trim();
            return USE_TW ? ("請檢查 " + hZh + " 是否有拼字錯誤，或在外部瀏覽器中開啟該頁面。") : ("请检查 " + hZh + " 是否有拼写错误，或在外部浏览器中打开该页面。");
        }],
        [/^(?:(Open|Reopen)\s+)?(Accessibility|Screen Recording) settings$/i, (m, act, pane) => {
            const pZh = /^Accessibility/i.test(pane) ? (USE_TW ? "輔助使用" : "辅助功能") : (USE_TW ? "螢幕錄製" : "屏幕录制");
            if (!act) return pZh + (USE_TW ? "設定" : "设置");
            return (/^Reopen/i.test(act) ? (USE_TW ? "重新開啟" : "重新打开") : (USE_TW ? "開啟" : "打开")) + pZh + (USE_TW ? "設定" : "设置");
        }],
        [/^Work in (.+)$/i, (m, wt) => /^progress$/i.test(wt.trim()) ? m : ("在 " + wt + " 中工作")],
        [/^(.+?)\.\s+(Show|Hide)\s+plan$/i, (m, title, verb) => title + "。" + (/^Hide/i.test(verb) ? (USE_TW ? "隱藏計畫" : "隐藏计划") : (USE_TW ? "顯示計畫" : "显示计划"))],
        [/^(.+?):\s*([\d,]+)\s+tokens$/i, (m, label, num) => (lookupDict(label) || label) + "：" + num + " Token"],
        [/^(.+?)\.\s*View site information$/i, (m, summary) => summary + (USE_TW ? "。檢視網站資訊" : "。查看站点信息")]
    ];

    function isSafeDeclarativeRegex(pattern, flags) {
        if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 512) return false;
        if (!pattern.startsWith('^') || !pattern.endsWith('$')) return false;
        let trailEsc = 0;
        for (let j = pattern.length - 2; j >= 0 && pattern[j] === '\\'; j--) trailEsc++;
        if (trailEsc % 2 === 1) return false;

        if (typeof flags !== 'string' || flags.length > 3) return false;
        const seenFlags = new Set();
        for (const ch of flags) {
            if ((ch !== 'i' && ch !== 'm' && ch !== 'u') || seenFlags.has(ch)) return false;
            seenFlags.add(ch);
        }
        const readQ = (pat, pos) => {
            const c = pat[pos];
            if (c === '*' || c === '+' || c === '?') {
                return { end: pat[pos + 1] === '?' ? pos + 2 : pos + 1, unbounded: c !== '?', repeatable: c !== '?' };
            }
            if (c === '{') {
                const close = pat.indexOf('}', pos);
                if (close > pos) {
                    const mm = pat.slice(pos + 1, close).match(/^(\d+)(?:,(\d*))?$/);
                    if (mm) {
                        const max = mm[2] === undefined ? Number(mm[1]) : (mm[2] === '' ? Infinity : Number(mm[2]));
                        return { end: pat[close + 1] === '?' ? close + 2 : close + 1, unbounded: mm[2] === '', repeatable: max > 1 };
                    }
                }
            }
            return null;
        };
        const stack = [];
        let unboundedDots = 0;
        for (let i = 0; i < pattern.length;) {
            const ch = pattern[i];
            if (ch === '\\') {
                if (i + 1 >= pattern.length) return false;
                const esc = pattern[i + 1];
                if ((esc >= '1' && esc <= '9') || esc === 'k') return false;
                i += 2;
                const q = readQ(pattern, i);
                if (q) { if (q.unbounded && stack.length) stack[stack.length - 1].u = true; i = q.end; if (readQ(pattern, i)) return false; }
                continue;
            }
            if (ch === '[') {
                i++;
                let closed = false;
                while (i < pattern.length) {
                    if (pattern[i] === '\\') { i += 2; continue; }
                    if (pattern[i] === ']') { closed = true; i++; break; }
                    i++;
                }
                if (!closed) return false;
                const q = readQ(pattern, i);
                if (q) { if (q.unbounded && stack.length) stack[stack.length - 1].u = true; i = q.end; if (readQ(pattern, i)) return false; }
                continue;
            }
            if (ch === '(') {
                if (pattern[i + 1] === '?' && (
                    pattern[i + 2] === '=' ||
                    pattern[i + 2] === '!' ||
                    (pattern[i + 2] === '<' && (pattern[i + 3] === '=' || pattern[i + 3] === '!'))
                )) {
                    return false;
                }
                stack.push({ u: false, a: false });
                i++;
                continue;
            }
            if (ch === '|') {
                if (!stack.length) return false;
                stack[stack.length - 1].a = true;
                i++;
                continue;
            }
            if (ch === ')') {
                if (!stack.length) return false;
                const f = stack.pop(); i++;
                const q = readQ(pattern, i);
                if (q) {
                    if (q.repeatable && (f.u || f.a)) return false;
                    if (stack.length) {
                        if (q.unbounded || f.u) stack[stack.length - 1].u = true;
                        if (f.a) stack[stack.length - 1].a = true;
                    }
                    i = q.end;
                    if (readQ(pattern, i)) return false;
                } else if (stack.length) {
                    if (f.u) stack[stack.length - 1].u = true;
                    if (f.a) stack[stack.length - 1].a = true;
                }
                continue;
            }
            if (ch === '.') {
                i++;
                const q = readQ(pattern, i);
                if (q) {
                    if (q.unbounded) {
                        unboundedDots++;
                        if (unboundedDots > 4) return false;
                        if (stack.length) stack[stack.length - 1].u = true;
                    }
                    i = q.end;
                    if (readQ(pattern, i)) return false;
                }
                continue;
            }
            if (ch === '*' || ch === '+' || ch === '?' || ch === '{') {
                const q = readQ(pattern, i);
                if (q) { if (q.unbounded && stack.length) stack[stack.length - 1].u = true; i = q.end; if (readQ(pattern, i)) return false; continue; }
            }
            i++;
        }
        return stack.length === 0;
    }

    function applyRuleTransform(val, mode) {
        if (!mode || mode === 'raw') return val;
        if (mode === 'trim') return val.trim();
        if (mode === 'zhPeriod') return val.trim() === '.' ? '。' : '';
        if (mode === 'lookupOrKeep') {
            const k = val.trim();
            return map.get(k) || lowerMap.get(k.toLowerCase()) || k;
        }
        if (mode === 'compactDuration') return formatCompactDuration(val.trim());
        if (mode === 'englishDate') return formatEnglishDate(val.trim());
        if (mode === 'usageDuration') return formatUsageDuration(val.trim());
        if (mode === 'planAudience') return formatPlanAudience(val.trim());
        return val;
    }

    function compileDeclarativeRules(ruleDefs) {
        if (!Array.isArray(ruleDefs)) return [];
        const compiled = [];
        for (const def of ruleDefs) {
            if (!def || typeof def !== 'object') continue;
            const flags = typeof def.flags === 'string' ? def.flags : '';
            if (!isSafeDeclarativeRegex(def.pattern, flags)) continue;
            const tpl = USE_TW ? def.tw : def.sc;
            if (typeof tpl !== 'string' || !tpl) continue;
            try {
                const regex = new RegExp(def.pattern, flags);
                const transforms = (def.transforms && typeof def.transforms === 'object') ? def.transforms : null;
                // 模板中文字與填入的中文譯名相鄰時去掉中間半形空格（「移至 封存」→「移至封存」）；填入英文時保留盤古之白
                compiled.push([regex, match => tpl.replace(/([㐀-鿿　-〿＀-￯]?)( ?)\{([1-9])\}( ?)(?=([㐀-鿿　-〿＀-￯]?))/g, (_w, before, preSpace, idx, postSpace, after) => {
                    const val = applyRuleTransform(match[Number(idx)] || '', transforms && transforms[idx]);
                    const cjk = /[㐀-鿿　-〿＀-￯]/;
                    const pre = before && preSpace && cjk.test(val.charAt(0)) ? '' : preSpace;
                    const post = after && postSpace && cjk.test(val.charAt(val.length - 1)) ? '' : postSpace;
                    return before + pre + val + post;
                })]);
            } catch {}
        }
        return compiled;
    }

    const JSON_DYNAMIC_RULES = compileDeclarativeRules(RUNTIME_RULES.dynamicRules);
    const JSON_ATTR_DYNAMIC_RULES = compileDeclarativeRules(RUNTIME_RULES.attrDynamicRules);

    function matchRuleList(list, text) {
        if (!text || text.length > 1000) return null;
        for (const [regex, replacer] of list) {
            const match = text.match(regex);
            if (match) return replacer(match, ...match.slice(1));
        }
        return null;
    }

    function translateAttrDynamic(t) {
        // 「動詞＋冠詞／介系詞」開頭的是完整英文片語（Open the Swarm UI、Add to chat input），
        // 只換掉動詞會變成「開啟 the Swarm UI」這種中英夾雜，寧可保留原文
        if (/^[A-Za-z]+\s+(?:the|a|an|to|into|in|on|from|with|for|this|that|your|my|all|as|at|by|of)\s/i.test(t)) return null;
        return matchRuleList(JSON_ATTR_DYNAMIC_RULES, t);
    }

    function translateExactOrDynamic(t) {
        const usageTrans = translateUsageText(t);
        if (usageTrans) return usageTrans;
        const shortcutTrans = translateWithShortcut(t);
        if (shortcutTrans) return shortcutTrans;
        if (map.has(t)) return map.get(t);
        const lower = t.toLowerCase();
        if (lowerMap.has(lower)) return lowerMap.get(lower);
        const jsonHit = matchRuleList(JSON_DYNAMIC_RULES, t);
        if (jsonHit !== null) return jsonHit;
        for (const [regex, replacer] of DYNAMIC_RULES) {
            if (regex.test(t)) return t.replace(regex, replacer);
        }
        return null;
    }

    // 处理受父节点上下文约束的碎片化 DOM 文本
    function translateContextualText(node, originalVal, valNorm) {
        const p = node.parentElement;
        if (!p) return null;
        const pText = p.textContent || '';

        if (/^(\d+)(s|m|h|d|w|mo|yr)$/i.test(valNorm)) {
            return valNorm.replace(/^(\d+)(s|m|h|d|w|mo|yr)$/i, (match, num, unit) => {
                const pair = UNIT_MAP[unit.toLowerCase()];
                let unitStr = pair ? pair[USE_TW ? 1 : 0] : unit;
                if (typeof p.closest === 'function' && p.closest('[data-testid="conversation-row-sidebar"]')) {
                    unitStr += "前";
                }
                return num + unitStr;
            });
        }
        if ((valNorm === 'Card' || valNorm === 'of') && ((typeof p.closest === 'function' && p.closest('[data-testid="card-deck-counter"]')) || (p.getAttribute && p.getAttribute('data-testid') === 'card-deck-counter'))) {
            return valNorm === 'Card' ? "卡片 " : " / ";
        }
        if (pText.includes('For corp passwords (such as')) {
            if (valNorm === 'For corp passwords (such as') return USE_TW ? "如需使用公司密碼（例如 " : "如需使用公司密码（例如 ";
            if (valNorm === 'or') return " 或 ";
            if (valNorm.startsWith('), use an external SSH session')) return valNorm.replace(/^\), use an external SSH session/i, USE_TW ? "），請使用外部 SSH 工作階段" : "），请使用外部 SSH 会话");
            if (valNorm.startsWith('. For non-corp passwords')) return USE_TW ? "。對於非公司密碼或 SSH 密碼複雜密碼，請允許下一次提示並重新執行指令。" : "。对于非公司密码或 SSH 密码短语，请允许下一次提示并重新运行命令。";
        }
        if (pText.includes('what should we build today') || pText.includes('今天我們要打造什麼') || pText.includes('今天我们要构建什么')) {
            if (valNorm === 'Hey') return USE_TW ? "嗨" : "嗨";
            if (/^,?\s*what should we build today\??$/i.test(valNorm)) {
                return USE_TW ? "，今天我們要打造什麼？" : "，今天我们要构建什么？";
            }
        }
        if ((valNorm === 'Type' || valNorm === 'and select') && ((typeof p.closest === 'function' && p.closest('[data-testid="plan-command-fyi-alert"]')) || pText.includes('generate a plan'))) {
            return valNorm === 'Type' ? (USE_TW ? "輸入" : "输入") : (USE_TW ? "並選取" : "并选择");
        }
        if (valNorm === 'and' && (pText.includes('Privacy Policy') || pText.includes('Terms of Service') || pText.includes('隐私政策') || pText.includes('隱私權政策'))) {
            return "以及";
        }
        if (valNorm === 'Variables' && ((typeof p.closest === 'function' && (p.closest('[data-testid="trigger-cel-tokens"]') || p.closest('[data-testid="trigger-cel-optional-section"]'))) || /Target|Fields|Helpers|目标|目標|字段|欄位/.test(pText))) {
            return USE_TW ? "變數" : "变量";
        }
        if ((valNorm === 'Search conversations with' || valNorm === 'in the top left.') && pText.includes('in the top left')) {
            return valNorm === 'Search conversations with' ? (USE_TW ? "使用左上角的" : "可通过左上角的") : (USE_TW ? "搜尋對話。" : "搜索对话。");
        }
        if ((valNorm === 'View archived in the sidebar' || valNorm === 'menu)') && (pText.includes('View archived in the sidebar') || pText.includes('已归档对话可在侧边栏') || pText.includes('已封存對話可在側邊欄') || pText.includes('已歸檔對話可在側邊欄'))) {
            return valNorm === 'View archived in the sidebar' ? (USE_TW ? "已封存對話可在側邊欄" : "已归档对话可在侧边栏") : (USE_TW ? "選單中檢視。" : "菜单中查看。");
        }
        if ((valNorm === 'For help, visit' || valNorm === 'or join the' || valNorm === 'chat space') && pText.includes('chat space')) {
            if (valNorm === 'For help, visit') return USE_TW ? "如需協助，請造訪" : "如需帮助，请访问";
            if (valNorm === 'or join the') return "或加入";
            if (valNorm === 'chat space') return USE_TW ? "聊天空間" : "聊天空间";
        }
        if ((valNorm === 'when working' || valNorm === 'in this project' || valNorm === 'in these conversations') && /when working|Global Permissions|全局权限|全域權限|Global Settings|全局设置|全域設定/.test(pText)) {
            if (valNorm === 'when working') {
                return pText.includes('in this project')
                    ? (USE_TW ? "（在此專案中工作時）" : "（在此项目中工作时）")
                    : (USE_TW ? "（在這些對話中工作時）" : "（在这些会话中工作时）");
            }
            return "";
        }
        if ((valNorm === 'Use' || originalVal === 'Use ') && ((typeof p.closest === 'function' && p.closest('[data-testid="voice-picker-use"]')) || (p.getAttribute && p.getAttribute('data-testid') === 'voice-picker-use'))) {
            return "使用 ";
        }
        if ((valNorm === 'Change' || valNorm === 'Change…' || valNorm === 'Change...') && ((typeof p.closest === 'function' && (p.closest('[data-testid="voice-settings-change"]') || p.closest('[data-testid="builtin-browser-download-dir-change"]'))) || (p.getAttribute && (p.getAttribute('data-testid') === 'voice-settings-change' || p.getAttribute('data-testid') === 'builtin-browser-download-dir-change')))) {
            const hasEllipsis = valNorm.includes('…') || valNorm.includes('...');
            return USE_TW ? (hasEllipsis ? "變更…" : "變更") : (hasEllipsis ? "更改…" : "更改");
        }
        if ((typeof p.closest === 'function' && p.closest('[data-testid="voice-picker"]')) || (p.querySelector && p.querySelector('[data-testid="voice-picker-settings-link"]'))) {
            if (valNorm.startsWith('Powered by Gemini Live')) return USE_TW ? "由 Gemini Live 提供技術支援 · " : "由 Gemini Live 提供技术支持 · ";
            if (valNorm === 'You can change this in') return USE_TW ? "您稍後可在 " : "您稍后可在 ";
            if (valNorm === 'later.') return USE_TW ? " 中變更。" : " 中更改。";
        }
        if (valNorm === 'No' && p.tagName === 'SPAN') {
            const writeIn = p.nextElementSibling;
            const hint = '(tell the agent what to do instead)';
            const placeholder = writeIn && typeof writeIn.getAttribute === 'function' ? writeIn.getAttribute('placeholder') : null;
            if (writeIn && typeof writeIn.matches === 'function' && writeIn.matches('textarea[data-testid="ask-question-writein"]') &&
                (placeholder === hint || placeholder === map.get(hint))) {
                return '否';
            }
        }
        if ((valNorm === 'Proceed to' || valNorm === '(unsafe)') && pText.includes('Proceed to') && pText.includes('(unsafe)')) {
            return valNorm === 'Proceed to' ? (USE_TW ? "繼續前往 " : "继续前往 ") : (USE_TW ? "（不安全）" : "（不安全）");
        }
        if (valNorm === 'Customize your experience from visual themes to how autonomous your agent acts and what') {
            return USE_TW ? "自訂您的使用體驗，從視覺佈景主題到代理的自主程度以及 " : "自定义您的使用体验，从视觉主题到智能体的自主程度以及 ";
        }
        if (valNorm === "Customize your experience across the agent, plugins, and product from the settings and marketplace. We won't show you ads or let advertisers influence what") {
            return USE_TW
                ? "從設定與市集中自訂您在代理、外掛程式及產品上的各項體驗。我們不會向您顯示廣告，也不會讓廣告客戶影響 "
                : "从设置与市场中自定义您在智能体、插件及产品上的各项体验。我们不会向您展示广告，也不会让广告主影响 ";
        }
        if (valNorm === 'says.' && (pText.includes('autonomous') || pText.includes('自主程度') || pText.includes('influence what') || pText.includes('广告主影响') || pText.includes('廣告客戶影響'))) {
            return (pText.includes('influence what') || pText.includes('广告主影响') || pText.includes('廣告客戶影響'))
                ? (USE_TW ? " 所說的內容。" : " 所说的内容。")
                : " 的提示音。";
        }
        if (valNorm === "'s agents are powerful. They can edit files, run commands, and browse the web.") {
            return USE_TW ? " 的代理功能強大，可以編輯檔案、執行指令以及瀏覽網頁。" : " 的智能体功能强大，可以编辑文件、运行命令以及浏览网页。";
        }
        if (valNorm === "'s agents are powerful and will help you get a lot done better and faster than before, but still make sure to verify the actions taken by the agent.") {
            return USE_TW
                ? " 的代理功能強大，能協助您比以往更好、更快地完成更多工作，但仍請務必驗證代理執行的操作。"
                : " 的智能体功能强大，可帮助您比以往更好、更快地完成更多工作，但仍请务必核验智能体执行的操作。";
        }
        if (valNorm === '(excluding product analytics data)' && (pText.includes('Privacy Notice') || pText.includes('隐私声明') || pText.includes('隱私聲明') || pText.includes('隱私權聲明'))) {
            return USE_TW ? "（不含產品分析資料）" : "（不含产品分析数据）";
        }
        if (valNorm === 'Terms of Service' && pText.startsWith('Google ')) {
            return USE_TW ? " 服務條款" : " 服务条款";
        }
        if (valNorm === 'Sign up for newsletters, informational emails, and special offers about') {
            return USE_TW ? "訂閱有關 " : "订阅有关 ";
        }
        if (valNorm === '.' && (pText.includes('Sign up for newsletters') || pText.includes('订阅有关') || pText.includes('訂閱有關') || pText.includes('订阅关于') || pText.includes('訂閱關於'))) {
            return (pText.includes('以下内容') || pText.includes('以下內容'))
                ? "。"
                : (USE_TW ? " 的電子報、資訊郵件與特別優惠。" : " 的新闻通讯、资讯邮件和特别优惠。");
        }
        if ((valNorm === 'For' || valNorm === ',') && (pText.includes('does not collect and use your Interactions data') || pText.includes('does not collect any of your prompts') || pText.includes('不会收集您的任何提示') || pText.includes('不會收集您的任何提示'))) {
            if (valNorm === 'For') return USE_TW ? "針對 " : "对于 ";
            if (valNorm === ',') return "，";
        }
        if (valNorm === 'does not collect and use your Interactions data for model training, and retains it only to provide the service.') {
            return USE_TW ? " 不會收集或使用您的互動資料進行模型訓練，僅為提供服務而保留該資料。" : " 不会收集或使用您的交互数据进行模型训练，仅为提供服务而保留该数据。";
        }
        if (valNorm.startsWith('does not collect any of your prompts, content, or model responses') && valNorm.includes('general usage patterns such as feature adoption')) {
            return USE_TW
                ? " 不會收集您的任何提示詞、內容或模型回覆，但會收集功能採用率與活躍使用者人數等一般使用模式（「產品分析」）。遙測資料將依據 Google 隱私權政策處理。"
                : " 不会收集您的任何提示词、内容或模型回复，但会收集功能采用率与活跃用户数等常规使用模式（“产品分析”）。遥测数据将按照 Google 隐私政策处理。";
        }
        if ((typeof p.closest === 'function' && p.closest('[data-testid="post-onboarding-welcome-tip"]')) || (p.getAttribute && p.getAttribute('data-testid') === 'post-onboarding-welcome-tip') || pText.includes('to switch to the Gemini app')) {
            if (valNorm === 'Press') return " 按 ";
            if (valNorm === 'to switch to the Gemini app. Your agents keep working in the background.') {
                return USE_TW
                    ? " 即可切換至 Gemini 應用程式。您的代理會在背景繼續執行。"
                    : " 即可切换至 Gemini 应用。您的智能体会在后台继续运行。";
            }
        }
        if (valNorm === 'To switch accounts, sign out in the') {
            return USE_TW ? "如需切換帳戶，請在" : "如需切换账户，请在";
        }
        if ((valNorm === 'settings page' || valNorm === 'settings page.') && (pText.includes('switch accounts') || pText.includes('切换账户') || pText.includes('切換帳戶'))) {
            return USE_TW ? (valNorm.endsWith('.') ? "設定頁面。" : "設定頁面") : (valNorm.endsWith('.') ? "设置页面。" : "设置页面");
        }
        if (valNorm === 'and sign in again.' && (pText.includes('switch accounts') || pText.includes('切换账户') || pText.includes('切換帳戶'))) {
            return USE_TW ? "中登出並重新登入。" : "中退出登录并重新登录。";
        }
        if (valNorm === 'There are currently no Build with') {
            return USE_TW ? "目前沒有可用的 Build with " : "当前没有可用的 Build with ";
        }
        if (valNorm === 'plugins available.' && (pText.includes('Build with') || pText.includes('目前沒有可用的') || pText.includes('当前没有可用的'))) {
            return USE_TW ? " 外掛程式。" : " 插件。";
        }
        if (valNorm === 'FAQ' && p.tagName === 'A' && p.parentElement && (p.parentElement.textContent || '').match(/visiting our|造訪我們的|访问我们的/)) {
            return USE_TW ? "常見問題" : "常见问题";
        }
        if ((valNorm === 'Available for' || valNorm === 'project') && (pText.includes('Available for ') || pText.includes('適用於 ') || pText.includes('适用于 '))) {
            return valNorm === 'Available for' ? (USE_TW ? "適用於 " : "适用于 ") : (USE_TW ? " 專案" : " 项目");
        }
        if ((valNorm === 'Inspect live bindings or record custom key chords filtered to' || valNorm === 'commands.') && pText.includes('antigravity.')) {
            // 前後各有 React 的 " " 空白節點夾著 <code>antigravity.</code>，譯文本身不再加空格
            return valNorm === 'commands.'
                ? (USE_TW ? "指令。" : "命令。")
                : (USE_TW ? "檢視目前生效的按鍵繫結，或錄製自訂按鍵組合，僅限" : "查看当前生效的按键绑定，或录制自定义组合键，仅限");
        }
        if ((valNorm === 'No hosts in' || valNorm === 'yet. Type one above.') && (pText.includes('Type one above') || pText.includes('可在上方輸入') || pText.includes('可在上方输入'))) {
            return valNorm === 'No hosts in'
                ? (USE_TW ? "在 " : "在 ")
                : (USE_TW ? " 中尚無主機設定，請在上方直接輸入。" : " 中尚无主机配置，可在上方直接输入。");
        }
        if (valNorm === 'No MCP servers found for "' && pText.includes('No MCP servers found for "')) {
            return USE_TW ? "找不到符合「" : "未找到匹配“";
        }
        if (valNorm === '"' && (pText.includes('找不到符合「') || pText.includes('未找到匹配“'))) {
            return USE_TW ? "」的 MCP 伺服器" : "”的 MCP 服务器";
        }
        if (valNorm === 'If that machine is a cloudtop, reach it via' && pText.includes('If that machine is a cloudtop')) {
            return USE_TW ? "若該電腦為 Cloudtop，請透過以下方式連線：" : "如果该机器是 Cloudtop，请通过以下方式连接：";
        }
        if (valNorm === 'Generation Steps (' && pText.includes('Generation Steps (')) {
            return USE_TW ? "產生步驟 (" : "生成步骤 (";
        }
        if (valNorm === 'Show more (' && pText.includes('Show more (')) {
            return USE_TW ? "顯示更多 (" : "显示更多 (";
        }
        if (valNorm === 'Show submitted (' && pText.includes('Show submitted (')) {
            return USE_TW ? "顯示已提交 (" : "显示已提交 (";
        }
        if (valNorm === 'Start Best-of-' && pText.includes('Start Best-of-')) {
            return USE_TW ? "開始 Best-of-" : "开始 Best-of-";
        }
        if ((valNorm === 'In this case,' || valNorm === 'chunks were collapsed into one. Chunks included in this read:') && pText.includes('chunks were collapsed into one')) {
            return valNorm === 'In this case,'
                ? (USE_TW ? "在此情況下，已將 " : "在此情况下，已将 ")
                : (USE_TW ? " 個區塊合併為單一區塊。此次讀取包含的區塊：" : " 个区块合并为单个区块。此次读取包含的区块：");
        }
        if (valNorm === 'Not referenced by any feature (' && pText.includes('Not referenced by any feature')) {
            return USE_TW ? "尚無任何功能參照 (" : "未被任何功能引用 (";
        }
        if (valNorm === 'Messages now send immediately. Configure in') {
            return USE_TW ? '訊息現已改為立即傳送。可在' : '消息现已改为立即发送。可在';
        }
        // 「Configure in <settings>.」的句點與連結同在 whitespace-nowrap 的 span 內
        const msgHead = p.parentElement && p.parentElement.firstChild;
        if (valNorm === '.' && msgHead && msgHead.nodeType === Node.TEXT_NODE && /^(?:Messages now send immediately|訊息現已改為立即傳送|消息现已改为立即发送)/.test((msgHead.nodeValue || '').trim())) {
            return USE_TW ? '中調整。' : '中调整。';
        }
        if (valNorm === 'In System Settings, click') {
            return USE_TW ? '在「系統設定」中，按一下 ' : '在“系统设置”中，点击 ';
        }
        if (valNorm === 'In System Settings, turn on') {
            return USE_TW ? '在「系統設定」中，開啟 ' : '在“系统设置”中，开启 ';
        }
        if (valNorm === 'Already on? Select') {
            return USE_TW ? '已經開啟？請選取 ' : '已经开启？请选择 ';
        }
        // macOS 權限引導句（電腦操作權限狀態列）：React Fragment 把句子拆成文字節點與 <strong>App</strong>／<strong>+</strong>
        if (typeof p.getAttribute === 'function' && p.getAttribute('role') === 'status' && /System Settings|系統設定|系统设置/.test(pText)) {
            const guide = {
                ". If it isn't in the list, drag it in from the small window next to System Settings.": ['。如果列表中没有，请从“系统设置”旁的小窗口将它拖入。', '。如果清單中沒有，請從「系統設定」旁的小視窗將它拖曳進來。'],
                ', choose': ['，选择', '，選取'],
                ', then turn it on.': ['，然后将其开启。', '，然後將它開啟。'],
                ', click': ['，点击 ', '，按一下 '],
                ', then': ['，然后', '，然後'],
                'drag it back in from the small window.': ['从小窗口将它重新拖入。', '從小視窗將它重新拖曳進來。'],
                'click': ['点击 ', '按一下 '],
                'and add it again.': [' 重新添加。', ' 重新加入。']
            };
            if (Object.prototype.hasOwnProperty.call(guide, valNorm)) return guide[valNorm][USE_TW ? 1 : 0];
        }
        // 自動化排程摘要：<b>Weekly</b> on <b>Monday</b> around <b>9:00 AM</b>
        if ((valNorm === 'around' || valNorm === 'on') && typeof p.querySelector === 'function' && p.querySelector('.font-semibold') &&
            /^(?:Daily|Weekdays|Weekly|每天|平日|工作日|每週|每周)/.test(pText.trim())) {
            return valNorm === 'around' ? (USE_TW ? '約' : '约') : '';
        }
        // 宣告權限說明句結尾：「…which you can change anytime in the <project> settings page.」
        if (valNorm === 'settings page.' && /its own permissions|獨立權限|独立权限/.test(pText)) {
            return USE_TW ? '設定頁面中變更。' : '设置页面中更改。';
        }
        // 外掛程式詳細頁找不到項目：「No plugin found for <code>id</code>.」（前半句由字典翻譯）
        if (valNorm === '.' && typeof p.querySelector === 'function' && p.querySelector('.font-mono') &&
            /^(?:No (?:app|plugin|bundle) found for|找不到(?:應用程式|外掛程式)|未找到(?:应用|插件))/.test(pText.trim())) {
            return '。';
        }
        // 執行中項目批次選取列：「3 selected」
        if (valNorm === 'selected' && typeof p.closest === 'function' && p.closest('[data-testid="running-selection-bar"]')) {
            return USE_TW ? ' 項已選取' : ' 项已选中';
        }
        if (valNorm === 'Only for' && (pText.includes('overrides Global') || pText.includes('覆盖全局') || pText.includes('覆寫全域'))) {
            return USE_TW ? "僅針對 " : "仅针对 ";
        }
        if ((valNorm === 'Allow' || valNorm === 'to access your microphone in' || valNorm === 'to use Voice.') && (pText.includes('to use Voice') || pText.includes('访问您的麦克风') || pText.includes('存取您的麥克風'))) {
            if (valNorm === 'Allow') return USE_TW ? "請允許 " : "请允许 ";
            if (valNorm === 'to access your microphone in') return USE_TW ? " 在 " : " 在 ";
            if (valNorm === 'to use Voice.') return USE_TW ? " 中存取您的麥克風以使用語音功能。" : " 中访问您的麦克风以使用语音功能。";
        }
        if (p.id === 'replay-label' || (typeof p.closest === 'function' && p.closest('#replay-label'))) {
            const ofMatch = valNorm.match(/^of\s+(\d+)(?:\s*·\s*#(\d+)\s+at\s+(.+?)\s*\(\+([^)]+)\))?$/i);
            if (ofMatch) {
                return " / " + ofMatch[1] + (ofMatch[2]
                    ? (" · #" + ofMatch[2] + (USE_TW ? " 於 " : " 于 ") + ofMatch[3] + " (+" + formatCompactDuration(ofMatch[4]) + ")")
                    : "");
            }
            const overMatch = valNorm.match(/^over\s+(.+)$/i);
            if (overMatch) {
                return (USE_TW ? " · 歷時 " : " · 历时 ") + formatCompactDuration(overMatch[1]);
            }
        }
        if (p.tagName === 'OPTION' && p.parentElement) {
            if (p.parentElement.id === 'f-agent' && /^From\s+(.+)$/i.test(valNorm)) {
                return valNorm.replace(/^From\s+(.+)$/i, (_, who) => (USE_TW ? "來自 " : "来自 ") + who);
            }
            if (p.parentElement.id === 'f-mention' && /^To\s+(.+)$/i.test(valNorm)) {
                return valNorm.replace(/^To\s+(.+)$/i, (_, who) => (USE_TW ? "傳給 " : "发给 ") + who);
            }
        }
        if (p.classList && p.classList.contains('chip-name') && /\s+\(you\)$/i.test(valNorm)) {
            return valNorm.replace(/\s+\(you\)$/i, "（你）");
        }
        if (p.classList && p.classList.contains('size') && /\d+\s+lines?$/i.test(valNorm)) {
            return valNorm.replace(/(\d+)\s+lines?$/i, "$1 行");
        }
        if (p.id === 'empty-body') {
            if (valNorm === 'Swarms started in this conversation appear here automatically, with their board, members and @mention graph. Start one with') {
                return USE_TW
                    ? "在此對話中啟動的 Swarm 會自動顯示於此，包含看板、成員清單與 @提及關係圖。輸入 "
                    : "在此会话中启动的 Swarm 会自动显示在这里，包含看板、成员列表和 @提及关系图。输入 ";
            }
            if (valNorm === 'Open this pane from a conversation to see its swarm. Swarms started there appear here automatically; start one with') {
                return USE_TW
                    ? "請從對話中開啟此面板以檢視其 Swarm。在對話中啟動的 Swarm 會自動顯示於此；輸入 "
                    : "请从会话中打开此面板以查看其 Swarm。在会话中启动的 Swarm 会自动显示在这里；输入 ";
            }
            if (valNorm === '.') {
                return USE_TW ? " 即可啟動。" : " 即可启动。";
            }
        }
        if (p.id === 'ov-notice' || (typeof p.closest === 'function' && p.closest('#ov-notice'))) {
            if (valNorm === 'The narrator (') return USE_TW ? "解說員 (" : "解说员 (";
            if (valNorm === ') was stopped. Ask the coordinator to add a new one (') {
                return USE_TW ? ") 已停止。可請協調器新增一個 (" : ") 已停止。可让协调器新增一个 (";
            }
            if (valNorm === ').') return ")。";
        }
        if (p.id === 'ov-ack' || (typeof p.closest === 'function' && p.closest('#ov-ack'))) {
            if (/^Last change:\s*[“"]$/i.test(valNorm)) return USE_TW ? "上次變更：「" : "上次变更：“";
            if (/^[”"]$/.test(valNorm)) return USE_TW ? "」" : "”";
        }
        if ((p.classList && p.classList.contains('o2-progt')) || (typeof p.closest === 'function' && p.closest('.o2-progt'))) {
            const progMatch = valNorm.match(/^(\d+)\s+of\s+(\d+)$/i);
            if (progMatch) return progMatch[1] + " / " + progMatch[2];
            if (/^tasks?\s+done$/i.test(valNorm)) {
                return (originalVal.startsWith(' ') ? ' ' : '') + (USE_TW ? "項任務已完成" : "项任务已完成");
            }
        }
        if (valNorm === 'Missing' && p.getAttribute && /^computer-permissions-badge-/.test(p.getAttribute('data-testid') || '')) {
            return USE_TW ? '未授權' : '未授权';
        }
        if (pText.includes('macOS Privacy & Security') || pText.includes('隐私与安全性') || pText.includes('隱私權與安全性')) {
            if (valNorm === 'Click') return USE_TW ? '按一下 ' : '点击 ';
            if (valNorm === 'to open macOS Privacy & Security.') return USE_TW ? ' 以開啟 macOS「隱私權與安全性」。' : ' 以打开 macOS“隐私与安全性”。';
        }
        if (pText.includes('Type one above') || pText.includes('请在上方直接输入') || pText.includes('請在上方直接輸入')) {
            if (valNorm === 'No hosts in') return '在 ';
            if (valNorm === 'yet. Type one above.') return USE_TW ? ' 中尚無主機，請在上方直接輸入。' : ' 中暂未配置主机，请在上方直接输入。';
        }
        if (valNorm === "Couldn't connect to" && typeof p.closest === 'function' && p.closest('[data-testid="ssh-connect-error"]')) {
            return USE_TW ? '無法連線至 ' : '无法连接到 ';
        }
        if ((typeof p.getAttribute === 'function' && p.getAttribute('data-testid') === 'browser-site-data-delete-error') || (typeof p.closest === 'function' && p.closest('[data-testid="browser-site-data-delete-error"]'))) {
            if (valNorm === "Couldn't delete cookies for") return USE_TW ? '無法刪除 ' : '无法删除 ';
            if (valNorm === '. Try again.') return USE_TW ? ' 的 Cookie，請再試一次。' : ' 的 Cookie，请重试。';
        }
        if (typeof p.getAttribute === 'function' && p.getAttribute('data-testid') === 'browser-site-data-no-match') {
            if (valNorm === 'No sites match "' || originalVal.startsWith('No sites match')) return USE_TW ? '找不到符合「' : '未找到匹配“';
            if (valNorm === '".' || originalVal === '\u201d.') return USE_TW ? '」的網站。' : '”的站点。';
        }
        if (valNorm === 'Layout' && p.parentElement && p.parentElement.hasAttribute && p.parentElement.hasAttribute('data-agy-layout-bar')) {
            return USE_TW ? '版面配置' : '布局';
        }
        if ((p.hasAttribute && p.hasAttribute('data-agy-layout-option')) || (typeof p.closest === 'function' && p.closest('[data-agy-layout]'))) {
            if (valNorm === 'Stage') return '舞台';
            if (valNorm === 'Desktop') return '桌面';
            if (valNorm === 'Grid') return USE_TW ? '網格' : '网格';
        }
        if ((valNorm === 'thread' || valNorm === 'threads') && typeof p.closest === 'function' && p.closest('.hv-sum')) {
            return USE_TW ? ' 個討論串' : ' 条工作线';
        }
        return null;
    }

    function replaceWithBoundary(text, key, replacement) {
        const needStartBoundary = /[A-Za-z0-9_]/.test(key[0]);
        const needEndBoundary = /[A-Za-z0-9_]/.test(key[key.length - 1]);
        let pos = 0;
        let out = '';
        let replaced = false;
        while (pos <= text.length - key.length) {
            const idx = text.indexOf(key, pos);
            if (idx === -1) break;
            const prevCh = idx > 0 ? text[idx - 1] : '';
            const nextCh = idx + key.length < text.length ? text[idx + key.length] : '';
            const startOk = !needStartBoundary || !/[A-Za-z0-9_]/.test(prevCh);
            const endOk = !needEndBoundary || !/[A-Za-z0-9_]/.test(nextCh);
            if (startOk && endOk) {
                out += text.slice(pos, idx) + replacement;
                pos = idx + key.length;
                replaced = true;
            } else {
                out += text.slice(pos, idx + 1);
                pos = idx + 1;
            }
        }
        return replaced ? out + text.slice(pos) : null;
    }

    // React 會把相鄰字串之間的 " " 拆成獨立文字節點；兩側譯成中文後收掉這個空白（中文字之間不留空格）。
    // 收合可逆：React 之後重用兩側節點換成英文時還原空白。判斷只讀目前的 DOM、不在判斷時翻譯鄰近節點
    // （否則巢狀結構每一層都會把子樹多走一遍）；鄰近節點翻完後，由父元素走訪結束或 refreshGapsAround 重新判斷。
    const CJK_TAIL = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]$/;
    const CJK_HEAD = /^[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
    const collapsedGaps = new WeakMap();
    function gapNeighborText(n) {
        if (!n) return null;
        if (n.nodeType === Node.TEXT_NODE) return n.nodeValue || '';
        // 只看行內小元素（<strong>、連結按鈕），避免對大型容器計算 textContent
        if (n.nodeType === Node.ELEMENT_NODE && n.childElementCount <= 2) return n.textContent || '';
        return null;
    }
    function isGapFiller(n) {
        return n && (n.nodeType === Node.COMMENT_NODE || (n.nodeType === Node.TEXT_NODE && !n.nodeValue));
    }
    function isCjkGap(n) {
        return !!n && n.nodeType === Node.TEXT_NODE && (n.nodeValue === ' ' || (n.nodeValue === '' && collapsedGaps.has(n)));
    }
    function cjkGapShouldCollapse(gap) {
        let prev = gap.previousSibling;
        let skippedText = false;
        while (isGapFiller(prev)) {
            if (prev.nodeType === Node.TEXT_NODE) skippedText = true;
            prev = prev.previousSibling;
        }
        const before = gapNeighborText(prev);
        if (!before || !CJK_TAIL.test(before)) return false;
        let next = gap.nextSibling;
        while (next && next.nodeType === Node.COMMENT_NODE) next = next.nextSibling;
        const after = gapNeighborText(next);
        if (!after) return false;
        // 兩側都是元素（例如並排的兩個連結或按鈕）時，這個空白是分隔用的，保留
        if (!skippedText && prev.nodeType !== Node.TEXT_NODE && next.nodeType !== Node.TEXT_NODE) return false;
        return CJK_HEAD.test(after);
    }
    function refreshCjkGap(gap) {
        if (cjkGapShouldCollapse(gap)) {
            if (gap.nodeValue) {
                collapsedGaps.set(gap, gap.nodeValue);
                translatedValues.set(gap, '');
                gap.nodeValue = '';
            }
        } else if (!gap.nodeValue && collapsedGaps.has(gap)) {
            const original = collapsedGaps.get(gap);
            collapsedGaps.delete(gap);
            translatedValues.delete(gap);
            gap.nodeValue = original;
        }
    }
    // 節點新增或文字變動後，重新判斷它兩側的空白；所在元素是行內小元素時，連同元素兩側一起判斷（最多三層）
    function refreshGapsAround(node) {
        let n = node;
        for (let depth = 0; n && depth < 3; depth++) {
            for (const dir of ['previousSibling', 'nextSibling']) {
                let s = n[dir];
                while (s && s.nodeType === Node.COMMENT_NODE) s = s[dir];
                if (isCjkGap(s) && !isCodeOrEditor(s)) refreshCjkGap(s);
            }
            const parent = n.parentElement;
            if (!parent || parent.childElementCount > 2) break;
            n = parent;
        }
    }

    function translateNode(node) {
        try {
            if (!node) return;

            if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                if (node.host && isCodeOrEditor(node.host)) return;
                for (const child of node.childNodes) translateNode(child);
                return;
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName.toUpperCase();
                if (SKIP_TAGS.includes(tag)) return;
                // 翻译属性：placeholder, title, aria-label, aria-description (即使输入框获焦时也应正常汉化 placeholder 提示)
                const inSwarmEl = isSwarmUiContext(node);
                for (const attr of ['placeholder', 'title', 'aria-label', 'aria-description']) {
                    const v = node.getAttribute(attr);
                    if (v) {
                        const t = norm(v);
                        if (/^\/[a-zA-Z0-9_.:-]+$/.test(t)) continue;
                        // Attribute values can be a command's accessible name even when
                        // its visible text node is protected separately. Never translate
                        // a command token or a Thinking Effort option in that context.
                        if (isSlashCommandNameNode(node, t) || isModelEffortLabelProtected(node, t)) continue;
                        let newAttr = translatePermissionChoice(v);
                        if (!newAttr && inSwarmEl && Object.prototype.hasOwnProperty.call(SCOPED_SWARM_MAP, t)) {
                            newAttr = SCOPED_SWARM_MAP[t][USE_TW ? 1 : 0];
                        }
                        if (!newAttr && attr === 'aria-label') {
                            if (node.getAttribute('role') === 'radiogroup') {
                                if (t === 'Icon') newAttr = USE_TW ? '圖示' : '图标';
                                else if (t === 'Color') newAttr = USE_TW ? '顏色' : '颜色';
                            } else if (node.hasAttribute('data-agy-layout') && t === 'Layout') {
                                newAttr = USE_TW ? '版面配置' : '布局';
                            }
                        }
                        if (!newAttr && attr === 'title' && t === 'Swarm' && node.classList && node.classList.contains('agy-aux-tab-title')) {
                            newAttr = '蜂群';
                        }
                        if (!newAttr) {
                            if (isFilePathOrUri(t)) continue;
                            newAttr = translateExactOrDynamic(t) || translateAttrDynamic(t);
                        }
                        if (!newAttr && inSwarmEl) {
                            newAttr = translateSwarmComposite(v);
                        }
                        if (newAttr && newAttr !== v) {
                            node.setAttribute(attr, newAttr);
                            if (attr === 'placeholder' && 'placeholder' in node) {
                                node.placeholder = newAttr;
                            }
                        }
                    }
                }

                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                if (tag === 'OPTION' && !node.hasAttribute('value')) return;
                if (isCodeOrEditor(node) || node.isContentEditable) return;
                if (node.classList && (node.classList.contains('monaco-editor') || node.classList.contains('terminal') || node.classList.contains('xterm'))) return;

                // 处理 FastPick / 列表底部的 "Show <N> more..." 复合节点
                const elText = node.textContent ? node.textContent.trim() : '';
                // 省略號跟著原文：「Show 3 more」不補「...」，「Show 3 more…」保留原本的省略號字元
                if (/^Show\s+\d+\s+more(?:\.\.\.|…)?$/i.test(elText)) {
                    const textChildren = Array.from(node.childNodes).filter(c => c.nodeType === Node.TEXT_NODE);
                    if (textChildren.length >= 2) {
                        for (const tc of textChildren) {
                            const v = tc.nodeValue;
                            const moreTail = v.trim().match(/^more(\.\.\.|…)?$/i);
                            if (v === 'Show ' || norm(v) === 'Show') {
                                tc.nodeValue = USE_TW ? '顯示另外 ' : '显示另外 ';
                                translatedValues.set(tc, tc.nodeValue);
                            } else if (moreTail) {
                                tc.nodeValue = (USE_TW ? ' 個' : ' 个') + (moreTail[1] || '');
                                translatedValues.set(tc, tc.nodeValue);
                            }
                        }
                    } else if (textChildren.length === 1 && node.childNodes.length === 1) {
                        const m = elText.match(/^Show\s+(\d+)\s+more(\.\.\.|…)?$/i);
                        if (m) {
                            textChildren[0].nodeValue = (USE_TW ? ('顯示另外 ' + m[1] + ' 個') : ('显示另外 ' + m[1] + ' 个')) + (m[2] || '');
                            translatedValues.set(textChildren[0], textChildren[0].nodeValue);
                        }
                    }
                }

                // 处理语音助手选择器底部 "Use <VoiceName>" 复合按钮
                if (node.getAttribute && node.getAttribute('data-testid') === 'voice-picker-use') {
                    const textChildren = Array.from(node.childNodes).filter(c => c.nodeType === Node.TEXT_NODE);
                    for (const tc of textChildren) {
                        const v = tc.nodeValue;
                        if (v === 'Use ' || norm(v) === 'Use') {
                            tc.nodeValue = '使用 ';
                            translatedValues.set(tc, tc.nodeValue);
                        }
                    }
                }

                // 处理 v2.31.0 Coordinator 逐词流式欢迎语段落
                if (node.getAttribute && node.getAttribute('data-testid') === 'coordinator-welcome') {
                    const paragraphs = node.querySelectorAll ? node.querySelectorAll('p') : [];
                    for (const p of paragraphs) {
                        const pNorm = norm(p.textContent || '');
                        const m = pNorm.match(/^Welcome to\s+(.+?)\.\s*I coordinate the work for this project\./i);
                        if (m) {
                            const projName = m[1].trim();
                            const strongEl = p.querySelector && p.querySelector('strong');
                            const nameClone = strongEl ? strongEl.cloneNode(true) : null;
                            p.textContent = '';
                            p.appendChild(document.createTextNode(USE_TW ? '歡迎使用 ' : '欢迎使用 '));
                            if (nameClone) {
                                p.appendChild(nameClone);
                            } else if (projName) {
                                p.appendChild(document.createTextNode(projName));
                            }
                            p.appendChild(document.createTextNode(USE_TW
                                ? '。我負責協調此專案的工作。您可以向我提問或交辦任務，我會直接回覆或啟動平行工作代理。'
                                : '。我负责协调此项目的工作。您可以向我提问或交办任务，我会直接回答或启动并行工作代理。'));
                            p.setAttribute('translate', 'no');
                        } else if (/^(?:You|您)\s+can follow the workers in the Dashboard/i.test(pNorm)) {
                            p.textContent = USE_TW
                                ? '您可以在儀表板中追蹤工作代理的進度，當任務完成或需要您處理時，我會發布更新。'
                                : '您可以在仪表盘中跟进工作代理的进度，当任务完成或需要您处理时，我会发布更新。';
                            p.setAttribute('translate', 'no');
                        }
                    }
                    return;
                }

                // 处理新手引导 "Get Anything Done with <AppName>" 拆分文本节点
                if (/^Get Anything Done with\s+(.+)$/i.test(elText)) {
                    const textChildren = Array.from(node.childNodes).filter(c => c.nodeType === Node.TEXT_NODE);
                    if (textChildren.length >= 2 && norm(textChildren[0].nodeValue) === 'Get Anything Done with') {
                        textChildren[0].nodeValue = USE_TW ? '使用 ' : '用 ';
                        translatedValues.set(textChildren[0], textChildren[0].nodeValue);
                        const suffixNode = document.createTextNode(' 搞定一切');
                        translatedValues.set(suffixNode, suffixNode.nodeValue);
                        node.appendChild(suffixNode);
                    }
                }

                // 處理 "Available for <projectId> project" 拆分文本節點
                if (/^Available for\s+.+?\s+project$/i.test(elText)) {
                    const textChildren = Array.from(node.childNodes).filter(c => c.nodeType === Node.TEXT_NODE);
                    for (const tc of textChildren) {
                        const n = norm(tc.nodeValue);
                        if (n === 'Available for') {
                            tc.nodeValue = USE_TW ? '適用於 ' : '适用于 ';
                            translatedValues.set(tc, tc.nodeValue);
                        } else if (n === 'project') {
                            tc.nodeValue = USE_TW ? ' 專案' : ' 项目';
                            translatedValues.set(tc, tc.nodeValue);
                        }
                    }
                }

                if (node.shadowRoot) {
                    observeRoot(node.shadowRoot);
                    translateNode(node.shadowRoot);
                }
                for (const child of node.childNodes) translateNode(child);
                // 子節點都翻完後再判斷其間的空白：走訪到空白時，它後面的節點還沒翻譯
                for (const child of node.childNodes) {
                    if (isCjkGap(child)) refreshCjkGap(child);
                }

            } else if (node.nodeType === Node.TEXT_NODE) {
                if (isCodeOrEditor(node)) return;

                let originalVal = node.nodeValue;
                if (originalVal === ' ') {
                    refreshCjkGap(node);
                    return;
                }
                if (!originalVal || originalVal.trim().length < 1) return;

                if (translatedValues.get(node) !== originalVal) {
                    const permChoiceTrans = translatePermissionChoice(originalVal);
                    if (permChoiceTrans && permChoiceTrans !== originalVal) {
                        translatedValues.set(node, permChoiceTrans);
                        node.nodeValue = permChoiceTrans;
                        return;
                    }
                }

                // 处理 FastPick / 列表底部由于 React 节点拆分导致的 "Show ", num, " more..." 分段文本
                const parentText = node.parentElement && node.parentElement.textContent ? node.parentElement.textContent.trim() : '';
                if (isFilePathOrUri(originalVal.trim()) || isFilePathOrUri(parentText)) return;
                if (parentText && (
                    /^(?:Show|显示另外|顯示另外)\s+\d+\s+(?:more|个|個)(?:\.\.\.|…)?$/i.test(parentText) ||
                    (node.parentElement.getAttribute && node.parentElement.getAttribute('value')?.startsWith('fastpick-show-more:'))
                )) {
                    if (originalVal === 'Show ' || norm(originalVal) === 'Show') {
                        node.nodeValue = USE_TW ? '顯示另外 ' : '显示另外 ';
                        translatedValues.set(node, node.nodeValue);
                        return;
                    }
                    const moreTail = originalVal.trim().match(/^more(\.\.\.|…)?$/i);
                    if (moreTail) {
                        node.nodeValue = (USE_TW ? ' 個' : ' 个') + (moreTail[1] || '');
                        translatedValues.set(node, node.nodeValue);
                        return;
                    }
                }

                // 核心：如果是 skeleton 骨架占位文本，强制打上不翻译标记
                if (originalVal.toLowerCase().includes('pack.info')) {
                    const parent = node.parentElement;
                    if (parent) {
                        if (parent.getAttribute('translate') !== 'no') parent.setAttribute('translate', 'no');
                        try { if (!parent.classList.contains('notranslate')) parent.classList.add('notranslate'); } catch (e) {}
                    }
                    return;
                }

                const valNorm = norm(originalVal);
                const cachedValue = translatedValues.get(node);
                if ((valNorm === 'New' || (cachedValue === originalVal && valNorm === map.get('New'))) && isModelMenuText(node)) {
                    if (originalVal !== '新') {
                        translatedValues.set(node, '新');
                        node.nodeValue = '新';
                    }
                    return;
                }
                if ((valNorm === 'New' || (cachedValue === originalVal && valNorm === map.get('New'))) && node.parentElement?.getAttribute?.('data-testid') === 'swarm-unread-divider') {
                    const unreadLabel = USE_TW ? '新訊息' : '新消息';
                    if (originalVal !== unreadLabel) {
                        translatedValues.set(node, unreadLabel);
                        node.nodeValue = unreadLabel;
                    }
                    return;
                }
                if (cachedValue === originalVal || unchangedTextValues.get(node) === originalVal) return;

                // Slash 指令標記（例如 /goal, /swarm, /boost 等，含選單／補全清單內無前綴指令名稱）與模型 Thinking Effort 等級保留英文不翻
                if (isSlashCommandNameNode(node, valNorm) || isModelEffortLabelProtected(node, valNorm)) {
                    unchangedTextValues.set(node, originalVal);
                    return;
                }

                // 字型圖示（ligature）文字：Antigravity 2.35.1 未載入 Google Symbols 字型，
                // 內建 SVG 表缺少的圖示會以圖示名稱純文字顯示。已知缺口改畫 SVG，
                // 其餘圖示名稱一律不翻譯，避免 "comment" 之類被字典譯成中文（保留 React TextNode 避免遍歷失同步）
                const iconHost = node.parentElement && typeof node.parentElement.matches === 'function' && node.parentElement.matches(ICON_FONT_SELECTOR)
                    ? node.parentElement
                    : null;
                if (iconHost) {
                    const oldSvg = Array.from(iconHost.children || []).find(c => c.hasAttribute && c.hasAttribute('data-ag-icon-fallback'));
                    if (oldSvg && oldSvg.getAttribute('data-ag-icon-fallback') !== valNorm) oldSvg.remove();
                    const paths = Object.prototype.hasOwnProperty.call(ICON_FONT_FALLBACK_PATHS, valNorm) ? ICON_FONT_FALLBACK_PATHS[valNorm] : null;
                    if (!paths || typeof document === 'undefined' || typeof document.createElementNS !== 'function') {
                        unchangedTextValues.set(node, originalVal);
                        return;
                    }
                    if (!oldSvg || oldSvg.getAttribute('data-ag-icon-fallback') !== valNorm) {
                        const svgNs = 'http://www.w3.org/2000/svg';
                        const svg = document.createElementNS(svgNs, 'svg');
                        svg.setAttribute('data-ag-icon-fallback', valNorm);
                        // 1em 跟隨圖示宿主的字級（px、rem 或繼承值都適用），與字型圖示原本的大小一致
                        svg.setAttribute('width', '1em');
                        svg.setAttribute('height', '1em');
                        svg.setAttribute('viewBox', '0 0 24 24');
                        svg.setAttribute('fill', 'none');
                        svg.setAttribute('stroke', 'currentColor');
                        svg.setAttribute('stroke-width', '2');
                        svg.setAttribute('stroke-linecap', 'round');
                        svg.setAttribute('stroke-linejoin', 'round');
                        svg.setAttribute('class', 'shrink-0');
                        svg.setAttribute('style', 'display:inline-block;vertical-align:middle');
                        for (const d of paths) {
                            const pSvg = document.createElementNS(svgNs, 'path');
                            pSvg.setAttribute('d', d);
                            svg.appendChild(pSvg);
                        }
                        iconHost.insertBefore(svg, node);
                    }
                    // 同一文字節點之後換回不需 SVG 的圖示名稱時，不能被「未翻譯」快取提早擋下而留著舊 SVG
                    unchangedTextValues.delete(node);
                    translatedValues.set(node, '');
                    node.nodeValue = '';
                    return;
                }

                // 輸入框底部權限預設膠囊鈕為 shrink-0 + whitespace-nowrap，雙語括號譯名會擠壓同列的模型選擇鈕，改用短標籤
                if (Object.prototype.hasOwnProperty.call(PERMISSION_PILL_LABELS, valNorm) && node.parentElement?.closest?.('[data-testid="permissions-selector-trigger"]')) {
                    const pillLabel = PERMISSION_PILL_LABELS[valNorm][USE_TW ? 1 : 0];
                    translatedValues.set(node, pillLabel);
                    node.nodeValue = pillLabel;
                    return;
                }

                // 側邊分頁的蜂群分頁標題固定為 "Swarm"；字典刻意不收這個字（避免 /swarm 指令被翻），這裡單獨處理以和關閉鈕「關閉蜂群」一致
                if (valNorm === 'Swarm' && node.parentElement?.closest?.('.agy-aux-tab-title')) {
                    translatedValues.set(node, '蜂群');
                    node.nodeValue = '蜂群';
                    return;
                }

                let newVal = originalVal;
                const inSwarmText = isSwarmUiContext(node.parentElement);
                const scopedSwarmHit = (inSwarmText && Object.prototype.hasOwnProperty.call(SCOPED_SWARM_MAP, valNorm))
                    ? SCOPED_SWARM_MAP[valNorm][USE_TW ? 1 : 0]
                    : null;
                const scopedModelHit = (scopedSwarmHit === null && valNorm === 'Recommended' && isModelMenuText(node))
                    ? (USE_TW ? '推薦' : '推荐')
                    : null;
                const commonTrans = scopedSwarmHit !== null
                    ? scopedSwarmHit
                    : (scopedModelHit !== null ? scopedModelHit : translateExactOrDynamic(valNorm));
                if (commonTrans !== null) {
                    newVal = commonTrans;
                } else {
                    const ctxTrans = translateContextualText(node, originalVal, valNorm);
                    if (ctxTrans !== null) {
                        newVal = ctxTrans;
                    } else {
                        const swarmComp = inSwarmText ? translateSwarmComposite(originalVal) : null;
                        if (swarmComp !== null) {
                            newVal = swarmComp;
                        } else if (valNorm.length > 15 && valNorm.includes(' ') && longMissCache.get(node) !== valNorm) {
                            // 长句子串滑动替换与末尾截断智能匹配（词边界防护 + 失败缓存）
                            const isTruncated = (valNorm.endsWith('...') || valNorm.endsWith('…')) && valNorm.length >= 35;
                            const cleanVal = isTruncated ? valNorm.replace(/(\.\.\.|…)$/, '').trim().toLowerCase() : '';
                            let matchedLong = false;
                            for (const [key, translated, keyLower] of longEntries) {
                                if (key.length <= valNorm.length) {
                                    const replaced = replaceWithBoundary(newVal.includes(key) ? newVal : valNorm, key, translated);
                                    if (replaced !== null) {
                                        if (newVal.includes(key)) {
                                            newVal = replaced;
                                        } else {
                                            const lead = originalVal.match(/^\s*/)[0];
                                            const trail = originalVal.match(/\s*$/)[0];
                                            newVal = lead + replaced + trail;
                                        }
                                        matchedLong = true;
                                        break;
                                    }
                                }
                                if (isTruncated && cleanVal.length >= 30 && keyLower.startsWith(cleanVal)) {
                                    newVal = translated;
                                    matchedLong = true;
                                    break;
                                }
                            }
                            if (!matchedLong) {
                                longMissCache.set(node, valNorm);
                            }
                        }
                    }
                }

                if (newVal !== originalVal) {
                    translatedValues.set(node, newVal);
                    node.nodeValue = newVal;
                } else {
                    unchangedTextValues.set(node, originalVal);
                }
            }
        } catch (e) {}
    }

    const observer = typeof MutationObserver === 'function' ? new MutationObserver(mutations => {
        for (const m of mutations) {
            if (m.type === 'childList') {
                for (const n of m.addedNodes) {
                    translateNode(n);
                    refreshGapsAround(n);
                    if (n && n.nodeType === Node.ELEMENT_NODE && !n.shadowRoot && typeof queueMicrotask === 'function') {
                        queueMicrotask(() => {
                            try {
                                if (n.shadowRoot) {
                                    observeRoot(n.shadowRoot);
                                    translateNode(n.shadowRoot);
                                }
                            } catch (e) {}
                        });
                    }
                }
            } else if (m.type === 'characterData') {
                translateNode(m.target);
                refreshGapsAround(m.target);
            } else if (m.type === 'attributes') {
                translateNode(m.target);
                if (m.attributeName === 'aria-label' || m.attributeName === 'aria-labelledby') {
                    refreshMenusLabelledBy(m.target);
                }
            }
        }
    }) : null;

    const obsOpts = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label', 'aria-description', 'aria-labelledby', 'role'] };
    const observedRoots = new WeakSet();

    function observeRoot(root) {
        if (!observer || !root || observedRoots.has(root)) return;
        observer.observe(root, obsOpts);
        observedRoots.add(root);
    }

    const startEngine = () => {
        if (typeof document === 'undefined') return;
        const obsTarget = document.documentElement || document.body;
        const walkTarget = document.body || document.documentElement;
        if (obsTarget) {
            try {
                observeRoot(obsTarget);
                if (walkTarget) translateNode(walkTarget);
                if (obsTarget !== walkTarget) {
                    for (const child of obsTarget.childNodes) {
                        if (child !== walkTarget) translateNode(child);
                    }
                }
            } catch (e) {}
        }
    };
    if (typeof window !== 'undefined') {
        window.__agCnRuntimeStart = startEngine;
    }

    if (typeof Element !== 'undefined' && Element.prototype && typeof Element.prototype.attachShadow === 'function' && !Element.prototype.attachShadow._agCnHooked) {
        const origAttachShadow = Element.prototype.attachShadow;
        const hookedAttachShadow = function() {
            const sr = origAttachShadow.apply(this, arguments);
            try { observeRoot(sr); } catch (e) {}
            return sr;
        };
        hookedAttachShadow._agCnHooked = true;
        Element.prototype.attachShadow = hookedAttachShadow;
    }

    // 强力多阶段触发绑定
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
            document.addEventListener('DOMContentLoaded', startEngine);
        } else {
            startEngine();
        }
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('load', startEngine);
        }
        for (const delay of [100, 300, 1000, 3000, 6000]) {
            setTimeout(startEngine, delay);
        }
    }
})();
