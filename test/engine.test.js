'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
process.argv.push('--tw');
const { generateJs } = require('../localization_engine');
const { readAsarLayout } = require('../src/asar_patcher');
const repo = path.resolve(__dirname, '..');

test('all translation dictionaries parse and contain string values', () => {
    for (const folder of ['dicts', 'dicts_tw']) {
        for (const file of fs.readdirSync(path.join(repo, folder)).filter(f => f.endsWith('.json'))) {
            const dict = JSON.parse(fs.readFileSync(path.join(repo, folder, file), 'utf8'));
            for (const [key, value] of Object.entries(dict)) {
                assert.equal(typeof value, 'string', folder + '/' + file + ':' + key);
            }
        }
    }
});

test('generated script parses; protected containers and shadow roots remain untranslated', () => {
    const js = generateJs();
    new vm.Script(js);
    const prefix = js.slice(0, js.indexOf('    const observer ='));
    const context = { Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 } };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { isCodeOrEditor, translateNode }; })();', context);
    const { isCodeOrEditor, translateNode } = context.hooks;
    for (const selector of ['.terminal', '.xterm', '.monaco-editor', '[aria-label="File Viewer"]', '[data-file-uri]', '[class*="diffEditor"]', '.token', '.hljs', '[class*="mtk"]', '[contenteditable="true"]']) {
        const parent = { closest: s => s.includes(selector), getRootNode: () => ({}) };
        const text = { nodeType: 3, nodeValue: 'Settings', parentElement: parent };
        assert.equal(isCodeOrEditor(text), true, selector);
        translateNode(text);
        assert.equal(text.nodeValue, 'Settings');
        const shadowChild = { nodeType: 1, closest: () => false, getRootNode: () => ({ host: parent }) };
        assert.equal(isCodeOrEditor(shadowChild), true, selector + ' shadow');
    }
    const normal = { nodeType: 3, nodeValue: 'Settings', parentElement: { closest: () => false, getRootNode: () => ({}) } };
    translateNode(normal);
    assert.equal(normal.nodeValue, '設定');
});

test('real asar CLI: paths with spaces, injection, unpacked data, repeatability', async t => {
    const asar = await import('@electron/asar');
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-engine spaces-$-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = path.join(root, 'source');
    const resources = path.join(root, 'resources');
    fs.mkdirSync(path.join(source, 'dist'), { recursive: true });
    fs.mkdirSync(resources);
    fs.writeFileSync(path.join(source, 'dist', 'preload.js'), '// official preload\n');
    fs.writeFileSync(path.join(source, 'resource.txt'), 'unpacked-resource');
    const archive = path.join(resources, 'app.asar');
    await asar.createPackageWithOptions(source, archive, { unpack: '*.txt' });
    const original = fs.readFileSync(archive);
    for (let i = 0; i < 2; i++) {
        const run = spawnSync(process.execPath, [path.join(repo, 'localization_engine.js'), '--tw', '--staging', '--no-kill', '--install-dir', resources], { encoding: 'utf8', timeout: 30000 });
        assert.equal(run.status, 0, run.stdout + run.stderr);
        const layout = readAsarLayout(archive);
        const preload = layout.files.get('dist/preload.js').body.toString('utf8');
        assert.equal(preload.split('ANTIGRAVITY CHINESE LOCALIZATION START').length - 1, 1);
        assert.ok(preload.includes('命令選擇區'));
        new vm.Script(preload);
        assert.ok(layout.files.has('resource.txt'));
        assert.equal(layout.files.get('resource.txt').unpacked, true);
        assert.deepEqual(fs.readFileSync(archive + '.bak'), original);
    }
});

