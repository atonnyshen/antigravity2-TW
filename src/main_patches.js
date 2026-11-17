function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanJsContent(content, signatureStart, signatureEnd) {
    const regex = new RegExp(escapeRegExp(signatureStart) + "[\\s\\S]*?" + escapeRegExp(signatureEnd), "g");
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
            const eIdx = preloadSrc.indexOf(${JSON.stringify(signatureEnd)});
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
            if (!frame || frame.isDestroyed?.() || win.isDestroyed?.() || hubContents.isDestroyed?.()) return;
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
                    if (frame.isDestroyed?.() || win.isDestroyed?.() || hubContents.isDestroyed?.()) return;
                    return frame.executeJavaScript(script);
                })
                .catch(() => undefined);
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
    win.on('closed', () => {
        hubContents.off?.('did-frame-navigate', onSidecarFrameNavigate);
        hubContents.off?.('did-frame-finish-load', onSidecarFrameFinishLoad);
    });
    /* --- SIDECAR TRANSLATION END --- */`;

    console.log(`[修改] 伴生面板 (Sidecar) 汉化钩子注入成功！`);
    return cleaned.substring(0, idx) + sidecarHookJs + "\n    " + cleaned.substring(idx);
}

function patchPreloadJs(content, translationJs, signatureStart, signatureEnd) {
    console.log(`[修改] 正在向 preload.js 注入汉化代码...`);
    const cleanedContent = cleanJsContent(content, signatureStart, signatureEnd);
    const newContent = cleanedContent + "\n" + translationJs;
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
        'Replace With New': '替換為新對話',
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
        'Version': '版本'
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
        'Version': '版本'
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
    /* --- TRAY TRANSLATION END --- */`;

    let trayPatched = trayCleaned.replace(targetCreate, replacementCreate);
    if (trayPatched === trayCleaned) {
        console.warn(`[警告] 未能在 tray.js 中找到 createTray 函数插入点。`);
    }

    const dblClickTarget = /tray\.setContextMenu\(contextMenu\);/;
    const dblClickReplacement = `tray.setContextMenu(contextMenu);
    /* --- TRAY DOUBLE CLICK START --- */
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
    /* --- TRAY DOUBLE CLICK END --- */`;
    trayPatched = trayPatched.replace(dblClickTarget, dblClickReplacement);

    const countRegex = /countItem\.label\s*=\s*\([\s\S]*?' running';/g;
    const replacementCount = useTw
        ? "countItem.label = count > 0 ? `${count} 個代理執行中` : '無執行中的代理';"
        : "countItem.label = count > 0 ? `${count} 个智能体运行中` : '无运行中的智能体';";
    trayPatched = trayPatched.replace(countRegex, replacementCount);

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
    trayPatched = trayPatched.replace(targetInsert, replacementInsert);

    console.log(`[修改] 任务栏菜单汉化注入成功！`);
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

    console.log(`[修改] 加载页汉化注入成功！`);
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
    console.log(`[修改] 更新弹窗汉化注入成功！`);
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
             .replace(/dialog\.showErrorBox\('Startup failed'/g, useTw ? "dialog.showErrorBox('啟動失敗'" : "dialog.showErrorBox('启动失败'")
             .replace(/title:\s*'WSL distro not found'/g, useTw ? "title: '找不到 WSL 發行版'" : "title: '未找到 WSL 发行版'")
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
             .replace(/<button id="cancel">Cancel<\/button><button id="continue">Continue<\/button>/g, useTw ? '<button id="cancel">取消</button><button id="continue">繼續</button>' : '<button id="cancel">取消</button><button id="continue">继续</button>')
             .replace(/`\$\{label\} asks:`/g, useTw ? '`${label} 請求確認：`' : '`${label} 请求确认：`')
             .replace(/'Touch your security key'/g, useTw ? "'請輕觸您的安全性金鑰'" : "'请轻触您的安全密钥'")
             .replace(/buttons:\s*confirm\s*\?\s*\['Yes',\s*'No'\]\s*:\s*\['Cancel'\]/g, useTw ? "buttons: confirm ? ['是', '否'] : ['取消']" : "buttons: confirm ? ['是', '否'] : ['取消']");
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
        .replace(/buttons:\s*\['OK'\]/g, useTw ? "buttons: ['確定']" : "buttons: ['确定']");
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
    patchDeviceChooserJs,
    patchWebauthnJs,
    patchWebviewPopupSecurityJs,
    patchProvisionSplashJs
};
