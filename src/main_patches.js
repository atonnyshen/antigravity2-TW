function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanJsContent(content, signatureStart, signatureEnd) {
    const regex = new RegExp("(?:\\r?\\n;)?\\r?\\n?" + escapeRegExp(signatureStart) + "[\\s\\S]*?" + escapeRegExp(signatureEnd), "g");
    return content.replace(regex, "");
}

function cleanMenuJsContent(content) {
    content = content.replace(/\n?\s*\/\* --- MENU TRANSLATION START --- \*\/[\s\S]*?\/\* --- MENU TRANSLATION END --- \*\//g, '');
    const startMark = "// ==========================================\n    // Antigravity Native Menu Chinese Translation";
    const endMark = "translateMenu(menu.items);";
    const startIdx = content.indexOf(startMark);
    const endIdx = content.indexOf(endMark);
    if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
        return content.substring(0, startIdx) + content.substring(endIdx + endMark.length);
    }
    return content;
}

function cleanTrayJsContent(content) {
    content = content.replace(/\n\s*\/\* --- TRAY TRANSLATION START --- \*\/[\s\S]*?\/\* --- TRAY TRANSLATION END --- \*\//g, '');
    content = content.replace(/\n\s*\/\* --- TRAY DOUBLE CLICK START --- \*\/[\s\S]*?\/\* --- TRAY DOUBLE CLICK END --- \*\//g, '');
    content = content.replace(/\n\s*\/\* --- TRAY INSERT TRANSLATION START --- \*\/[\s\S]*?\/\* --- TRAY INSERT TRANSLATION END --- \*\//g, '');
    content = content.replace(/\/\* --- TRAY COUNT START:([A-Za-z0-9+/=]+) --- \*\/[\s\S]*?\/\* --- TRAY COUNT END --- \*\//g, (_m, b64) => Buffer.from(b64, 'base64').toString('utf8'));
    return content;
}

function cleanUtilsJsContent(content) {
    return content.replace(/\n?\s*\/\* --- SIDECAR TRANSLATION START --- \*\/[\s\S]*?\/\* --- SIDECAR TRANSLATION END --- \*\//g, '');
}

function patchUtilsJs(utilsContent, signatureStart, signatureEnd) {
    console.log(`[修改] 正在向 utils.js 注入伴生面板 (Sidecar) 汉化钩子...`);
    const cleaned = cleanUtilsJsContent(utilsContent);
    const targetStr = "hubContents.on('will-navigate', guardExternalNavigation);";
    const idx = cleaned.indexOf(targetStr);
    if (idx === -1) {
        console.warn(`[警告] 未能在 utils.js 中找到 Sidecar 钩子插入点。`);
        return cleaned;
    }

    const sidecarHookJs = `/* --- SIDECAR TRANSLATION START --- */
    const getSidecarLocalizationScript = () => {
        const preloadFile = typeof path_1 !== 'undefined' && path_1 && path_1.default
            ? path_1.default.join(__dirname, 'preload.js')
            : require('path').join(__dirname, 'preload.js');
        const cacheKey = '__agSidecarLocalizationScript:' + preloadFile;
        if (typeof globalThis[cacheKey] === 'string') {
            return globalThis[cacheKey];
        }
        try {
            const fsMod = typeof fs !== 'undefined' && fs && typeof fs.readFileSync === 'function' ? fs : require('fs');
            const preloadSrc = fsMod.readFileSync(preloadFile, 'utf8');
            const sIdx = preloadSrc.indexOf(${JSON.stringify(signatureStart)});
            const eIdx = sIdx !== -1 ? preloadSrc.indexOf(${JSON.stringify(signatureEnd)}, sIdx + ${signatureStart.length}) : -1;
            if (sIdx !== -1 && eIdx !== -1 && sIdx < eIdx) {
                const extracted = preloadSrc.slice(sIdx, eIdx + ${signatureEnd.length});
                globalThis[cacheKey] = extracted;
                return extracted;
            }
        } catch (_err) {}
        return '';
    };
    const resolveSidecarSubframe = (event, frameProcessId, frameRoutingId) => {
        if (event && event.frame) return event.frame;
        if (typeof frameProcessId === 'number' && typeof frameRoutingId === 'number') {
            return electron_1.webFrameMain?.fromId?.(frameProcessId, frameRoutingId) ?? null;
        }
        return null;
    };
    const checkSidecarIframeInHub = (targetUrl) => {
        try {
            const target = new URL(targetUrl);
            const iframes = document.querySelectorAll('iframe[data-testid="sidecar-iframe"]');
            for (const el of iframes) {
                const raw = el.getAttribute('src') || el.src || '';
                if (!raw) continue;
                const u = new URL(raw, location.href);
                if (u.origin !== target.origin) continue;
                const baseDir = u.pathname.slice(0, u.pathname.lastIndexOf('/') + 1);
                if (u.origin !== location.origin || target.pathname === u.pathname || target.pathname.startsWith(baseDir)) {
                    return true;
                }
            }
        } catch (_e) {}
        return false;
    };
    const injectSidecarSubframe = (frame) => {
        try {
            const winDestroyed = typeof win !== 'undefined' && win && win.isDestroyed?.();
            if (!frame || frame.isDestroyed?.() || winDestroyed || hubContents.isDestroyed?.()) return;
            const mainFrame = hubContents.mainFrame;
            if (!mainFrame || frame === mainFrame || frame.parent !== mainFrame) return;
            const frameUrl = String(frame.url || '');
            if (!/^(?:https?|plugin):\\/\\//i.test(frameUrl)) return;
            const frameOrigin = String(frame.origin || '');
            if (!frameOrigin || frameOrigin === 'null') return;
            const script = getSidecarLocalizationScript();
            if (!script) return;
            const checkExpr = '(' + checkSidecarIframeInHub.toString() + ')(' + JSON.stringify(frameUrl) + ')';
            Promise.resolve(mainFrame.executeJavaScript(checkExpr))
                .then((isSidecar) => {
                    if (!isSidecar) return;
                    const winDestroyedLater = typeof win !== 'undefined' && win && win.isDestroyed?.();
                    if (frame.isDestroyed?.() || winDestroyedLater || hubContents.isDestroyed?.()) return;
                    return frame.executeJavaScript(script);
                })
                .catch((err) => {
                    console.warn('[汉化] Sidecar 注入失败:', err && err.message ? err.message : err);
                });
        } catch (_err) {}
    };
    const onSidecarFrameNavigate = (event, _url, _httpResponseCode, _httpStatusText, isMainFrame, frameProcessId, frameRoutingId) => {
        if (isMainFrame) return;
        injectSidecarSubframe(resolveSidecarSubframe(event, frameProcessId, frameRoutingId));
    };
    const onSidecarFrameFinishLoad = (event, isMainFrame, frameProcessId, frameRoutingId) => {
        if (isMainFrame) return;
        injectSidecarSubframe(resolveSidecarSubframe(event, frameProcessId, frameRoutingId));
    };
    hubContents.on('did-frame-navigate', onSidecarFrameNavigate);
    hubContents.on('did-frame-finish-load', onSidecarFrameFinishLoad);
    if (typeof win !== 'undefined' && win && typeof win.on === 'function') {
        win.on('closed', () => {
            hubContents.off?.('did-frame-navigate', onSidecarFrameNavigate);
            hubContents.off?.('did-frame-finish-load', onSidecarFrameFinishLoad);
        });
    }
    /* --- SIDECAR TRANSLATION END --- */`;

    console.log(`[修改] 伴生面板 (Sidecar) 汉化钩子注入成功！`);
    return cleaned.substring(0, idx) + sidecarHookJs + "\n    " + cleaned.substring(idx);
}

function patchPreloadJs(content, translationJs, signatureStart, signatureEnd) {
    console.log(`[修改] 正在向 preload.js 注入汉化代码...`);
    const cleanedContent = cleanJsContent(content, signatureStart, signatureEnd);
    const newContent = cleanedContent + "\n;\n" + translationJs;
    console.log(`[修改] 注入成功！`);
    return newContent;
}

function patchMenuJs(menuContent, useTw) {
    console.log(`[修改] 正在向 menu.js 注入菜单汉化代码...`);
    const menuCleaned = cleanMenuJsContent(menuContent);

    const menuTranslationJs = `
    /* --- MENU TRANSLATION START --- */
    // ==========================================
    // Antigravity Native Menu Chinese Translation
    // ==========================================
    const translations = ${useTw ? `{
        'File': '檔案',
        'Edit': '編輯',
        'View': '檢視',
        'Window': '視窗',
        'Help': '說明',
        'New Window': '開新視窗',
        'Create Project': '建立專案',
        'Command Palette': '命令選擇區',
        'Docs': '說明文件',
        'Check for Updates': '檢查更新',
        'Checking for Updates...': '正在檢查更新...',
        'Downloading Update...': '正在下載更新...',
        'Restart to Update': '重新啟動以更新',
        'Toggle Developer Tools': '切換開發人員工具',
        'Undo': '復原',
        'Redo': '重做',
        'Cut': '剪下',
        'Copy': '複製',
        'Paste': '貼上',
        'Select All': '全選',
        'Minimize': '最小化',
        'Maximize': '最大化',
        'Close': '關閉',
        'Zoom': '縮放',
        'Reset Zoom': '重設縮放',
        'Actual Size': '實際大小',
        'Zoom In': '放大',
        'Zoom Out': '縮小',
        'Toggle Full Screen': '切換全螢幕',
        'Toggle Between Light/Dark Themes': '切換淺色/深色佈景主題',
        'Split Terminal': '分割終端機',
        'Split Conversation Horizontally': '水平分割對話',
        'Split Conversation Vertically': '垂直分割對話',
        'Split': '分割',
        'Split Right': '向右分割',
        'Split Down': '向下分割',
        'Replace With New': '取代為新對話',
        'Show in File Explorer': '在檔案總管中顯示',
        'Reveal in Finder': '在 Finder 中顯示',
        'Find in conversation': '在對話中尋找',
        'Connect to WSL': '連線至 WSL',
        'Reopen Locally': '在本機重新開啟',
        'About Antigravity': '關於 Antigravity',
        'Settings...': '設定...',
        'Preferences...': '偏好設定...',
        'Services': '服務',
        'Hide Antigravity': '隱藏 Antigravity',
        'Hide Others': '隱藏其他',
        'Show All': '顯示全部',
        'Quit Antigravity': '結束 Antigravity',
        'Quit': '結束',
        'Paste and Match Style': '貼上並符合樣式',
        'Delete': '刪除',
        'Bring All to Front': '將此程式所有視窗移至最前',
        'Close Window': '關閉視窗',
        'Version': '版本',
        'Reload': '重新載入',
        'Force Reload': '強制重新載入',
        'Substitutions': '替代',
        'Show Substitutions': '顯示替代',
        'Smart Quotes': '智慧型引號',
        'Smart Dashes': '智慧型破折號',
        'Text Replacement': '文字替代',
        'Speech': '語音',
        'Start Speaking': '開始朗讀',
        'Stop Speaking': '停止朗讀'
    }` : `{
        'File': '文件',
        'Edit': '编辑',
        'View': '视图',
        'Window': '窗口',
        'Help': '帮助',
        'New Window': '新建窗口',
        'Create Project': '创建项目',
        'Command Palette': '命令面板',
        'Docs': '文档',
        'Check for Updates': '检查更新',
        'Checking for Updates...': '正在检查更新...',
        'Downloading Update...': '正在下载更新...',
        'Restart to Update': '重启以更新',
        'Toggle Developer Tools': '切换开发者工具',
        'Undo': '撤销',
        'Redo': '重做',
        'Cut': '剪切',
        'Copy': '复制',
        'Paste': '粘贴',
        'Select All': '全选',
        'Minimize': '最小化',
        'Maximize': '最大化',
        'Close': '关闭',
        'Zoom': '缩放',
        'Reset Zoom': '重置缩放',
        'Actual Size': '实际大小',
        'Zoom In': '放大',
        'Zoom Out': '缩小',
        'Toggle Full Screen': '切换全屏',
        'Toggle Between Light/Dark Themes': '切换浅色/深色主题',
        'Split Terminal': '拆分终端',
        'Split Conversation Horizontally': '水平拆分会话',
        'Split Conversation Vertically': '垂直拆分会话',
        'Split': '拆分',
        'Split Right': '向右拆分',
        'Split Down': '向下拆分',
        'Replace With New': '替换为新会话',
        'Show in File Explorer': '在文件资源管理器中显示',
        'Reveal in Finder': '在访达中显示',
        'Find in conversation': '在会话中查找',
        'Connect to WSL': '连接到 WSL',
        'Reopen Locally': '在本地重新打开',
        'About Antigravity': '关于 Antigravity',
        'Settings...': '设置...',
        'Preferences...': '首选项...',
        'Services': '服务',
        'Hide Antigravity': '隐藏 Antigravity',
        'Hide Others': '隐藏其他',
        'Show All': '全部显示',
        'Quit Antigravity': '退出 Antigravity',
        'Quit': '退出',
        'Paste and Match Style': '粘贴并匹配样式',
        'Delete': '删除',
        'Bring All to Front': '前置全部窗口',
        'Close Window': '关闭窗口',
        'Version': '版本',
        'Reload': '重新加载',
        'Force Reload': '强制重新加载',
        'Substitutions': '替换',
        'Show Substitutions': '显示替换',
        'Smart Quotes': '智能引号',
        'Smart Dashes': '智能破折号',
        'Text Replacement': '文本替换',
        'Speech': '语音',
        'Start Speaking': '开始朗读',
        'Stop Speaking': '停止朗读'
    }`};
    function translateMenu(items) {
        for (const item of items) {
            let label = item.label || '';
            let mnemonic = '';
            let cleanLabel = label;
            const m = label.match(/&([a-zA-Z])/);
            if (m) {
                mnemonic = "(&" + m[1] + ")";
                cleanLabel = label.replace('&', '');
            }
            if (!item._origLabel) item._origLabel = label;
            if (!item._origCleanLabel) item._origCleanLabel = cleanLabel;
            if (translations[cleanLabel]) {
                item.label = translations[cleanLabel] + mnemonic;
            } else if (translations[label]) {
                item.label = translations[label];
            } else if (/^Version\\s*([\\d\\.]*)$/i.test(cleanLabel)) {
                item.label = cleanLabel.replace(/^Version\\s*([\\d\\.]*)$/i, (match, v) => v ? "版本 " + v : "版本");
            }
            if (item.submenu && item.submenu.items) {
                translateMenu(item.submenu.items);
            }
        }
    }
    if (menu && Array.isArray(menu.items) && !menu.items._cnFindHooked) {
        menu.items._cnFindHooked = true;
        const origFind = menu.items.find.bind(menu.items);
        menu.items.find = function(pred, thisArg) {
            return origFind((it, idx, arr) => {
                if (pred.call(thisArg, it, idx, arr)) return true;
                if (it && it._origLabel && pred.call(thisArg, { ...it, label: it._origLabel }, idx, arr)) return true;
                if (it && it._origCleanLabel && pred.call(thisArg, { ...it, label: it._origCleanLabel }, idx, arr)) return true;
                return false;
            });
        };
    }
    if (!electron_1.Menu._cnHooked) {
        electron_1.Menu._cnHooked = true;
        const origSetAppMenu = electron_1.Menu.setApplicationMenu.bind(electron_1.Menu);
        electron_1.Menu.setApplicationMenu = function(m) {
            if (m && m.items) translateMenu(m.items);
            return origSetAppMenu(m);
        };
    }
    translateMenu(menu.items);
    /* --- MENU TRANSLATION END --- */`;

    const targetStr = "electron_1.Menu.setApplicationMenu(menu);";
    const idx = menuCleaned.indexOf(targetStr);
    if (idx !== -1) {
        console.log(`[修改] 菜单汉化注入成功！`);
        return menuCleaned.substring(0, idx) + menuTranslationJs + "\n    " + menuCleaned.substring(idx);
    } else {
        console.warn(`[警告] 未能在 menu.js 中找到设定的插入点。`);
        return menuCleaned;
    }
}

function patchTrayJs(trayContent, useTw) {
    console.log(`[修改] 正在向 tray.js 注入任务栏菜单汉化...`);
    let trayCleaned = cleanTrayJsContent(trayContent);

    const targetCreate = /function\s+createTray\s*\(([^)]*)\)\s*\{/;
    const replacementCreate = (match, args) => `function createTray(${args}) {
    /* --- TRAY TRANSLATION START --- */
    const translations = ${useTw ? `{
        'No agents running': '無執行中的代理',
        'Open Antigravity': '開啟 Antigravity',
        'Connect to WSL': '連線至 WSL',
        'Reopen Locally': '在本機重新開啟',
        'Quit': '結束'
    }` : `{
        'No agents running': '无运行中的智能体',
        'Open Antigravity': '打开 Antigravity',
        'Connect to WSL': '连接到 WSL',
        'Reopen Locally': '在本地重新打开',
        'Quit': '退出'
    }`};
    if (typeof actions !== 'undefined' && Array.isArray(actions)) {
        for (const item of actions) {
            if (!item || !item.label) continue;
            if (translations[item.label]) {
                item.label = translations[item.label];
            } else if (item.label.startsWith('Open ')) {
                item.label = (${useTw ? "true" : "false"} ? '開啟 ' : '打开 ') + item.label.slice(5);
            } else if (item.label === 'Quit') {
                item.label = ${useTw ? "true" : "false"} ? '結束' : '退出';
            }
        }
    }
    /* --- TRAY TRANSLATION END --- */`;

    let hitCount = 0;
    let trayPatched = trayCleaned.replace(targetCreate, (...m) => {
        hitCount++;
        return replacementCreate(...m);
    });
    if (hitCount === 0) {
        console.warn(`[警告] 未能在 tray.js 中找到 createTray 函数插入点。`);
    }

    const dblClickTarget = /tray\.setContextMenu\(contextMenu\);/;
    const dblClickReplacement = `tray.setContextMenu(contextMenu);
    /* --- TRAY DOUBLE CLICK START --- */
    if (typeof actions !== 'undefined' && Array.isArray(actions) && typeof tray !== 'undefined' && tray && typeof tray.on === 'function') {
        const openAction = actions.find(item => item && typeof item.click === 'function' && !['Quit', '退出', '結束'].includes(item.label));
        if (openAction) {
            tray.on('double-click', () => {
                const wins = electron_1.BrowserWindow.getAllWindows();
                if (wins.length > 0 && wins[0].isMinimized()) {
                    wins[0].restore();
                }
                openAction.click();
            });
        }
    }
    /* --- TRAY DOUBLE CLICK END --- */`;
    trayPatched = trayPatched.replace(dblClickTarget, () => {
        hitCount++;
        return dblClickReplacement;
    });

    const countRegex = /countItem\.label\s*=\s*\([^;]{0,300}' running';/g;
    const replacementCount = useTw
        ? "countItem.label = count > 0 ? `${count} 個代理執行中` : '無執行中的代理';"
        : "countItem.label = count > 0 ? `${count} 个智能体运行中` : '无运行中的智能体';";
    trayPatched = trayPatched.replace(countRegex, (match) => {
        hitCount++;
        return `/* --- TRAY COUNT START:${Buffer.from(match, 'utf8').toString('base64')} --- */ ${replacementCount} /* --- TRAY COUNT END --- */`;
    });

    const targetInsert = /function\s+insertTrayMenuItem\s*\(\s*position\s*,\s*options\s*\)\s*\{/;
    const replacementInsert = `function insertTrayMenuItem(position, options) {
    /* --- TRAY INSERT TRANSLATION START --- */
    const insertTranslations = ${useTw ? `{
        'No agents running': '無執行中的代理',
        'Open Antigravity': '開啟 Antigravity',
        'Connect to WSL': '連線至 WSL',
        'Reopen Locally': '在本機重新開啟',
        'Quit': '結束'
    }` : `{
        'No agents running': '无运行中的智能体',
        'Open Antigravity': '打开 Antigravity',
        'Connect to WSL': '连接到 WSL',
        'Reopen Locally': '在本地重新打开',
        'Quit': '退出'
    }`};
    if (options && options.label) {
        if (insertTranslations[options.label]) {
            options = { ...options, label: insertTranslations[options.label] };
        } else if (options.label.startsWith('Open ')) {
            options = { ...options, label: (${useTw ? "true" : "false"} ? '開啟 ' : '打开 ') + options.label.slice(5) };
        }
    }
    /* --- TRAY INSERT TRANSLATION END --- */`;
    trayPatched = trayPatched.replace(targetInsert, () => {
        hitCount++;
        return replacementInsert;
    });

    if (hitCount > 0) {
        console.log(`[修改] 任务栏菜单汉化注入成功（${hitCount} 处）！`);
    } else {
        console.warn(`[警告] 未能在 tray.js 中命中任何任务栏注入点。`);
    }
    return trayPatched;
}

function patchLoadingOverlayJs(loadingContent, useTw) {
    console.log(`[修改] 正在向 loadingOverlay.js 注入加载页汉化...`);
    const replacementText = useTw
        ? '<div class="text">正在載入 Antigravity…</div>'
        : '<div class="text">正在加载 Antigravity…</div>';

    const out = loadingContent
        .replace('<div class="text">Loading Antigravity</div>', replacementText)
        .replace('<div class="text">反重力引擎已啟動，正在努力擺脫地心引力...</div>', replacementText)
        .replace('<div class="text">反重力引擎已启动，正在努力摆脱地心引力...</div>', replacementText);

    if (out !== loadingContent) {
        console.log(`[修改] 加载页汉化注入成功！`);
    } else if (!loadingContent.includes('<div class="text">')) {
        console.log(`[修改] 載入頁目前僅含圖形動畫，無須額外文字補丁。`);
    } else {
        console.warn(`[警告] 未能在 loadingOverlay.js 中找到加载页文本插入点。`);
    }
    return out;
}

function patchUpdaterJs(updaterContent, useTw) {
    console.log(`[修改] 正在向 updater.js 注入更新弹窗汉化...`);
    const targetOptions = `                title: 'Check for Updates',
                message: 'No updates available',
                buttons: ['OK'],`;
    const replacementOptions = useTw
        ? `                title: '檢查更新',
                message: '目前沒有可用的更新',
                buttons: ['好'],`
        : `                title: '检查更新',
                message: '暂无可用更新',
                buttons: ['确定'],`;

    const out = updaterContent
        .replace(targetOptions, replacementOptions)
        .replace('MenuUpdateStep["CheckForUpdates"] = "Check for Updates";', `MenuUpdateStep["CheckForUpdates"] = ${useTw ? '"檢查更新"' : '"检查更新"'};`)
        .replace('MenuUpdateStep["CheckingForUpdates"] = "Checking for Updates...";', `MenuUpdateStep["CheckingForUpdates"] = ${useTw ? '"正在檢查更新..."' : '"正在检查更新..."'};`)
        .replace('MenuUpdateStep["DownloadingUpdate"] = "Downloading Update...";', `MenuUpdateStep["DownloadingUpdate"] = ${useTw ? '"正在下載更新..."' : '"正在下载更新..."'};`)
        .replace('MenuUpdateStep["RestartToUpdate"] = "Restart to Update";', `MenuUpdateStep["RestartToUpdate"] = ${useTw ? '"重新啟動以更新"' : '"重启以更新"'};`);
    if (out !== updaterContent) {
        console.log(`[修改] 更新弹窗汉化注入成功！`);
    } else if (updaterContent.includes(`MenuUpdateStep["CheckForUpdates"] = ${useTw ? '"檢查更新"' : '"检查更新"'};`)) {
        // 背景守護以已漢化的 app.asar 重建時會走到這裡，不是插入點遺失
        console.log(`[修改] 更新弹窗已是汉化版本，无需重复注入。`);
    } else {
        console.warn(`[警告] 未能在 updater.js 中找到更新弹窗插入点。`);
    }
    return out;
}

function patchMainJs(mainContent, useTw) {
    console.log(`[修改] 正在向 main.js 注入退出對話框與系統提示漢化...`);
    let out = mainContent;

    const targetQuit = `buttons: ['Cancel', 'Quit'],
        defaultId: 1,
        cancelId: 0,
        title: 'Confirm Quit',
        message: 'Are you sure you want to quit?',
        detail: 'There may be agents or background tasks running.',`;

    const replacementQuit = useTw ? `buttons: ['取消', '結束'],
        defaultId: 1,
        cancelId: 0,
        title: '確認結束',
        message: '您確定要結束 Antigravity 嗎？',
        detail: '目前可能仍有代理或背景任務正在執行。',` : `buttons: ['取消', '退出'],
        defaultId: 1,
        cancelId: 0,
        title: '确认退出',
        message: '您确定要退出 Antigravity 吗？',
        detail: '目前可能仍有智能体或后台任务正在运行。',`;

    if (out.includes(targetQuit)) {
        out = out.replace(targetQuit, replacementQuit);
    } else {
        out = out.replace(/title:\s*'Confirm Quit'/g, useTw ? "title: '確認結束'" : "title: '确认退出'")
                 .replace(/message:\s*'Are you sure you want to quit\?'/g, useTw ? "message: '您確定要結束 Antigravity 嗎？'" : "message: '您确定要退出 Antigravity 吗？'")
                 .replace(/detail:\s*'There may be agents or background tasks running\.'/g, useTw ? "detail: '目前可能仍有代理或背景任務正在執行。'" : "detail: '目前可能仍有智能体或后台任务正在运行。'")
                 .replace(/buttons:\s*\['Cancel',\s*'Quit'\]/g, useTw ? "buttons: ['取消', '結束']" : "buttons: ['取消', '退出']");
    }

    out = out.replace(/(dockMenu\s*=\s*electron_1\.Menu\.buildFromTemplate\(\[\s*\{\s*label:\s*)'New Window'/g,
                      useTw ? "$1'開新視窗'" : "$1'新建窗口'")
             .replace(/dialog\.showErrorBox\('Binary not found'/g, useTw ? "dialog.showErrorBox('找不到執行檔'" : "dialog.showErrorBox('未找到可执行文件'")
             .replace(/dialog\.showErrorBox\('WSL setup failed'/g, useTw ? "dialog.showErrorBox('WSL 設定失敗'" : "dialog.showErrorBox('WSL 设置失败'")
             .split('`Failed to install the server into WSL distro "${WSL_DISTRO}":\\n${err.message}`')
             .join(useTw ? '`無法將伺服器安裝到 WSL 發行版「${WSL_DISTRO}」：\\n${err.message}`' : '`无法将服务器安装到 WSL 发行版“${WSL_DISTRO}”：\\n${err.message}`')
             .replace(/dialog\.showErrorBox\('Startup failed'/g, useTw ? "dialog.showErrorBox('啟動失敗'" : "dialog.showErrorBox('启动失败'")
             .replace(/title:\s*'WSL distro not found'/g, useTw ? "title: '找不到 WSL 發行版'" : "title: '未找到 WSL 发行版'")
             .replace(/message:\s*`The WSL distro "\$\{WSL_DISTRO\}" is no longer installed\.`/g, useTw ? "message: `WSL 發行版「${WSL_DISTRO}」已不在此電腦上。`" : "message: `WSL 发行版“${WSL_DISTRO}”已不在此电脑上。`")
             .replace(/detail:\s*'Antigravity opened on Windows instead\.'/g, useTw ? "detail: 'Antigravity 已改在 Windows 上開啟。'" : "detail: 'Antigravity 已改为在 Windows 上打开。'");

    console.log(`[修改] 主行程對話框漢化注入成功！`);
    return out;
}

function patchIpcHandlersJs(ipcContent, useTw) {
    console.log(`[修改] 正在向 ipcHandlers.js 注入原生資料夾對話框漢化...`);
    let out = ipcContent;
    out = out.replace(/dialog\.showErrorBox\('Cannot open folder'/g, useTw ? "dialog.showErrorBox('無法開啟資料夾'" : "dialog.showErrorBox('无法打开文件夹'")
             .replace(/message:\s*'Folder is on the Windows filesystem'/g, useTw ? "message: '資料夾位於 Windows 檔案系統'" : "message: '文件夹位于 Windows 文件系统'")
             .replace(/title:\s*'Open workspace'/g, useTw ? "title: '開啟工作區'" : "title: '打开工作区'")
             .replace(/title:\s*'Open workspaces'/g, useTw ? "title: '開啟工作區'" : "title: '打开工作区'")
             .replace(/title:\s*'Select Download Folder'/g, useTw ? "title: '選取下載資料夾'" : "title: '选择下载文件夹'");
    console.log(`[修改] 原生資料夾對話框漢化注入成功！`);
    return out;
}

function patchRemoteManagerJs(rmContent, useTw) {
    console.log(`[修改] 正在向 remoteManager.js 注入遠端伺服器對話框漢化...`);
    let out = rmContent;
    out = out.replace(/title:\s*'Choose an SSH config file'/g, useTw ? "title: '選擇 SSH 設定檔'" : "title: '选择 SSH 配置文件'")
             .replace(/title:\s*'Choose another SSH config file'/g, useTw ? "title: '選取另一個 SSH 設定檔'" : "title: '选择另一个 SSH 配置文件'")
             .replace(/message:\s*`\$\{name\} can't be the SSH config file`/g, useTw ? "message: `${name} 無法作為 SSH 設定檔`" : "message: `${name} 不能作为 SSH 配置文件`")
             .replace(/buttons:\s*\['Choose Another File…',\s*'Cancel'\]/g, useTw ? "buttons: ['選取其他檔案…', '取消']" : "buttons: ['选择其他文件…', '取消']")
             .replace(/title:\s*'Could not restart the SSH server'/g, useTw ? "title: '無法重新啟動 SSH 伺服器'" : "title: '无法重启 SSH 服务器'")
             .replace(/'Could not restart the SSH server'/g, useTw ? "'無法重新啟動 SSH 伺服器'" : "'无法重启 SSH 服务器'")
             // reportError() 以參數傳入的對話框標題
             .replace(/'Could not stop the SSH server'/g, useTw ? "'無法停止 SSH 伺服器'" : "'无法停止 SSH 服务器'")
             .replace(/'Sign-in failed'/g, useTw ? "'登入失敗'" : "'登录失败'")
             .replace(/'Connection cancelled\.'/g, useTw ? "'已取消連線。'" : "'连接已取消。'")
             .replace(/message:\s*`\$\{entry\.label\} still runs Antigravity server \$\{running\}\.`/g, useTw ? "message: `${entry.label} 仍在執行 Antigravity 伺服器 ${running}。`" : "message: `${entry.label} 仍在运行 Antigravity 服务器 ${running}。`")
             .replace(/title:\s*'Microphone access'/g, useTw ? "title: '麥克風存取權限'" : "title: '麦克风访问权限'")
             .replace(/message:\s*`Allow \$\{label\} to use your microphone\?`/g, useTw ? "message: `允許 ${label} 使用您的麥克風嗎？`" : "message: `允许 ${label} 使用您的麦克风吗？`")
             .replace(/detail:\s*`The page in this window comes from \$\{label\}\. If you allow it, that `\s*\+\s*"host can use this computer's microphone for voice whenever one of "\s*\+\s*'its windows is open\. Antigravity asks again after you quit it\.'/g,
                      useTw ? "detail: `此視窗中的頁面來自 ${label}。若您允許，只要該主機任一視窗處於開啟狀態，即可使用此電腦的麥克風進行語音輸入；完全結束 Antigravity 後將再次詢問。`" : "detail: `此窗口中的页面来自 ${label}。如果允许，只要该主机有任意窗口打开，即可使用此电脑的麦克风进行语音操作；完全退出 Antigravity 后将再次询问。`")
             .replace(/buttons:\s*\['Allow',\s*"Don't Allow"\]/g, useTw ? "buttons: ['允許', '不允許']" : "buttons: ['允许', '不允许']")
             .replace(/buttons:\s*\['Allow',\s*'Block'\]/g, useTw ? "buttons: ['允許', '封鎖']" : "buttons: ['允许', '阻止']")
             .replace(/buttons:\s*\['Block',\s*'Allow'\]/g, useTw ? "buttons: ['封鎖', '允許']" : "buttons: ['阻止', '允许']")
             .replace(/title:\s*'Shared home directory'/g, useTw ? "title: '共用家目錄'" : "title: '共享主目录'")
             .replace(/`This window's Antigravity server runs on \$\{host\}, another machine that shares your home directory\.`/g, useTw ? "`此視窗的 Antigravity 伺服器執行於共用家目錄的另一台機器 ${host}。`" : "`此窗口的 Antigravity 服务器运行于共享主目录的另一台机器 ${host}。`")
             .replace(/`Your Antigravity server runs on \$\{host\}, another machine that shares your home directory\.`/g, useTw ? "`您的 Antigravity 伺服器執行於共用家目錄的另一台機器 ${host}。`" : "`您的 Antigravity 服务器运行于共享主目录的另一台机器 ${host}。`")
             .replace(/`\$\{host\}, another machine that shares your home directory, started your Antigravity server\.`/g, useTw ? "`共用家目錄的另一台機器 ${host} 已啟動您的 Antigravity 伺服器。`" : "`共享主目录的另一台机器 ${host} 已启动您的 Antigravity 服务器。`")
             .replace(/`\$\{label\} reached \$\{here\} this time\. Cancel and reconnect to try again for \$\{host\}, or take over to stop the server on \$\{host\}, and its agents, and run it on \$\{here\} instead\.`/g, useTw ? "`${label} 本次連線至 ${here}。您可選擇「取消」並重新連線以再次嘗試連接 ${host}，或選擇「接管」以停止 ${host} 上的伺服器與代理，改在 ${here} 上執行。`" : "`${label} 本次连接到了 ${here}。您可选择“取消”并重连以重新尝试连接 ${host}，或选择“接管”以停止 ${host} 上的服务器及智能体，改在 ${here} 上运行。`")
             .replace(/`\$\{label\} reached \$\{here\}\. Take over to stop the server on \$\{host\}, and its agents, and run it on \$\{here\} instead\. To keep it running, connect to \$\{host\}\.`/g, useTw ? "`${label} 已連線至 ${here}。選擇「接管」可停止 ${host} 上的伺服器與代理並改在 ${here} 執行；若要維持其執行，請連線至 ${host}。`" : "`${label} 已连接到 ${here}。选择“接管”可停止 ${host} 上的服务器及智能体并改在 ${here} 运行；如需继续保留，请连接到 ${host}。`")
             .replace(/`\$\{label\} reached \$\{here\}\. Take over only if that server no longer runs, for example if \$\{host\} was shut down or replaced: if it still runs, both servers would write the same files\. To check, connect to \$\{host\}\.`/g, useTw ? "`${label} 已連線至 ${here}。僅當該伺服器不再執行時（例如 ${host} 已關機或汰換）才應選擇接管，否則兩台伺服器同時寫入相同檔案將造成衝突。如需確認，請連線至 ${host}。`" : "`${label} 已连接到 ${here}。仅当原服务器不再运行时（例如 ${host} 已关机或被替换）才可接管，否则两台服务器同时写入相同文件会产生冲突。如需检查，请连接到 ${host}。`")
             .replace(/buttons:\s*\['Take Over',\s*'Cancel'\]/g, useTw ? "buttons: ['接管', '取消']" : "buttons: ['接管', '取消']")
             .replace(/const what = terminals === 0 \? 'agent or task' : 'agent, task or terminal';/g, useTw ? "const what = terminals === 0 ? '代理或任務' : '代理、任務或終端機';" : "const what = terminals === 0 ? '智能体或任务' : '智能体、任务或终端';")
             .replace(/buttons:\s*\['Restart',\s*'Later'\]/g, useTw ? "buttons: ['重新啟動', '稍後']" : "buttons: ['重启', '稍后']")
             .replace(/title:\s*'Restart SSH server'/g, useTw ? "title: '重新啟動 SSH 伺服器'" : "title: '重启 SSH 服务器'")
             .replace(/buttons:\s*\['Continue',\s*'Cancel'\]/g, useTw ? "buttons: ['繼續', '取消']" : "buttons: ['继续', '取消']")
             .replace(/message:\s*`Finish this sign-in on \$\{entry\.label\}\?`/g, useTw ? "message: `要在 ${entry.label} 上完成此次登入嗎？`" : "message: `要在 ${entry.label} 上完成此次登录吗？`")
             .replace(/detail:\s*`Continue only if you just chose to sign in from the \$\{entry\.label\} `\s*\+\s*'window\. Your browser opens the sign-in page; once you sign in, '\s*\+\s*`\$\{entry\.label\} gets access to that account\.\\n`\s*\+\s*`Sign-in page: \$\{\(0, types_1\.sanitizeRemoteText\)\(new URL\(origin\)\.host, 200\)\}`/g,
                      useTw ? "detail: `僅在您剛才於 ${entry.label} 視窗中選擇登入時才繼續。系統將在瀏覽器開啟登入頁面；完成登入後，${entry.label} 將取得該帳戶存取權限。\\n登入頁面：${(0, types_1.sanitizeRemoteText)(new URL(origin).host, 200)}`" : "detail: `仅在您刚才从 ${entry.label} 窗口中选择登录时才继续。浏览器将打开登录页面；完成登录后，${entry.label} 将获取该账户访问权限。\\n登录页面：${(0, types_1.sanitizeRemoteText)(new URL(origin).host, 200)}`")
             .replace(/message:\s*`\$\{label\} is running server \$\{running\}; this app is \$\{expected\}\. Restart the server now\?`/g,
                      useTw ? "message: `${label} 目前執行的伺服器版本為 ${running}；此應用程式為 ${expected}。要立即重新啟動伺服器嗎？`" : "message: `${label} 当前运行的服务器版本为 ${running}；此应用为 ${expected}。要立即重启服务器吗？`")
             .replace(/detail:\s*`Any \$\{what\} still running on it stops\. The server starts again with this app's version\.`/g,
                      useTw ? "detail: `目前仍在該伺服器執行的 ${what} 將會停止，之後會改以目前應用程式版本重新啟動。`" : "detail: `当前仍在其中运行的 ${what} 将停止，随后会以当前应用版本重新启动服务器。`")
             .replace(/title:\s*'SSH connection failed'/g, useTw ? "title: 'SSH 連線失敗'" : "title: 'SSH 连接失败'")
             .replace(/buttons:\s*\['Stop Server',\s*'Cancel'\]/g, useTw ? "buttons: ['停止伺服器', '取消']" : "buttons: ['停止服务器', '取消']")
             .replace(/title:\s*'Stop SSH server'/g, useTw ? "title: '停止 SSH 伺服器'" : "title: '停止 SSH 服务器'")
             .replace(/Stop the Antigravity server on \$\{entry\.label\}\?/g, useTw ? "停止 ${entry.label} 上的 Antigravity 伺服器？" : "停止 ${entry.label} 上的 Antigravity 服务器？")
             .replace(/'Agents running on this host will stop and its window will close\.\s*'\s*\+\s*'The server starts again the next time you connect\.'/g,
                      useTw ? "'此主機上執行的代理將停止，其視窗也將關閉。下次連線時伺服器將重新啟動。'" : "'此主机上运行的智能体将停止，其窗口也将关闭。下次连接时服务器将重新启动。'")
             .replace(/Agents running on this host will stop and its window will close\. The server starts again the next time you connect\./g,
                      useTw ? "此主機上執行的代理將停止，其視窗也將關閉。下次連線時伺服器將重新啟動。" : "此主机上运行的智能体将停止，其窗口也将关闭。下次连接时服务器将重新启动。")
             .replace(/message:\s*`Not connected to \$\{label\}`/g, useTw ? "message: `尚未連線至 ${label}`" : "message: `未连接到 ${label}`")
             .replace(/detail:\s*'Reconnect first, then stop its server\.'/g, useTw ? "detail: '請先重新連線，再停止其伺服器。'" : "detail: '请先重新连接，再停止其服务器。'")
             .replace(/buttons:\s*\['Sign In',\s*'Cancel'\]/g, useTw ? "buttons: ['登入', '取消']" : "buttons: ['登录', '取消']")
             .replace(/title:\s*'Sign in'/g, useTw ? "title: '登入'" : "title: '登录'")
             .replace(/Sign in to your organization for \$\{entry\.label\}\?/g, useTw ? "登入 ${entry.label} 的機構帳戶？" : "登录 ${entry.label} 的组织账户？")
             .replace(/'Continue only if you just chose to sign in with your organization '\s*\+\s*`in this window\. \$\{entry\.label\} will get access to your `\s*\+\s*"organization's Google Cloud account\.\\n"/g,
                      useTw ? "`僅在您剛才於此視窗中選擇透過機構登入時才繼續。${entry.label} 將取得您機構的 Google Cloud 帳戶存取權限。\\n`" : "`仅在您刚才于此窗口中选择通过组织登录时才继续。${entry.label} 将获取您组织的 Google Cloud 账户访问权限。\\n`");
    console.log(`[修改] 遠端伺服器對話框漢化注入成功！`);
    return out;
}

function patchSshPromptsJs(spContent, useTw) {
    console.log(`[修改] 正在向 sshPrompts.js 注入 SSH 驗證提示漢化...`);
    let out = spContent;
    out = out.replace(/Asked again: your last answer may not have worked\./g, useTw ? '再次詢問：您上次的輸入可能未通過驗證。' : '再次询问：您上次的输入可能未通过验证。')
             .replace(/That's too long\./g, useTw ? '輸入內容過長。' : '输入内容过长。')
             .replace(/<button id="cancel"((?: class="[^"]*")?)>Cancel<\/button><button id="continue"((?: class="[^"]*")?)>Continue<\/button>/g, useTw ? '<button id="cancel"$1>取消</button><button id="continue"$2>繼續</button>' : '<button id="cancel"$1>取消</button><button id="continue"$2>继续</button>')
             .replace(/`\$\{label\} asks:`/g, useTw ? '`${label} 請求確認：`' : '`${label} 请求确认：`')
             .replace(/'Touch your security key'/g, useTw ? "'請輕觸您的安全性金鑰'" : "'请轻触您的安全密钥'")
             .replace(/buttons:\s*confirm\s*\?\s*\['Yes',\s*'No'\]\s*:\s*\['Cancel'\]/g, useTw ? "buttons: confirm ? ['是', '否'] : ['取消']" : "buttons: confirm ? ['是', '否'] : ['取消']")
             // 2.35.1 起：頁面語系（本專案一律宣告 zh-TW）、連線中提示，以及依提示內容產生的標題
             .replace(/<html lang="en"/g, '<html lang="zh-TW"')
             .replace(/<p class="context">Connecting to <span id="label"><\/span><\/p>/g, useTw ? '<p class="context">正在連線至 <span id="label"></span></p>' : '<p class="context">正在连接到 <span id="label"></span></p>')
             .replace(/`Trust \$\{hostName\(host\.split\(' \('\)\[0\]\)\}\?`/g, () => useTw ? "`要信任 ${hostName(host.split(' (')[0])} 嗎？`" : "`要信任 ${hostName(host.split(' (')[0])} 吗？`")
             .replace(/`Connect to \$\{hostName\(host\)\} anyway\?`/g, () => useTw ? '`仍要連線至 ${hostName(host)} 嗎？`' : '`仍要连接到 ${hostName(host)} 吗？`')
             .replace(/return 'Accept updated host keys\?';/g, () => useTw ? "return '要接受更新後的主機金鑰嗎？';" : "return '要接受更新后的主机密钥吗？';")
             .replace(/`Add \$\{baseName\(key\.split\(' \('\)\[0\]\)\} to ssh-agent\?`/g, () => useTw ? "`要將 ${baseName(key.split(' (')[0])} 加入 ssh-agent 嗎？`" : "`要将 ${baseName(key.split(' (')[0])} 添加到 ssh-agent 吗？`")
             .replace(/return `Question from \$\{who\}`;/g, () => useTw ? 'return `來自 ${who} 的問題`;' : 'return `来自 ${who} 的问题`;')
             .replace(/return `Verification code for \$\{who\}`;/g, () => useTw ? 'return `${who} 的驗證碼`;' : 'return `${who} 的验证码`;')
             .replace(/return `Password for \$\{who\}`;/g, () => useTw ? 'return `${who} 的密碼`;' : 'return `${who} 的密码`;')
             .replace(/\? `PIN for \$\{who\}` : `Sign in to \$\{who\}`;/g, () => useTw ? '? `${who} 的 PIN 碼` : `登入 ${who}`;' : '? `${who} 的 PIN 码` : `登录 ${who}`;')
             .replace(/`\$\{asked\[0\]\} for \$\{hostPromptsMarked \? asked\[1\] : label\}`/g, () => useTw
                 ? "((what, who) => ({ 'Password': `${who} 的密碼`, 'Current password': `${who} 的目前密碼`, 'New password': `${who} 的新密碼`, 'Confirm new password': `再次輸入 ${who} 的新密碼`, 'Passphrase': `${who} 的金鑰密碼`, 'PIN': `${who} 的 PIN 碼` })[what] ?? `${what} for ${who}`)(asked[0], hostPromptsMarked ? asked[1] : label)"
                 : "((what, who) => ({ 'Password': `${who} 的密码`, 'Current password': `${who} 的当前密码`, 'New password': `${who} 的新密码`, 'Confirm new password': `再次输入 ${who} 的新密码`, 'Passphrase': `${who} 的密钥口令`, 'PIN': `${who} 的 PIN 码` })[what] ?? `${what} for ${who}`)(asked[0], hostPromptsMarked ? asked[1] : label)");
    console.log(`[修改] SSH 驗證提示漢化注入成功！`);
    return out;
}

function patchDeviceChooserJs(dcContent, useTw) {
    console.log(`[修改] 正在向 deviceChooser.js 注入裝置選擇對話框漢化...`);
    const out = dcContent
        .replace(/title:\s*'Connect a device'/g, useTw ? "title: '連線至裝置'" : "title: '连接到设备'")
        .replace(/message:\s*`\$\{origin\} wants to connect to a \$\{KIND_NOUNS\[kind\]\}`/g, useTw ? "message: `${origin} 想要連線至 ${KIND_NOUNS[kind]}`" : "message: `${origin} 想要连接到 ${KIND_NOUNS[kind]}`")
        .replace(/'Select a device:'/g, useTw ? "'請選擇裝置：'" : "'请选择设备：'")
        .replace(/'No compatible devices found\.'/g, useTw ? "'找不到相容的裝置。'" : "'未找到兼容设备。'")
        .replace(/buttons:\s*\[\.\.\.snapshot\.map\(\(\{\s*label\s*\}\)\s*=>\s*label\),\s*'Cancel'\]/g, useTw ? "buttons: [...snapshot.map(({ label }) => label), '取消']" : "buttons: [...snapshot.map(({ label }) => label), '取消']");
    console.log(`[修改] 裝置選擇對話框漢化注入成功！`);
    return out;
}

function patchWebauthnJs(waContent, useTw) {
    console.log(`[修改] 正在向 webauthn.js 注入通行金鑰對話框漢化...`);
    const out = waContent
        .replace(/title:\s*'Choose a Passkey'/g, useTw ? "title: '選擇通行金鑰'" : "title: '选择通行密钥'")
        .replace(/message:\s*`Sign in to \$\{rpLabel\}`/g, useTw ? "message: `登入 ${rpLabel}`" : "message: `登录 ${rpLabel}`")
        .replace(/detail:\s*'Select a passkey account to continue:'/g, useTw ? "detail: '請選擇通行金鑰帳戶以繼續：'" : "detail: '请选择通行密钥账户以继续：'")
        .replace(/buttons:\s*\[\.\.\.accountLabels,\s*'Cancel'\]/g, useTw ? "buttons: [...accountLabels, '取消']" : "buttons: [...accountLabels, '取消']");
    console.log(`[修改] 通行金鑰對話框漢化注入成功！`);
    return out;
}

function patchWebviewPopupSecurityJs(wpsContent, useTw) {
    console.log(`[修改] 正在向 webviewPopupSecurity.js 注入連線資訊對話框漢化...`);
    const out = wpsContent
        .replace(/label:\s*'Connection info…'/g, useTw ? "label: '連線資訊…'" : "label: '连接信息…'")
        .replace(/title:\s*'Connection info'/g, useTw ? "title: '連線資訊'" : "title: '连接信息'")
        .replace(/buttons:\s*\['OK'\]/g, useTw ? "buttons: ['確定']" : "buttons: ['确定']")
        // 彈出視窗右鍵選單：Electron 的 role 預設標籤是英文
        .replace(/\{ role: 'cut', enabled: canCut \}/g, useTw ? "{ role: 'cut', label: '剪下', enabled: canCut }" : "{ role: 'cut', label: '剪切', enabled: canCut }")
        .replace(/\{ role: 'copy', enabled: canCopy \}/g, useTw ? "{ role: 'copy', label: '複製', enabled: canCopy }" : "{ role: 'copy', label: '复制', enabled: canCopy }")
        .replace(/\{ role: 'paste', enabled: canPaste \}/g, useTw ? "{ role: 'paste', label: '貼上', enabled: canPaste }" : "{ role: 'paste', label: '粘贴', enabled: canPaste }")
        .replace(/\{ role: 'selectAll', enabled: canSelectAll \}/g, useTw ? "{ role: 'selectAll', label: '全選', enabled: canSelectAll }" : "{ role: 'selectAll', label: '全选', enabled: canSelectAll }")
        // 視窗標題的安全標籤與「連線資訊」內容（譯法與字典內的瀏覽器連線資訊詞條一致）
        .replace(/insecure: 'Not secure',/g, "insecure: '不安全',")
        .replace(/dangerous: '⚠ Not secure',/g, "dangerous: '⚠ 不安全',")
        .replace(/'Your connection to this site is not secure',/g, useTw ? "'您與此網站的連線不安全'," : "'您与此网站的连接不安全',")
        .replace(/'You should not enter any sensitive information on this site \(for '\s*\+\s*'example, passwords or credit cards\), because it could be stolen by '\s*\+\s*'attackers\.',/g,
                 useTw ? "'您不應在此網站輸入任何機密資訊（例如密碼或信用卡卡號），否則可能會遭到攻擊者竊取。'," : "'您不应在此网站输入任何敏感信息（例如密码或信用卡号），否则可能会被攻击者窃取。',")
        .replace(/'Connection is secure',/g, useTw ? "'連線安全'," : "'连接安全',")
        .replace(/'Your information \(for example, passwords or credit card numbers\) is '\s*\+\s*'private when it is sent to this site\.',/g,
                 useTw ? "'傳送至此網站的資訊（例如密碼或信用卡卡號）是私密的。'," : "'发送到此网站的信息（例如密码或信用卡号）是私密的。',")
        .replace(/neutral: \['Connection security information is not available for this page'\]/g, useTw ? "neutral: ['無法取得此頁面的連線安全資訊']" : "neutral: ['无法获取此页面的连接安全信息']")
        .replace(/'Certificate is valid' : 'Certificate details'/g, useTw ? "'憑證有效' : '憑證詳細資訊'" : "'证书有效' : '证书详情'")
        .replace(/`Error: \$\{state\.certificateError\}`/g, () => useTw ? '`錯誤：${state.certificateError}`' : '`错误：${state.certificateError}`')
        .replace(/`Issued to: \$\{certificate\.subjectName\}`/g, () => useTw ? '`發給：${certificate.subjectName}`' : '`颁发给：${certificate.subjectName}`')
        .replace(/`Issued by: \$\{certificate\.issuer\}`/g, () => useTw ? '`發證者：${certificate.issuer}`' : '`颁发者：${certificate.issuer}`')
        .replace(/`Valid from: \$\{formatDate\(certificate\.validFromMs\)\}`/g, () => useTw ? '`生效時間：${formatDate(certificate.validFromMs)}`' : '`生效时间：${formatDate(certificate.validFromMs)}`')
        .replace(/`Valid until: \$\{formatDate\(certificate\.validToMs\)\}`/g, () => useTw ? '`有效期限至：${formatDate(certificate.validToMs)}`' : '`有效期至：${formatDate(certificate.validToMs)}`')
        .replace(/`Protocol: \$\{certificate\.protocol\}`/g, () => useTw ? '`協定：${certificate.protocol}`' : '`协议：${certificate.protocol}`')
        .replace(/toLocaleString\(\) : 'unknown'/g, useTw ? "toLocaleString() : '不明'" : "toLocaleString() : '未知'")
        .replace(/\(state\.url \|\| 'This page'\)/g, useTw ? "(state.url || '此頁面')" : "(state.url || '此页面')");
    console.log(`[修改] 連線資訊對話框漢化注入成功！`);
    return out;
}

function patchProvisionSplashJs(psContent, useTw) {
    console.log(`[修改] 正在向 provisionSplash.js 注入 WSL 啟動畫面漢化...`);
    const out = psContent
        .replace(/<div>Setting up WSL: \$\{escapeHtml\(distro\)\}<\/div>/g, useTw ? '<div>正在設定 WSL：${escapeHtml(distro)}</div>' : '<div>正在配置 WSL：${escapeHtml(distro)}</div>');
    console.log(`[修改] WSL 啟動畫面漢化注入成功！`);
    return out;
}

function patchWizardHtmlJs(whContent, useTw) {
    console.log(`[修改] 正在向 wizardHtml.js 注入安裝導覽畫面漢化...`);
    const out = whContent
        .replace(/<html lang="en"/g, '<html lang="zh-TW"')
        .replace('<title>Welcome to Antigravity</title>', useTw ? '<title>歡迎使用 Antigravity</title>' : '<title>欢迎使用 Antigravity</title>')
        .replace('>Setting up…<', useTw ? '>正在設定…<' : '>正在配置…<')
        .replace('<h1>Welcome to the new Antigravity!</h1>', useTw ? '<h1>歡迎來到全新的 Antigravity！</h1>' : '<h1>欢迎来到全新的 Antigravity！</h1>')
        .replace(
            "<p>Antigravity has been redesigned to put agents first with new capabilities. If you'd still like a code editor, you can download it as a separate app named <b>Antigravity IDE</b>.</p>",
            useTw
                ? '<p>Antigravity 已重新設計為以代理為核心並具備全新能力。如果您仍需要程式碼編輯器，可另外下載名為 <b>Antigravity IDE</b> 的獨立應用程式。</p>'
                : '<p>Antigravity 已重新设计为以智能体为核心并带来全新能力。如果您仍需要代码编辑器，可另行下载名为 <b>Antigravity IDE</b> 的独立应用。</p>'
        )
        .replace('<span>Download the Antigravity IDE</span>', useTw ? '<span>下載 Antigravity IDE</span>' : '<span>下载 Antigravity IDE</span>')
        .replace('>Explore the new Antigravity</button>', useTw ? '>探索全新 Antigravity</button>' : '>探索全新 Antigravity</button>');
    console.log(`[修改] 安裝導覽畫面漢化注入成功！`);
    return out;
}

function patchComputerHudJs(hudContent, useTw) {
    console.log(useTw ? `[修改] 正在向 computer/hud.js 注入桌面監視面板漢化...` : `[修改] 正在向 computer/hud.js 注入桌面监视面板汉化...`);
    const out = hudContent
        .replace('<title>AGY Desktop HUD</title>', useTw ? '<title>AGY 桌面監視面板</title>' : '<title>AGY 桌面监视面板</title>')
        .replace('<div id="status">AGY is controlling your Mac</div>', '<div id="status">AGY 正在控制您的 Mac</div>')
        .replace('<button id="stop">Stop</button>', '<button id="stop">停止</button>')
        .replace(
            'title="Let agents use this Mac again. The stopped task does not restart.">Allow again</button>',
            useTw
                ? 'title="允許代理再次使用此 Mac。已停止的任務不會重新啟動。">再次允許</button>'
                : 'title="允许智能体再次使用此 Mac。已停止的任务不会重新启动。">再次允许</button>'
        )
        .replace("end.textContent = 'Stopped';", "end.textContent = '已停止';")
        .replace("end.textContent = 'Stop';", "end.textContent = '停止';");
    console.log(useTw ? `[修改] 桌面監視面板漢化注入成功！` : `[修改] 桌面监视面板汉化注入成功！`);
    return out;
}

function patchComputerHudStateJs(hsContent, useTw) {
    const out = hsContent
        .replace("'You took over — agent stopped'", useTw ? "'您已接管 — 代理已停止'" : "'您已接管 — 智能体已停止'")
        .replace("'Agent stopped'", useTw ? "'代理已停止'" : "'智能体已停止'")
        .replace("'Agent idle'", useTw ? "'代理閒置中'" : "'智能体空闲中'")
        .replace('`AGY working in ${name} (background)`', useTw ? '`AGY 正在背景操作 ${name}`' : '`AGY 正在后台操作 ${name}`')
        .replace("'AGY working in the background'", useTw ? "'AGY 正在背景執行'" : "'AGY 正在后台运行'")
        .replace("'AGY is controlling your Mac'", "'AGY 正在控制您的 Mac'");
    return out;
}

function patchComputerHudAgentsJs(haContent, useTw) {
    const out = haContent
        .replace(
            "`${(0, overlay_1.overlayDisplayName)(label)} · ${app || 'starting'} · ${stopped ? 'stopped' : paused ? 'paused' : m}`",
            useTw
                ? "`${(0, overlay_1.overlayDisplayName)(label)} · ${app || '啟動中'} · ${stopped ? '已停止' : paused ? '已暫停' : (m === 'foreground' ? '前景' : '背景')}`"
                : "`${(0, overlay_1.overlayDisplayName)(label)} · ${app || '启动中'} · ${stopped ? '已停止' : paused ? '已暂停' : (m === 'foreground' ? '前台' : '后台')}`"
        )
        .replace('`${working} AGY agents working`', useTw ? '`${working} 個 AGY 代理執行中`' : '`${working} 个 AGY 智能体工作中`')
        .replace("'Agent stopped'", useTw ? "'代理已停止'" : "'智能体已停止'")
        .replace('`${stopped} agents stopped`', useTw ? '`${stopped} 個代理已停止`' : '`${stopped} 个智能体已停止`')
        .replace('`${text} (+${stopped} stopped)`', '`${text}（+${stopped} 已停止）`');
    return out;
}

function patchSshErrorTextJs(seContent, useTw) {
    return seContent
        .replace("'The connection was closed before it finished.'", useTw ? "'連線在完成前即被關閉。'" : "'连接在完成前被关闭。'")
        .replace(
            "`Windows SSH hosts aren't supported yet. ${sshArgs_1.LINUX_HOST_NEEDED}`",
            useTw ? '`尚未支援 Windows SSH 主機。${sshArgs_1.LINUX_HOST_NEEDED}`' : '`暂不支持 Windows SSH 主机。${sshArgs_1.LINUX_HOST_NEEDED}`'
        )
        // SSH 錯誤對話框細節欄的標籤
        .split('`Error code: ${err.code}\\nLogs: ${logPath()}`')
        .join(useTw ? '`錯誤代碼：${err.code}\\n記錄檔：${logPath()}`' : '`错误代码：${err.code}\\n日志：${logPath()}`')
        .split('`${text}\\nLogs: ${logPath()}`')
        .join(useTw ? '`${text}\\n記錄檔：${logPath()}`' : '`${text}\\n日志：${logPath()}`')
        .split('`${label} reported: ${text}`')
        .join(useTw ? '`${label} 回報：${text}`' : '`${label} 报告：${text}`');
}

function patchRemoteDisconnectedPageJs(dcContent, useTw) {
    console.log(useTw ? `[修改] 正在向 remote/disconnectedPage.js 注入遠端斷線頁面漢化...` : `[修改] 正在向 remote/disconnectedPage.js 注入远程断开页面汉化...`);
    const out = dcContent
        .replace(/<html lang="en">/g, '<html lang="zh-TW">')
        .replace(/reconnect:\s*'Reconnect',/g, useTw ? "reconnect: '重新連線'," : "reconnect: '重新连接',")
        .replace(/stop:\s*'Stop Server',/g, useTw ? "stop: '停止伺服器'," : "stop: '停止服务',")
        .replace(/close:\s*'Close',/g, useTw ? "close: '關閉'," : "close: '关闭',")
        .replace(/\?\s*'Restarting…'/g, useTw ? "? '正在重新啟動…'" : "? '正在重启…'")
        .replace(/\?\s*'Reconnecting…'/g, useTw ? "? '正在重新連線…'" : "? '正在重新连接…'")
        .replace(/:\s*'Disconnected';/g, useTw ? ": '已中斷連線';" : ": '已断开连接';")
        .replace(/\?\s*`Restarting the Antigravity server on \$\{host\}…`/g, useTw ? "? `正在重新啟動 ${host} 上的 Antigravity 伺服器…`" : "? `正在重启 ${host} 上的 Antigravity 服务…`")
        .replace(/\?\s*`Reconnecting to \$\{host\}…`/g, useTw ? "? `正在重新連線至 ${host}…`" : "? `正在重新连接到 ${host}…`")
        .replace(/:\s*`Disconnected from \$\{host\}`;/g, useTw ? ": `已中斷與 ${host} 的連線`;" : ": `已断开与 ${host} 的连接`;")
        .replace(/\?\s*'This window opens it again once it has started\.'/g, useTw ? "? '伺服器啟動完成後，此視窗將自動重新開啟。'" : "? '服务启动完成后，此窗口将自动重新打开。'")
        .replace(/\?\s*`Its server on \$\{host\} stopped, and its agents with it\.`/g, useTw ? "? `其在 ${host} 上的伺服器已停止，相關的代理也已隨之停止。`" : "? `其在 ${host} 上的服务已停止，相关的智能体也已随之停止。`")
        .replace(/:\s*`Agents keep running on \$\{host\}\.`/g, useTw ? ": `代理仍在 ${host} 上繼續執行。`" : ": `智能体仍在 ${host} 上继续运行。`")
        .replace(/\?\s*`Its agents on \$\{host\} stopped with it\.`/g, useTw ? "? `其在 ${host} 上的代理已隨之停止。`" : "? `其在 ${host} 上的智能体已随之停止。`")
        .replace(/:\s*`Agents keep running on \$\{host\} unless its server stopped\.`;/g, useTw ? ": `除非其伺服器已停止，否則代理仍在 ${host} 上繼續執行。`;" : ": `除非其服务已停止，否则智能体仍在 ${host} 上继续运行。`;");
    console.log(useTw ? `[修改] 遠端斷線頁面漢化注入成功！` : `[修改] 远程断开页面汉化注入成功！`);
    return out;
}

function patchRemoteSignInCallbackJs(cbContent, useTw) {
    console.log(useTw ? `[修改] 正在向 remote/signInCallback.js 注入登入回呼頁面漢化...` : `[修改] 正在向 remote/signInCallback.js 注入登录回调页面汉化...`);
    const out = cbContent
        .replace(/<html lang="en">/g, '<html lang="zh-TW">')
        .replace(
            "const SIGNED_IN = page('You have successfully authenticated.', 'You can close this tab and return to Antigravity.');",
            useTw
                ? "const SIGNED_IN = page('您已成功完成身分驗證。', '您可以關閉此分頁並返回 Antigravity。');"
                : "const SIGNED_IN = page('您已成功完成身份验证。', '您可以关闭此标签页并返回 Antigravity。');"
        )
        .replace(
            'return page("Sign-in didn\'t finish", `Antigravity couldn\'t reach ${host} to finish signing in. ` +',
            useTw
                ? "return page('登入未完成', `Antigravity 無法連線至 ${host} 以完成登入。` +"
                : "return page('登录未完成', `Antigravity 无法连接到 ${host} 以完成登录。` +"
        )
        .replace(
            'return page("Sign-in didn\'t finish", \'This sign-in came back from another server than the sign-in page you \' +',
            useTw
                ? "return page('登入未完成', '此登入回呼來自與您先前同意的登入頁不同的伺服器，' +"
                : "return page('登录未完成', '此登录回调来自与您此前同意的登录页不同的服务器，' +"
        )
        .replace(
            '`agreed to, so Antigravity didn\'t pass it on to ${host}.`);',
            useTw
                ? "`因此 Antigravity 未將其傳遞給 ${host}。`);"
                : "`因此 Antigravity 未将其传递给 ${host}。`);"
        )
        .replace(
            'return page("Sign-in didn\'t finish", `Antigravity on ${host} couldn\'t finish signing in (HTTP ${status}). ` +',
            useTw
                ? "return page('登入未完成', `${host} 上的 Antigravity 無法完成登入 (HTTP ${status})。` +"
                : "return page('登录未完成', `${host} 上的 Antigravity 无法完成登录 (HTTP ${status})。` +"
        )
        // 2.35.1 的無法連線頁與 HTTP 錯誤頁都以這句結尾，需全部替換
        .replaceAll(
            "'Sign in again from Antigravity.');",
            useTw ? "'請從 Antigravity 重新進行登入。');" : "'请从 Antigravity 重新发起登录。');"
        );
    console.log(useTw ? `[修改] 登入回呼頁面漢化注入成功！` : `[修改] 登录回调页面汉化注入成功！`);
    return out;
}

function patchBrowserStreamCapturePageJs(cpContent, useTw) {
    console.log(useTw ? `[修改] 正在向 browserStream/capturePage.js 注入串流擷取頁面漢化...` : `[修改] 正在向 browserStream/capturePage.js 注入流媒体捕获页面汉化...`);
    const out = cpContent
        .replace('<title>Browser Stream Capture</title>', useTw ? '<title>瀏覽器串流擷取</title>' : '<title>浏览器串流捕获</title>')
        .replace("'Capture session failed'", useTw ? "'擷取工作階段失敗'" : "'捕获会话失败'");
    console.log(useTw ? `[修改] 串流擷取頁面漢化注入成功！` : `[修改] 流媒体捕获页面汉化注入成功！`);
    return out;
}

// 2.35.1 起：用手機或平板登入通行金鑰時的 QR 碼視窗
function patchCablev2Js(cbContent, useTw) {
    console.log(useTw ? `[修改] 正在向 cablev2.js 注入通行金鑰掃碼視窗漢化...` : `[修改] 正在向 cablev2.js 注入通行密钥扫码窗口汉化...`);
    const out = cbContent
        .replace(/<html lang="en">/g, '<html lang="zh-TW">')
        .replace('<title>Passkeys</title>', useTw ? '<title>通行金鑰</title>' : '<title>通行密钥</title>')
        .replace('<h1 class="sheet-title">Passkeys</h1>', useTw ? '<h1 class="sheet-title">通行金鑰</h1>' : '<h1 class="sheet-title">通行密钥</h1>')
        .replace('<p class="mechanism-header">Use your phone or tablet</p>', useTw ? '<p class="mechanism-header">使用手機或平板電腦</p>' : '<p class="mechanism-header">使用手机或平板电脑</p>')
        .replace('>Scan this QR code with the camera on the device that has your passkey for ${safeRpId}</p>', () => useTw
            ? '>請使用存有 ${safeRpId} 通行金鑰的裝置，以相機掃描此 QR 碼</p>'
            : '>请使用存有 ${safeRpId} 通行密钥的设备，用摄像头扫描此二维码</p>')
        .replace('onclick="window.close()">Cancel</button>', useTw ? 'onclick="window.close()">取消</button>' : 'onclick="window.close()">取消</button>')
        .replace(/title:\s*'Passkeys'/g, useTw ? "title: '通行金鑰'" : "title: '通行密钥'")
        .replace("updateStatus('Connecting to your device…')", useTw ? "updateStatus('正在連線至您的裝置…')" : "updateStatus('正在连接到您的设备…')")
        .replace("updateStatus('Verify on your device to continue…')", useTw ? "updateStatus('請在您的裝置上完成驗證以繼續…')" : "updateStatus('请在您的设备上完成验证以继续…')");
    console.log(useTw ? `[修改] 通行金鑰掃碼視窗漢化注入成功！` : `[修改] 通行密钥扫码窗口汉化注入成功！`);
    return out;
}

function patchQrEncoderJs(qrContent, useTw) {
    return qrContent.replace('aria-label="Passkey QR code"', useTw ? 'aria-label="通行金鑰 QR 碼"' : 'aria-label="通行密钥二维码"');
}

// v2.35.1 SSH 遠端連線流程與 WSL 開啟提示的介面文字。每列 [原文, 簡中, 繁中]；
// 原文須與原檔逐字相同，對不到的列直接略過。給 AI 代理看的錯誤碼訊息與只寫入記錄檔的字串保留英文。
const REMOTE_TEXT_TABLES = {
    // 連線失敗對話框與斷線頁面的錯誤說明
    "dist/remote/sshArgs.js": [
        ["'Antigravity needs a Linux host on x64 or arm64 with glibc 2.26 or newer.'", "'Antigravity 需要使用 glibc 2.26 或更高版本、x64 或 arm64 架构的 Linux 主机。'", "'Antigravity 需要使用 glibc 2.26 以上版本、x64 或 arm64 架構的 Linux 主機。'"],
        ["`Couldn't connect to the SSH host (${String(code)}).`", "`无法连接到 SSH 主机（${String(code)}）。`", "`無法連線至 SSH 主機（${String(code)}）。`"],
        ["'SSH authentication failed. Check your password, code or keys, then try again.'", "'SSH 身份验证失败。请检查密码、验证码或密钥，然后重试。'", "'SSH 驗證失敗。請檢查密碼、驗證碼或金鑰，然後再試一次。'"],
        ["'SSH authentication failed. Click Reconnect to sign in again.'", "'SSH 身份验证失败。请点击“重新连接”再次登录。'", "'SSH 驗證失敗。請按一下「重新連線」再次登入。'"],
        ["\"SSH authentication failed. Antigravity can't answer password or code prompts on Windows yet: set up key-based login with ssh-agent, then try again.\"", "'SSH 身份验证失败。Antigravity 目前在 Windows 上还无法应答密码或验证码提示：请用 ssh-agent 设置密钥登录，然后重试。'", "'SSH 驗證失敗。Antigravity 目前在 Windows 上還無法回應密碼或驗證碼提示：請用 ssh-agent 設定金鑰登入，然後再試一次。'"],
        ["\"That SSH host isn't valid. Enter an alias from your SSH config or a host like user@host or user@host:2222.\"", "'该 SSH 主机无效。请输入 SSH 配置中的别名，或 user@host、user@host:2222 这类主机。'", "'這個 SSH 主機無效。請輸入 SSH 設定中的別名，或 user@host、user@host:2222 這類主機。'"],
        ["\"The host's SSH key is unknown or has changed. Save it with ssh in a terminal. If it changed, ask the host's owner first: the connection may be intercepted.\"", "'主机的 SSH 密钥未知或已更改。请在终端中用 ssh 保存该密钥。如果密钥已更改，请先询问主机所有者：连接可能已被拦截。'", "'主機的 SSH 金鑰不明或已變更。請在終端機中用 ssh 儲存此金鑰。如果金鑰已變更，請先詢問主機擁有者：連線可能遭到攔截。'"],
        ["\"The host's SSH key has changed or isn't trusted. If it changed, ask the host's owner first: the connection may be intercepted.\"", "'主机的 SSH 密钥已更改或不受信任。如果密钥已更改，请先询问主机所有者：连接可能已被拦截。'", "'主機的 SSH 金鑰已變更或未受信任。如果金鑰已變更，請先詢問主機擁有者：連線可能遭到攔截。'"],
        ["`Couldn't connect to the SSH host. Check its name, your network and ssh config (e.g. a ProxyCommand), and that ssh to it works in a terminal${prompts === 'no' ? ' without a prompt' : ''}.`", "`无法连接到 SSH 主机。请检查主机名、网络和 ssh 配置（例如 ProxyCommand），并确认在终端中${prompts === 'no' ? '无需任何提示即可' : '可以'}用 ssh 连接到该主机。`", "`無法連線至 SSH 主機。請檢查主機名稱、網路與 ssh 設定（例如 ProxyCommand），並確認在終端機中${prompts === 'no' ? '不需任何提示就能' : '可以'}用 ssh 連線至該主機。`"],
        ["\"SSH can't use your SSH config file. Fix the problem ssh reports, or choose another config file.\"", "'SSH 无法使用您的 SSH 配置文件。请修复 ssh 报告的问题，或选择其他配置文件。'", "'SSH 無法使用您的 SSH 設定檔。請修正 ssh 回報的問題，或選擇其他設定檔。'"],
        ["'SSH port forwarding failed. Make sure the server allows TCP forwarding (AllowTcpForwarding) for your account, then try again.'", "'SSH 端口转发失败。请确认服务器允许您的账户使用 TCP 转发（AllowTcpForwarding），然后重试。'", "'SSH 連接埠轉送失敗。請確認伺服器允許您的帳戶使用 TCP 轉送（AllowTcpForwarding），然後再試一次。'"],
        ["`The SSH host isn't supported. ${exports.LINUX_HOST_NEEDED} Windows and macOS hosts aren't supported yet.`", "`不支持该 SSH 主机。${exports.LINUX_HOST_NEEDED}目前尚不支持 Windows 和 macOS 主机。`", "`不支援這個 SSH 主機。${exports.LINUX_HOST_NEEDED}目前尚未支援 Windows 與 macOS 主機。`"],
        ["'Another host that shares your home directory runs the Antigravity server. Connect to that host, or connect again and choose Take Over.'", "'另一台共享您主目录的主机正在运行 Antigravity 服务器。请连接到那台主机，或重新连接并选择“接管”。'", "'另一台共用您家目錄的主機正在執行 Antigravity 伺服器。請連線至那台主機，或重新連線並選擇「接管」。'"],
        ["\"Couldn't install the Antigravity server on the SSH host. Make sure it has free disk space, and that it or this computer can download from the internet.\"", "'无法在 SSH 主机上安装 Antigravity 服务器。请确认主机有可用的磁盘空间，并且主机或这台电脑能从互联网下载。'", "'無法在 SSH 主機上安裝 Antigravity 伺服器。請確認主機有可用的磁碟空間，且主機或這台電腦能從網際網路下載。'"],
        ["`The Antigravity server failed to start on the SSH host. See its log in ~/${types_1.REMOTE_INSTALL_ROOT}/data on that host.`", "`Antigravity 服务器无法在 SSH 主机上启动。请查看该主机 ~/${types_1.REMOTE_INSTALL_ROOT}/data 中的日志。`", "`Antigravity 伺服器無法在 SSH 主機上啟動。請查看該主機 ~/${types_1.REMOTE_INSTALL_ROOT}/data 中的記錄檔。`"],
        ["'The Antigravity server on the SSH host stopped. Reconnect to start it again.'", "'SSH 主机上的 Antigravity 服务器已停止。请重新连接以再次启动。'", "'SSH 主機上的 Antigravity 伺服器已停止。請重新連線以再次啟動。'"],
        ["'The SSH connection closed. Check your network connection, then reconnect.'", "'SSH 连接已关闭。请检查网络连接，然后重新连接。'", "'SSH 連線已關閉。請檢查網路連線，然後重新連線。'"],
        ["'The connection was cancelled.'", "'连接已取消。'", "'已取消連線。'"],
        ["\"Couldn't connect to the SSH host. Try ssh to it in a terminal, and see the Antigravity log for details.\"", "'无法连接到 SSH 主机。请在终端中尝试用 ssh 连接，并查看 Antigravity 日志了解详情。'", "'無法連線至 SSH 主機。請在終端機中試著用 ssh 連線，並查看 Antigravity 記錄檔了解詳情。'"]
    ],
    // 連線畫面的進度狀態，以及對話框顯示的錯誤訊息（只寫入記錄檔的字串不翻）
    "dist/remote/sshConnection.js": [
        ["`Connecting to ${this.label}…`", "`正在连接到 ${this.label}…`", "`正在連線至 ${this.label}…`"],
        ["'Waiting for your answer…'", "'正在等待您的回答…'", "'正在等待您的回應…'"],
        ["`Uploading the Antigravity server to ${this.label}…`", "`正在将 Antigravity 服务器上传到 ${this.label}…`", "`正在將 Antigravity 伺服器上傳至 ${this.label}…`"],
        ["`Connecting to the Antigravity server on ${this.label}…`", "`正在连接 ${this.label} 上的 Antigravity 服务器…`", "`正在連線至 ${this.label} 上的 Antigravity 伺服器…`"],
        ["`Checking ${label}…`", "`正在检查 ${label}…`", "`正在檢查 ${label}…`"],
        ["`Waiting for another window to finish installing on ${label}…`", "`正在等待另一个窗口在 ${label} 上完成安装…`", "`正在等待另一個視窗在 ${label} 上完成安裝…`"],
        ["`Replacing an invalid server binary on ${label}…`", "`正在替换 ${label} 上无效的服务器程序…`", "`正在替換 ${label} 上無效的伺服器執行檔…`"],
        ["`Downloading the Antigravity server on ${label}…`", "`正在 ${label} 上下载 Antigravity 服务器…`", "`正在 ${label} 上下載 Antigravity 伺服器…`"],
        ["`Installed the Antigravity server on ${label}.`", "`已在 ${label} 上安装 Antigravity 服务器。`", "`已在 ${label} 上安裝 Antigravity 伺服器。`"],
        ["`Starting the Antigravity server on ${label}…`", "`正在 ${label} 上启动 Antigravity 服务器…`", "`正在 ${label} 上啟動 Antigravity 伺服器…`"],
        ["`Connecting to the running server on ${label}…`", "`正在连接 ${label} 上运行中的服务器…`", "`正在連線至 ${label} 上執行中的伺服器…`"],
        ["`Restarting the Antigravity server on ${label}…`", "`正在重启 ${label} 上的 Antigravity 服务器…`", "`正在重新啟動 ${label} 上的 Antigravity 伺服器…`"],
        ["`Checking whether another host still runs your Antigravity server…`", "`正在检查是否还有其他主机在运行您的 Antigravity 服务器…`", "`正在檢查是否仍有其他主機在執行您的 Antigravity 伺服器…`"],
        ["`Moving the Antigravity server to ${label}…`", "`正在将 Antigravity 服务器移至 ${label}…`", "`正在將 Antigravity 伺服器移至 ${label}…`"],
        ["`Timed out connecting to ${this.label}.`", "`连接 ${this.label} 超时。`", "`連線至 ${this.label} 逾時。`"],
        ["'Connection cancelled.'", "'连接已取消。'", "'已取消連線。'"],
        ["'Not connected.'", "'未连接。'", "'尚未連線。'"],
        ["exports.PROMPT_CANCELLED = 'Sign-in cancelled.';", "exports.PROMPT_CANCELLED = '已取消登录。';", "exports.PROMPT_CANCELLED = '已取消登入。';"],
        ["`The Antigravity server on ${this.label} has no HTTP port to stop it through.`", "`${this.label} 上的 Antigravity 服务器没有可用于停止它的 HTTP 端口。`", "`${this.label} 上的 Antigravity 伺服器沒有可用來停止它的 HTTP 連接埠。`"],
        ["`The Antigravity server on ${this.label} refused to stop (HTTP ${status}).`", "`${this.label} 上的 Antigravity 服务器拒绝停止（HTTP ${status}）。`", "`${this.label} 上的 Antigravity 伺服器拒絕停止（HTTP ${status}）。`"],
        ["`Could not confirm that the Antigravity server on ${this.label} stopped` +", "`无法确认 ${this.label} 上的 Antigravity 服务器已停止` +", "`無法確認 ${this.label} 上的 Antigravity 伺服器已停止` +"],
        ["(rpcError ? ` (${this.redact((0, types_1.sanitizeRemoteText)(rpcError))}).` : '.')", "(rpcError ? `（${this.redact((0, types_1.sanitizeRemoteText)(rpcError))}）。` : '。')", "(rpcError ? `（${this.redact((0, types_1.sanitizeRemoteText)(rpcError))}）。` : '。')"],
        ["why = 'it has no HTTP port';", "why = '它没有 HTTP 端口';", "why = '它沒有 HTTP 連接埠';"],
        ["why = 'an invalid answer';", "why = '响应无效';", "why = '回應無效';"],
        ["`The Antigravity server on ${this.label} didn't give this window a sign-in token (${why}).`", "`${this.label} 上的 Antigravity 服务器没有给此窗口登录令牌（${why}）。`", "`${this.label} 上的 Antigravity 伺服器沒有提供此視窗的登入權杖（${why}）。`"],
        ["`${this.label} did not start the setup within ${Math.round(firstLineMs / 1000)} s. ` +", "`${this.label} 未在 ${Math.round(firstLineMs / 1000)} 秒内开始设置。` +", "`${this.label} 未在 ${Math.round(firstLineMs / 1000)} 秒內開始設定。` +"],
        ["'ssh (e.g. a ProxyCommand or ProxyJump login) or a command in ' +", "'可能是 ssh（例如 ProxyCommand 或 ProxyJump 登录）或 ' +", "'可能是 ssh（例如 ProxyCommand 或 ProxyJump 登入）或 ' +"],
        ["'your shell startup files (e.g. ~/.bashrc) may be waiting for input.'", "'shell 启动文件（例如 ~/.bashrc）中的命令正在等待输入。'", "'shell 啟動檔（例如 ~/.bashrc）中的指令正在等待輸入。'"],
        ["\"Couldn't answer ssh's prompt.\"", "'无法应答 ssh 的提示。'", "'無法回應 ssh 的提示。'"],
        ["`Could not run \"${sshBin}\". Install OpenSSH or set ANTIGRAVITY_SSH_BIN.`", "`无法运行“${sshBin}”。请安装 OpenSSH 或设置 ANTIGRAVITY_SSH_BIN。`", "`無法執行「${sshBin}」。請安裝 OpenSSH 或設定 ANTIGRAVITY_SSH_BIN。`"],
        ["`Could not run ssh: ${err.message}`", "`无法运行 ssh：${err.message}`", "`無法執行 ssh：${err.message}`"],
        ["`ssh could not listen on its SOCKS port ${this.socksPort}.`", "`ssh 无法监听其 SOCKS 端口 ${this.socksPort}。`", "`ssh 無法監聽其 SOCKS 連接埠 ${this.socksPort}。`"],
        ["`${this.label} asked for an upload it can't need.`", "`${this.label} 请求了不必要的上传。`", "`${this.label} 要求了不必要的上傳。`"],
        ["`${this.label} sent a line longer than ${MAX_LINE_CHARS} characters.`", "`${this.label} 发送的单行超过 ${MAX_LINE_CHARS} 个字符。`", "`${this.label} 傳送的單行超過 ${MAX_LINE_CHARS} 個字元。`"],
        ["`Neither ${this.label} nor this computer could download the Antigravity server: ${errorMessage(err)}`", "`${this.label} 和这台电脑都无法下载 Antigravity 服务器：${errorMessage(err)}`", "`${this.label} 與這台電腦都無法下載 Antigravity 伺服器：${errorMessage(err)}`"],
        ["`The Antigravity server on ${this.label} stopped.`", "`${this.label} 上的 Antigravity 服务器已停止。`", "`${this.label} 上的 Antigravity 伺服器已停止。`"],
        ["`The connection to ${this.label} was lost: ${describeExit(code, signal, this.stderrTail)}`", "`与 ${this.label} 的连接已中断：${describeExit(code, signal, this.stderrTail)}`", "`與 ${this.label} 的連線已中斷：${describeExit(code, signal, this.stderrTail)}`"],
        ["'The SSH server does not allow port forwarding (AllowTcpForwarding).'", "'SSH 服务器不允许端口转发（AllowTcpForwarding）。'", "'SSH 伺服器不允許連接埠轉送（AllowTcpForwarding）。'"],
        ["`The Antigravity server on ${this.label} did not respond through the SSH tunnel (${(0, types_1.sanitizeRemoteText)(lastErr, 200)}).`", "`${this.label} 上的 Antigravity 服务器未通过 SSH 隧道响应（${(0, types_1.sanitizeRemoteText)(lastErr, 200)}）。`", "`${this.label} 上的 Antigravity 伺服器未透過 SSH 通道回應（${(0, types_1.sanitizeRemoteText)(lastErr, 200)}）。`"],
        ["`${this.label} asked to open a sign-in at ${origin} that can't finish on that host, so it was not opened.`", "`${this.label} 要求打开 ${origin} 的登录，但该登录无法在那台主机上完成，因此未打开。`", "`${this.label} 要求開啟 ${origin} 的登入，但該登入無法在那台主機上完成，因此未開啟。`"],
        ["`The sign-in request of the Antigravity server on ${this.label} doesn't match what this app expects, so it was not opened. ` +", "`${this.label} 上的 Antigravity 服务器发出的登录请求与此应用的预期不符，因此未打开。` +", "`${this.label} 上的 Antigravity 伺服器發出的登入要求與此應用程式的預期不符，因此未開啟。` +"],
        ["'Update Antigravity, or restart the server on that host.'", "'请更新 Antigravity，或重启那台主机上的服务器。'", "'請更新 Antigravity，或重新啟動那台主機上的伺服器。'"],
        ["`Local port ${port} is in use, so the sign-in callback can't ` +", "`本地端口 ${port} 已被占用，登录回调无法` +", "`本機連接埠 ${port} 已被占用，登入回呼無法` +"],
        ["`reach ${this.label}. Close the program using it and sign in again. ` +", "`到达 ${this.label}。请关闭占用该端口的程序，然后重新登录。` +", "`抵達 ${this.label}。請關閉占用該連接埠的程式，然後重新登入。` +"],
        ["'The connection was closed.'", "'连接已关闭。'", "'連線已關閉。'"],
        ["'Could not get a free loopback port.'", "'无法取得可用的回环端口。'", "'無法取得可用的回送連接埠。'"],
        ["const how = signal ? `signal ${signal}` : `exit code ${code}`;", "const how = signal ? `信号 ${signal}` : `退出代码 ${code}`;", "const how = signal ? `訊號 ${signal}` : `結束代碼 ${code}`;"],
        ["? `ssh exited (${how}): ${(0, types_1.sanitizeRemoteText)(lastLine, 300)}`", "? `ssh 已退出（${how}）：${(0, types_1.sanitizeRemoteText)(lastLine, 300)}`", "? `ssh 已結束（${how}）：${(0, types_1.sanitizeRemoteText)(lastLine, 300)}`"],
        [": `ssh exited (${how}).`", ": `ssh 已退出（${how}）。`", ": `ssh 已結束（${how}）。`"]
    ],
    // SSH 主機輸入框的格式驗證
    "dist/remote/sshDestination.js": [
        ["'The user name before \"@\" is missing.'", "'缺少“@”前面的用户名。'", "'缺少「@」前面的使用者名稱。'"],
        ["'The user name must not start with \"-\".'", "'用户名不能以“-”开头。'", "'使用者名稱不得以「-」開頭。'"],
        ["`\"${shown}\" isn't a valid user name.`", "`“${shown}”不是有效的用户名。`", "`「${shown}」不是有效的使用者名稱。`"],
        ["'The host name is missing.'", "'缺少主机名。'", "'缺少主機名稱。'"],
        ["'The host name must not start with \"-\".'", "'主机名不能以“-”开头。'", "'主機名稱不得以「-」開頭。'"],
        ["`\"${host}\" isn't a valid host name.`", "`“${host}”不是有效的主机名。`", "`「${host}」不是有效的主機名稱。`"],
        ["`Invalid port \"${port}\": use a number from 1 to 65535.`", "`端口“${port}”无效：请使用 1 到 65535 之间的数字。`", "`連接埠「${port}」無效：請使用 1 到 65535 之間的數字。`"],
        ["`\"${addr}\" isn't a valid IPv6 address. Write an IPv6 address with a port in brackets, for example [::1]:2222.`", "`“${addr}”不是有效的 IPv6 地址。带端口的 IPv6 地址请用方括号括起，例如 [::1]:2222。`", "`「${addr}」不是有效的 IPv6 位址。帶連接埠的 IPv6 位址請用方括號括住，例如 [::1]:2222。`"],
        ["`Missing \"]\" after the IPv6 address in \"${hostPort}\".`", "`“${hostPort}”中的 IPv6 地址后缺少“]”。`", "`「${hostPort}」中的 IPv6 位址後缺少「]」。`"],
        ["`Invalid percent-encoding in the user name \"${s}\".`", "`用户名“${s}”中的百分号编码无效。`", "`使用者名稱「${s}」中的百分比編碼無效。`"],
        ["'Write \"@\" inside the user name of an ssh:// URI as %40.'", "'ssh:// URI 的用户名中如有“@”，请写成 %40。'", "'ssh:// URI 的使用者名稱中若有「@」，請寫成 %40。'"],
        ["'Write an IPv6 address in an ssh:// URI in brackets, for example ssh://[::1]:2222.'", "'ssh:// URI 中的 IPv6 地址请用方括号括起，例如 ssh://[::1]:2222。'", "'ssh:// URI 中的 IPv6 位址請用方括號括住，例如 ssh://[::1]:2222。'"],
        ["'Enter an SSH host, for example \"devbox\" or \"user@host:2222\".'", "'请输入 SSH 主机，例如“devbox”或“user@host:2222”。'", "'請輸入 SSH 主機，例如「devbox」或「user@host:2222」。'"],
        ["`The SSH host is too long (at most ${MAX_DESTINATION_LENGTH} characters).`", "`SSH 主机过长（最多 ${MAX_DESTINATION_LENGTH} 个字符）。`", "`SSH 主機過長（最多 ${MAX_DESTINATION_LENGTH} 個字元）。`"],
        ["'The SSH host must not start with \"-\".'", "'SSH 主机不能以“-”开头。'", "'SSH 主機不得以「-」開頭。'"],
        ["'The SSH host must not contain spaces or control characters.'", "'SSH 主机不能包含空格或控制字符。'", "'SSH 主機不得包含空格或控制字元。'"],
        ["`The SSH host must not contain ${describeChar(bad[0])}.`", "`SSH 主机不能包含 ${describeChar(bad[0])}。`", "`SSH 主機不得包含 ${describeChar(bad[0])}。`"]
    ],
    // SSH 設定檔的檢查結果（依中文語序改寫句型）
    "dist/remote/sshConfigHosts.js": [
        ["`The SSH config file ${problem}`", "`SSH 配置文件${problem}`", "`SSH 設定檔${problem}`"],
        ["`${shown} isn't a file.`", "`（${shown}）不是文件。`", "`（${shown}）不是檔案。`"],
        ["`${shown} can be changed by others: it must be yours or root's, and not group- or world-writable.`", "`（${shown}）可被他人修改：它必须属于您或 root，且不能允许用户组或所有人写入。`", "`（${shown}）可被他人修改：它必須屬於您或 root，且不得開放群組或所有人寫入。`"],
        ["const NOT_CONFIG = \"isn't an SSH config file\";", "const NOT_CONFIG = '不是 SSH 配置文件';", "const NOT_CONFIG = '不是 SSH 設定檔';"],
        ["const CHOOSE_CONFIG = 'Choose a file of ssh settings, such as ~/.ssh/config.';", "const CHOOSE_CONFIG = '请选择 ssh 配置文件，例如 ~/.ssh/config。';", "const CHOOSE_CONFIG = '請選擇 ssh 設定檔，例如 ~/.ssh/config。';"],
        ["const UNREADABLE = \"is saved in a way ssh can't read\";", "const UNREADABLE = '的保存格式 ssh 无法读取';", "const UNREADABLE = '的儲存格式 ssh 無法讀取';"],
        ["const SAVE_AS_UTF8 = 'Save it as UTF-8 without a byte-order mark.';", "const SAVE_AS_UTF8 = '请另存为不带字节顺序标记（BOM）的 UTF-8。';", "const SAVE_AS_UTF8 = '請另存為不含位元組順序標記（BOM）的 UTF-8。';"],
        ["notConfig(\"it's a binary file\")", "notConfig('这是二进制文件')", "notConfig('這是二進位檔案')"],
        ["notConfig('it holds a key or certificate')", "notConfig('其中包含密钥或证书')", "notConfig('其中包含金鑰或憑證')"],
        ["notConfig('it holds SSH public keys, like a .pub or authorized_keys file')", "notConfig('其中包含 SSH 公钥，例如 .pub 或 authorized_keys 文件')", "notConfig('其中包含 SSH 公開金鑰，例如 .pub 或 authorized_keys 檔案')"],
        ["notConfig('it lists SSH host keys, like known_hosts')", "notConfig('其中列出 SSH 主机密钥，例如 known_hosts')", "notConfig('其中列出 SSH 主機金鑰，例如 known_hosts')"],
        ["why: 'it starts with a byte-order mark',", "why: '它以字节顺序标记（BOM）开头',", "why: '它以位元組順序標記（BOM）開頭',"],
        ["why: \"it's saved as UTF-16\",", "why: '它以 UTF-16 保存',", "why: '它以 UTF-16 儲存',"],
        ["return `${file} ${what}: ${why}. ${fix}`;", "return `${file} ${what}：${why}。${fix}`;", "return `${file} ${what}：${why}。${fix}`;"],
        ["invalid('must be a path on one line.')", "invalid('必须是单行路径。')", "invalid('必須是單行路徑。')"],
        ["`must be an absolute path (got ${shown}).`", "`必须是绝对路径（当前为 ${shown}）。`", "`必須是絕對路徑（目前為 ${shown}）。`"],
        ["`must be on one of this computer's drives (got ${shown}).`", "`必须位于这台电脑的磁盘上（当前为 ${shown}）。`", "`必須位於這台電腦的磁碟機上（目前為 ${shown}）。`"],
        ["`can't be on a network share (${shown}).`", "`不能位于网络共享上（${shown}）。`", "`不得位於網路共用資料夾（${shown}）。`"],
        ["`${shown} doesn't exist or can't be read.`", "`（${shown}）不存在或无法读取。`", "`（${shown}）不存在或無法讀取。`"],
        ["`${shown} is now a link: choose the file again.`", "`（${shown}）现在是链接：请重新选择文件。`", "`（${shown}）現在是連結：請重新選擇檔案。`"],
        ["`${shown} is over 4 MiB.`", "`（${shown}）超过 4 MiB。`", "`（${shown}）超過 4 MiB。`"]
    ],
    // 連線前的主機與設定檔路徑檢查
    "dist/remote/sshBridge.js": [
        ["'The SSH config file must be a path of at most 4 KiB.'", "'SSH 配置文件路径最长 4 KiB。'", "'SSH 設定檔路徑最長 4 KiB。'"],
        ["'Enter an SSH host, for example \"devbox\" or \"user@host\".'", "'请输入 SSH 主机，例如“devbox”或“user@host”。'", "'請輸入 SSH 主機，例如「devbox」或「user@host」。'"]
    ],
    // Windows：在 WSL 中開啟資料夾時的提示
    "dist/wsl.js": [
        ["`This folder belongs to the WSL distro \"${unc[1]}\", but this window is connected to \"${distro}\".`", "`此文件夹属于 WSL 发行版“${unc[1]}”，但此窗口连接的是“${distro}”。`", "`此資料夾屬於 WSL 發行版「${unc[1]}」，但此視窗連線的是「${distro}」。`"],
        ["'This folder is on the Windows filesystem. Accessing it from WSL (via /mnt) can be slow — for best performance keep projects inside the WSL filesystem.'", "'此文件夹位于 Windows 文件系统中。从 WSL（通过 /mnt）访问可能较慢；为获得最佳性能，请将项目放在 WSL 文件系统中。'", "'此資料夾位於 Windows 檔案系統。從 WSL（透過 /mnt）存取可能較慢；為了最佳效能，請將專案放在 WSL 檔案系統中。'"],
        ["`This location cannot be opened in WSL: ${winPath}`", "`无法在 WSL 中打开此位置：${winPath}`", "`無法在 WSL 中開啟此位置：${winPath}`"]
    ]
};

function patchRemoteTextJs(relPath, content, useTw) {
    let out = content;
    let hits = 0;
    for (const [needle, sc, tc] of REMOTE_TEXT_TABLES[relPath] || []) {
        if (!out.includes(needle)) continue;
        out = out.split(needle).join(useTw ? tc : sc);
        hits++;
    }
    if (hits > 0) {
        console.log(useTw ? `[修改] 已向 ${relPath} 注入遠端連線訊息漢化（${hits} 處）` : `[修改] 已向 ${relPath} 注入远程连接消息汉化（${hits} 处）`);
    }
    return out;
}

const MAIN_PROCESS_PATCH_TARGETS = [
    'dist/main.js',
    'dist/ipcHandlers.js',
    'dist/remote/remoteManager.js',
    'dist/remote/sshPrompts.js',
    'dist/remote/sshErrorText.js',
    'dist/remote/disconnectedPage.js',
    'dist/remote/signInCallback.js',
    'dist/deviceChooser.js',
    'dist/webauthn.js',
    'dist/webviewPopupSecurity.js',
    'dist/provisionSplash.js',
    'dist/ideInstall/wizardHtml.js',
    'dist/browserStream/capturePage.js',
    'dist/cablev2.js',
    'dist/qrEncoder.js',
    'dist/computer/hud.js',
    'dist/computer/hudState.js',
    'dist/computer/hudAgents.js',
    ...Object.keys(REMOTE_TEXT_TABLES)
];

module.exports = {
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
    patchSshErrorTextJs,
    patchRemoteDisconnectedPageJs,
    patchRemoteSignInCallbackJs,
    patchDeviceChooserJs,
    patchWebauthnJs,
    patchWebviewPopupSecurityJs,
    patchProvisionSplashJs,
    patchWizardHtmlJs,
    patchBrowserStreamCapturePageJs,
    patchCablev2Js,
    patchQrEncoderJs,
    patchComputerHudJs,
    patchComputerHudStateJs,
    patchComputerHudAgentsJs,
    patchRemoteTextJs,
    REMOTE_TEXT_TABLES,
    MAIN_PROCESS_PATCH_TARGETS
};