test('FastPick and split text nodes are properly localized', () => {
    const js = generateJs();
    const prefix = js.slice(0, js.indexOf('    const observer ='));
    const context = { Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 } };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode }; })();', context);
    const { translateNode } = context.hooks;

    // Composite node
    const tc1 = { nodeType: 3, nodeValue: 'Show ' };
    const tc2 = { nodeType: 3, nodeValue: ' more...' };
    const compositeEl = {
        nodeType: 1,
        tagName: 'DIV',
        textContent: 'Show 10 more...',
        childNodes: [tc1, tc2],
        getAttribute: () => null,
        closest: () => false,
        getRootNode: () => ({})
    };
    translateNode(compositeEl);
    assert.equal(tc1.nodeValue, '顯示另外 ');
    assert.equal(tc2.nodeValue, ' 個...');

    // Single text child composite node
    const tcSingle = { nodeType: 3, nodeValue: 'Show 5 more...' };
    const compositeElSingle = {
        nodeType: 1,
        tagName: 'DIV',
        textContent: 'Show 5 more...',
        childNodes: [tcSingle],
        getAttribute: () => null,
        closest: () => false,
        getRootNode: () => ({})
    };
    translateNode(compositeElSingle);
    assert.equal(tcSingle.nodeValue, '顯示另外 5 個...');

    // Split text node
    const parent = {
        nodeType: 1,
        textContent: 'Show 7 more...',
        getAttribute: attr => attr === 'value' ? 'fastpick-show-more:7' : null,
        closest: () => false,
        getRootNode: () => ({})
    };
    const splitText1 = { nodeType: 3, nodeValue: 'Show ', parentElement: parent };
    const splitText2 = { nodeType: 3, nodeValue: ' more...', parentElement: parent };
    translateNode(splitText1);
    translateNode(splitText2);
    assert.equal(splitText1.nodeValue, '顯示另外 ');
    assert.equal(splitText2.nodeValue, ' 個...');
});

test('generated script includes Taiwan dynamic rules and prompts in Traditional Chinese', () => {
    const js = generateJs();
    assert.ok(js.includes('此 MCP 伺服器中的所有工具'));
    assert.ok(js.includes('超出自訂項預算，並已從上下文中排除'));
});

test('NUX onboarding and typographical quote variations are properly localized', () => {
    const js = generateJs();
    const prefix = js.slice(0, js.indexOf('    const observer ='));
    const context = { Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 } };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode }; })();', context);
    const { translateNode } = context.hooks;

    // 1. Text node with typographical curly apostrophe (won’t)
    const node1 = {
        nodeType: 3,
        nodeValue: "Customize your experience across the agent, plugins, and product from the settings and marketplace. We won’t show you ads or let advertisers influence what Antigravity says."
    };
    translateNode(node1);
    assert.equal(node1.nodeValue, "從設定與市集中自訂您在代理、外掛程式及產品上的各項體驗。我們不會向您顯示廣告，也不會讓廣告主影響 Antigravity 的回應。");

    // 2. Text node starting with Antigravity’s (curly apostrophe)
    const node2 = {
        nodeType: 3,
        nodeValue: "Antigravity’s agents are powerful and will help you get a lot done better and faster than before, but still make sure to verify the actions taken by the agent."
    };
    translateNode(node2);
    assert.equal(node2.nodeValue, "Antigravity 的代理功能強大，能協助您比以往更好、更快地完成大量工作，但仍請務必驗證代理所執行的操作。");

    // 3. Composite text node with Help us improve and Allow Google
    const node3 = {
        nodeType: 3,
        nodeValue: "Help us improve Antigravity. Allow Google to collect and use your Interactions data, subject to the"
    };
    translateNode(node3);
    assert.equal(node3.nodeValue, "協助改善 Antigravity。允許 Google 收集並使用您的互動資料，但須遵守");
});

test('main process and native dialog patches localize quit, IPC, SSH, device chooser, webauthn, popup security and splash', () => {
    const {
        patchMainJs,
        patchIpcHandlersJs,
        patchRemoteManagerJs,
        patchSshPromptsJs,
        patchDeviceChooserJs,
        patchWebauthnJs,
        patchWebviewPopupSecurityJs,
        patchProvisionSplashJs
    } = require('../src/main_patches');

    const fakeMain = `const dockMenu = electron_1.Menu.buildFromTemplate([{ label: 'New Window', click: () => {} }]);
    const options = {
        buttons: ['Cancel', 'Quit'],
        defaultId: 1,
        cancelId: 0,
        title: 'Confirm Quit',
        message: 'Are you sure you want to quit?',
        detail: 'There may be agents or background tasks running.',
    };
    dialog.showErrorBox('Binary not found', msg);
    dialog.showErrorBox('Startup failed', msg);`;
    const patchedMain = patchMainJs(fakeMain, true);
    assert.ok(patchedMain.includes("label: '開新視窗'"));
    assert.ok(patchedMain.includes("title: '確認結束'"));
    assert.ok(patchedMain.includes("message: '您確定要結束 Antigravity 嗎？'"));
    assert.ok(patchedMain.includes("detail: '目前可能仍有代理或背景任務正在執行。'"));
    assert.ok(patchedMain.includes("buttons: ['取消', '結束']"));
    assert.ok(patchedMain.includes("dialog.showErrorBox('找不到執行檔'"));
    assert.equal(patchMainJs(patchedMain, true), patchedMain);

    const fakeIpc = `dialog.showErrorBox('Cannot open folder', t.error);
    void dialog.showMessageBox({ message: 'Folder is on the Windows filesystem' });
    const r = await dialog.showOpenDialog({ title: 'Open workspace' });
    const r2 = await dialog.showOpenDialog({ title: 'Open workspaces' });
    const r3 = await dialog.showOpenDialog({ title: 'Select Download Folder' });`;
    const patchedIpc = patchIpcHandlersJs(fakeIpc, true);
    assert.ok(patchedIpc.includes("dialog.showErrorBox('無法開啟資料夾'"));
    assert.ok(patchedIpc.includes("message: '資料夾位於 Windows 檔案系統'"));
    assert.ok(patchedIpc.includes("title: '開啟工作區'"));
    assert.ok(patchedIpc.includes("title: '選取下載資料夾'"));

    const fakeRm = `dialog.showOpenDialog(parent, { title: 'Choose an SSH config file' });
    dialog.showMessageBox(win, {
        buttons: ['Stop Server', 'Cancel'],
        title: 'Stop SSH server',
        message: \`Stop the Antigravity server on \${entry.label}?\`,
        detail: 'Agents running on this host will stop and its window will close. ' +
            'The server starts again the next time you connect.',
    });
    this.showSheet(win, { title: 'Stop SSH server', message: \`Not connected to \${label}\`, detail: 'Reconnect first, then stop its server.' });`;
    const patchedRm = patchRemoteManagerJs(fakeRm, true);
    assert.ok(patchedRm.includes("title: '選擇 SSH 設定檔'"));
    assert.ok(patchedRm.includes("title: '停止 SSH 伺服器'"));
    assert.ok(patchedRm.includes("buttons: ['停止伺服器', '取消']"));
    assert.ok(patchedRm.includes('此主機上執行的代理將停止，其視窗也將關閉。下次連線時伺服器將重新啟動。'));
    assert.ok(patchedRm.includes("message: `尚未連線至 ${label}`"));

    const fakeSp = `<div id="retry" hidden>Asked again: your last answer may not have worked.</div>
    <div id="long" hidden>That's too long.</div>
    <div class="buttons"><button id="cancel">Cancel</button><button id="continue">Continue</button></div>
    dialog.showMessageBox(parent, {
        message: confirm ? \`\${label} asks:\` : 'Touch your security key',
        buttons: confirm ? ['Yes', 'No'] : ['Cancel']
    });`;
    const patchedSp = patchSshPromptsJs(fakeSp, true);
    assert.ok(patchedSp.includes('再次詢問：您上次的輸入可能未通過驗證。'));
    assert.ok(patchedSp.includes('<button id="cancel">取消</button><button id="continue">繼續</button>'));
    assert.ok(patchedSp.includes("`${label} 請求確認：`"));
    assert.ok(patchedSp.includes("Touch your security key") === false);
    assert.ok(patchedSp.includes("buttons: confirm ? ['是', '否'] : ['取消']"));

    const fakeDc = `showMessageBox(win, { title: 'Connect a device', message: \`\${origin} wants to connect to a \${KIND_NOUNS[kind]}\`, detail: cancelId ? 'Select a device:' : 'No compatible devices found.', buttons: [...snapshot.map(({ label }) => label), 'Cancel'] });`;
    const patchedDc = patchDeviceChooserJs(fakeDc, true);
    assert.ok(patchedDc.includes("title: '連線至裝置'"));
    assert.ok(patchedDc.includes("'請選擇裝置：'"));
    assert.ok(patchedDc.includes("'取消']"));

    const fakeWa = `showMessageBox(win, { title: 'Choose a Passkey', message: \`Sign in to \${rpLabel}\`, detail: 'Select a passkey account to continue:', buttons: [...accountLabels, 'Cancel'] });`;
    const patchedWa = patchWebauthnJs(fakeWa, true);
    assert.ok(patchedWa.includes("title: '選擇通行金鑰'"));
    assert.ok(patchedWa.includes("detail: '請選擇通行金鑰帳戶以繼續：'"));

    const fakeWps = `{ label: 'Connection info…', click: () => dialog.showMessageBox(window, { title: 'Connection info', buttons: ['OK'] }) }`;
    const patchedWps = patchWebviewPopupSecurityJs(fakeWps, true);
    assert.ok(patchedWps.includes("label: '連線資訊…'"));
    assert.ok(patchedWps.includes("title: '連線資訊'"));
    assert.ok(patchedWps.includes("buttons: ['確定']"));

    const fakePs = `<div>Setting up WSL: \${escapeHtml(distro)}</div>`;
    const patchedPs = patchProvisionSplashJs(fakePs, true);
    assert.ok(patchedPs.includes('<div>正在設定 WSL：${escapeHtml(distro)}</div>'));
});

test('v2.32.1 template rules and newly added dict keys localize UI strings accurately', () => {
    const js = generateJs();
    const prefix = js.slice(0, js.indexOf('    const observer ='));
    const context = { Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 } };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode }; })();', context);
    const { translateNode } = context.hooks;

    const cases = [
        ["Choose Antigravity's Voice", '選擇 Antigravity 的聲音'],
        ["Choose Jetski's Voice", '選擇 Jetski 的聲音'],
        ['Microphone blocked. Allow in System Settings.', '麥克風已封鎖，請在 System Settings 中允許存取。'],
        ['Agent needs permission to act on example.com', '代理需要權限才能對 example.com 執行操作'],
        ['Blocked navigation to "https://example.com"', '已封鎖導覽至「https://example.com」'],
        ['Created automation "daily-sync".', '已建立自動化任務「daily-sync」。'],
        ['Stop 2 agents?', '停止 2 個代理？'],
        ['3 files changed', '3 個檔案已變更'],
        ['System default (MacBook Pro Mic)', '系統預設 (MacBook Pro Mic)'],
        ['Unfold lines 10-25', '展開第 10-25 行'],
        ['Authentication required', '需要身分驗證'],
        ['SSH host', 'SSH 主機'],
        ['Reading terminal:', '正在讀取終端機：'],
        ['Global Permissions', '全域權限']
    ];
    for (const [input, expected] of cases) {
        const node = { nodeType: 3, nodeValue: input };
        translateNode(node);
        assert.equal(node.nodeValue, expected, input);
    }
});

test('user greeting handles dynamic user name and fragmented DOM nodes', () => {
    const js = generateJs();
    const prefix = js.slice(0, js.indexOf('    const observer ='));
    const context = { Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 } };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode }; })();', context);
    const { translateNode } = context.hooks;

    // Case A: Full text node with real user name
    const singleNode = {
        nodeType: 3,
        nodeValue: 'Hey 馬紹安, what should we build today?'
    };
    translateNode(singleNode);
    assert.equal(singleNode.nodeValue, '嗨 馬紹安，今天我們要打造什麼？');

    // Case B: Fragmented text nodes inside parent
    const parent = {
        nodeType: 1,
        textContent: 'Hey 馬紹安, what should we build today?',
        closest: () => false,
        getRootNode: () => ({})
    };
    const fragNode1 = { nodeType: 3, nodeValue: 'Hey', parentElement: parent };
    const fragNode2 = { nodeType: 3, nodeValue: ', what should we build today?', parentElement: parent };
    translateNode(fragNode1);
    translateNode(fragNode2);
    assert.equal(fragNode1.nodeValue, '嗨');
    assert.equal(fragNode2.nodeValue, '，今天我們要打造什麼？');
});

test('model availability and dynamic deprecation date warnings are localized accurately', () => {
    const js = generateJs();
    const prefix = js.slice(0, js.indexOf('    const observer ='));
    const context = { Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 } };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode }; })();', context);
    const { translateNode } = context.hooks;

    const cases = [
        ['Unavailable', '無法使用'],
        [
            'Gemini 4 Argon is currently available to Ultra and paid Pro plan subscribers.',
            'Gemini 4 Argon 目前僅提供給 Ultra 與 Pro 付費方案訂閱者使用。'
        ],
        [
            'Gemini 4 Carbon is currently available to Ultra plan subscribers.',
            'Gemini 4 Carbon 目前僅提供給 Ultra 方案訂閱者使用。'
        ],
        [
            'Gemini 4 Hydrogen is currently available to paid Pro and Ultra subscribers.',
            'Gemini 4 Hydrogen 目前僅提供給 Pro 與 Ultra 付費訂閱者使用。'
        ],
        [
            'Sonnet 5.5 is now available on paid Pro and Ultra plans. Third-party model access will no longer be available on your current plan starting on November 30, 2026.',
            'Sonnet 5.5 現已在 Pro 與 Ultra 付費方案中提供。 自 2026 年 11 月 30 日 起，您目前的方案將不再提供第三方模型存取權限。'
        ],
        [
            'GPT-OSS will be removed from Antigravity on November 30, 2026.',
            'GPT-OSS 將於 2026 年 11 月 30 日自 Antigravity 下架。'
        ],
        [
            'Claude 2.1 will be removed on December 31, 2026.',
            'Claude 2.1 將於 2026 年 12 月 31 日下架。'
        ],
        [
            'Claude Instant will be discontinued on January 15, 2027.',
            'Claude Instant 將於 2027 年 1 月 15 日停止提供。'
        ],
        [
            'Third-party model access will no longer be available on your current plan starting on December 15, 2026.',
            '自 2026 年 12 月 15 日 起，您目前的方案將不再提供第三方模型存取權限。'
        ],
        [
            'Claude 3.5 Sonnet will no longer be available on your current plan starting on January 1, 2027.',
            '自 2027 年 1 月 1 日 起，您目前的方案將不再提供 Claude 3.5 Sonnet。'
        ],
        [
            '@worker-1 was stopped',
            '@worker-1 已停止'
        ],
        [
            '@worker-2 was killed',
            '@worker-2 已終止'
        ],
        [
            'Swarm · 6 members',
            '蜂群 · 6 位成員'
        ],
        [
            'Swarm · 4 workers',
            '蜂群 · 4 位成員'
        ]
    ];
    for (const [input, expected] of cases) {
        const node = { nodeType: 3, nodeValue: input };
        translateNode(node);
        assert.equal(node.nodeValue, expected, input);
    }
});



