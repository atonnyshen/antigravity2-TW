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
            'Gemini 4 Argon is currently available to paid Pro and Ultra subscribers.',
            'Gemini 4 Argon 目前僅提供給 Pro 與 Ultra 付費訂閱者使用。'
        ],
        [
            'Gemini 4 Argon is currently available to paid Pro and Ultra plan subscribers.',
            'Gemini 4 Argon 目前僅提供給 Pro 與 Ultra 付費方案訂閱者使用。'
        ],
        [
            'Gemini 4 Argon is currently available to Ultra and paid Pro subscribers.',
            'Gemini 4 Argon 目前僅提供給 Ultra 與 Pro 付費訂閱者使用。'
        ],
        [
            'Gemini 4 Argon is currently available to Ultra and paid Pro plan subscribers',
            'Gemini 4 Argon 目前僅提供給 Ultra 與 Pro 付費方案訂閱者使用'
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
            'Gemini 4 Hydrogen is currently available to paid Pro and Ultra subscribers',
            'Gemini 4 Hydrogen 目前僅提供給 Pro 與 Ultra 付費訂閱者使用'
        ],
        [
            'Sonnet 5.5 is now available on paid Pro and Ultra plans. Third-party model access will no longer be available on your current plan starting on November 30, 2026.',
            'Sonnet 5.5 現已在 Pro 與 Ultra 付費方案中提供。自 2026 年 11 月 30 日起，您目前的方案將不再提供第三方模型存取權限。'
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
            '自 2026 年 12 月 15 日起，您目前的方案將不再提供第三方模型存取權限。'
        ],
        [
            'Claude 3.5 Sonnet will no longer be available on your current plan starting on January 1, 2027.',
            '自 2027 年 1 月 1 日起，您目前的方案將不再提供 Claude 3.5 Sonnet。'
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
        ],
        [
            '/goal',
            '/goal'
        ],
        [
            '/swarm',
            '/swarm'
        ],
        [
            '/boost',
            '/boost'
        ],
        [
            '/learn',
            '/learn'
        ],
        [
            '/schedule',
            '/schedule'
        ],
        [
            '/swarm-autonomous-pipeline',
            '/swarm-autonomous-pipeline'
        ],
        [
            '/egm-boost',
            '/egm-boost'
        ]
    ];
    for (const [input, expected] of cases) {
        const node = { nodeType: 3, nodeValue: input };
        translateNode(node);
        assert.equal(node.nodeValue, expected, input);
    }
});

test('coordinator welcome text translates with parallel agent and no mainland terms', () => {
    const js = generateJs();
    const prefix = js.slice(0, js.indexOf('    const observer ='));
    class FakeTextNode {
        constructor(text) {
            this.nodeType = 3;
            this.nodeValue = text;
        }
    }
    class FakeElement {
        constructor(tagName, attrs = {}, textContent = '') {
            this.tagName = tagName;
            this.nodeType = 1;
            this.attrs = attrs;
            this.textContent = textContent;
            this.children = [];
        }
        getAttribute(name) { return this.attrs[name] || null; }
        setAttribute(name, val) { this.attrs[name] = val; }
        querySelectorAll(sel) {
            if (sel === 'p') return this.children.filter(c => c.tagName === 'p');
            return [];
        }
        querySelector(sel) {
            if (sel === 'strong') return this.children.find(c => c.tagName === 'strong') || null;
            return null;
        }
        appendChild(child) { this.children.push(child); }
        cloneNode() { return new FakeElement(this.tagName, { ...this.attrs }, this.textContent); }
    }
    const document = {
        createTextNode: text => new FakeTextNode(text)
    };
    const context = {
        Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
        document
    };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode }; })();', context);
    const { translateNode } = context.hooks;

    const coordEl = new FakeElement('div', { 'data-testid': 'coordinator-welcome' });
    const p1 = new FakeElement('p', {}, 'Welcome to MyProject. I coordinate the work for this project.');
    const strongEl = new FakeElement('strong', {}, 'MyProject');
    p1.children.push(strongEl);
    coordEl.children.push(p1);

    translateNode(coordEl);
    const fullText = p1.children.map(c => c.nodeValue || c.textContent).join('');
    assert.match(fullText, /啟動平行工作代理/);
    assert.doesNotMatch(fullText, /並行/);
    assert.match(fullText, /歡迎使用 MyProject/);

    // Fallback: p contains plain text without <strong> element
    const coordEl2 = new FakeElement('div', { 'data-testid': 'coordinator-welcome' });
    const p2 = new FakeElement('p', {}, 'Welcome to PlainProject. I coordinate the work for this project.');
    coordEl2.children.push(p2);
    translateNode(coordEl2);
    const fullText2 = p2.children.map(c => c.nodeValue || c.textContent).join('');
    assert.match(fullText2, /歡迎使用 PlainProject/);
    assert.match(fullText2, /啟動平行工作代理/);
});

function createMiniDomRuntime() {
    const js = generateJs();
    const prefix = js.slice(0, js.indexOf('    const observer ='));
    const context = { Node: { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_FRAGMENT_NODE: 11 } };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode, formatPlanAudience, isSlashCommandNameNode }; })();', context);
    return context.hooks;
}

function makeMiniEl(tagName, attrs = {}, children = []) {
    const el = {
        nodeType: 1,
        tagName: tagName.toUpperCase(),
        attrs: { ...attrs },
        parentElement: null,
        childNodes: [],
        get previousSibling() {
            if (!this.parentElement) return null;
            const idx = this.parentElement.childNodes.indexOf(this);
            return idx > 0 ? this.parentElement.childNodes[idx - 1] : null;
        },
        get textContent() {
            return this.childNodes.map(c => c.nodeType === 3 ? c.nodeValue : c.textContent).join('');
        },
        getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
        setAttribute(name, val) { this.attrs[name] = String(val); },
        hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); },
        matches(sel) {
            return sel.split(',').map(s => s.trim()).some(part => {
                if (!part) return false;
                const segments = part.match(/(?:\[[^\]]*\]|\S)+/g) || [];
                if (segments.length > 1) {
                    const last = segments[segments.length - 1];
                    if (!this.matches(last)) return false;
                    let anc = this.parentElement;
                    for (let i = segments.length - 2; i >= 0; i--) {
                        while (anc && !anc.matches(segments[i])) anc = anc.parentElement;
                        if (!anc) return false;
                        anc = anc.parentElement;
                    }
                    return true;
                }
                if (part === tagName.toLowerCase() || part === tagName.toUpperCase()) return true;
                const attrRe = /\[([^\]=*^$]+)(?:([*^$]?=)"([^"]*)")?(?:\s+i)?\]/g;
                let tagPrefix = part.replace(attrRe, '').replace(/\.[A-Za-z0-9_-]+/g, '');
                if (tagPrefix && tagPrefix.toUpperCase() !== this.tagName) return false;
                let m;
                let matchedAny = false;
                while ((m = attrRe.exec(part)) !== null) {
                    matchedAny = true;
                    const [, attrName, op, expected] = m;
                    const actual = this.getAttribute(attrName);
                    if (actual === null) return false;
                    const ci = /\s+i\]$/.test(m[0]);
                    const a = ci ? actual.toLowerCase() : actual;
                    const e = ci && expected ? expected.toLowerCase() : expected;
                    if (!op) continue;
                    if (op === '=' && a !== e) return false;
                    if (op === '*=' && !a.includes(e)) return false;
                    if (op === '^=' && !a.startsWith(e)) return false;
                    if (op === '$=' && !a.endsWith(e)) return false;
                }
                const classMatches = part.match(/\.[A-Za-z0-9_-]+/g) || [];
                for (const cm of classMatches) {
                    matchedAny = true;
                    const cls = (this.getAttribute('class') || '').split(/\s+/);
                    if (!cls.includes(cm.slice(1))) return false;
                }
                return matchedAny || tagPrefix !== '';
            });
        },
        closest(sel) {
            let cur = this;
            while (cur) {
                if (cur.matches && cur.matches(sel)) return cur;
                cur = cur.parentElement;
            }
            return null;
        },
        querySelector(sel) {
            for (const c of this.childNodes) {
                if (c.nodeType === 1) {
                    if (c.matches(sel)) return c;
                    const found = c.querySelector(sel);
                    if (found) return found;
                }
            }
            return null;
        },
        getRootNode() { return {}; },
        append(...nodes) {
            for (const n of nodes) {
                n.parentElement = this;
                this.childNodes.push(n);
            }
        }
    };
    el.append(...children);
    return el;
}

function makeMiniText(val) {
    return {
        nodeType: 3,
        nodeValue: val,
        parentElement: null,
        get previousSibling() {
            if (!this.parentElement) return null;
            const idx = this.parentElement.childNodes.indexOf(this);
            return idx > 0 ? this.parentElement.childNodes[idx - 1] : null;
        }
    };
}

test('model orchestrator offload dynamic rules, paid Ultra formatPlanAudience, and Thinking Effort preservation', () => {
    const { translateNode, formatPlanAudience } = createMiniDomRuntime();

    const cases = [
        [
            'Neon that may offload routine steps to Hydrogen. Same Neon-level quality, fewer tokens used.',
            'Neon 可將例行步驟分流至 Hydrogen。維持 Neon 同級品質，消耗更少 Token。'
        ],
        [
            'Argon that may offload routine steps to Hydrogen. Same Argon-level quality, fewer tokens used.',
            'Argon 可將例行步驟分流至 Hydrogen。維持 Argon 同級品質，消耗更少 Token。'
        ],
        [
            'Neon that may offload routine steps to Hydrogen.',
            'Neon 可將例行步驟分流至 Hydrogen。'
        ],
        [
            'Same Argon-level quality, fewer tokens used',
            '維持 Argon 同級品質，消耗更少 Token'
        ]
    ];
    for (const [input, expected] of cases) {
        const node = makeMiniText(input);
        translateNode(node);
        assert.equal(node.nodeValue, expected, input);
    }

    assert.equal(formatPlanAudience('paid Ultra subscribers'), 'Ultra 付費訂閱者');
    assert.equal(formatPlanAudience('paid Ultra plan subscribers'), 'Ultra 付費方案訂閱者');
    assert.equal(formatPlanAudience('paid Ultra plans'), 'Ultra 付費方案');

    // Thinking Effort levels & label MUST stay strictly in English
    for (const eng of ['Low', 'Medium', 'High', 'Extra', 'Max', 'Thinking Effort']) {
        const opt = makeMiniEl('div', { 'data-testid': 'model-selector-effort-option' }, [makeMiniText(eng)]);
        translateNode(opt);
        assert.equal(opt.textContent, eng, `model-selector-effort-option must preserve ${eng}`);

        const menuOpt = makeMiniEl('div', { role: 'menu', 'aria-label': 'Select model' }, [
            makeMiniEl('div', { role: 'menuitem' }, [makeMiniText(eng)])
        ]);
        translateNode(menuOpt);
        assert.equal(menuOpt.textContent, eng, `model menu must preserve ${eng}`);
    }

    // Model name ending with Max must NOT be rewritten
    const modelLabel = makeMiniEl('div', { 'data-testid': 'model-selector-item' }, [
        makeMiniText('Claude 4 '),
        makeMiniEl('span', {}, [makeMiniText('Max')])
    ]);
    translateNode(modelLabel);
    assert.equal(modelLabel.textContent, 'Claude 4 Max');

    // Recommended inside model menu translates to 推薦
    const recMenu = makeMiniEl('div', { role: 'menu', 'aria-label': 'Select model' }, [
        makeMiniEl('span', {}, [makeMiniText('Recommended')])
    ]);
    translateNode(recMenu);
    assert.equal(recMenu.textContent, '推薦');
});

test('slash command names in Mentions, FastPick, and split nodes stay untranslated while descriptions translate', () => {
    const { translateNode } = createMiniDomRuntime();

    // 1. v2.33.0 [data-mention-menu] with unprefixed [data-testid="menu-option-label"] and translatable description
    const mentionMenu = makeMiniEl('div', { role: 'listbox', 'aria-label': 'Mentions', 'data-mention-menu': '' }, [
        makeMiniEl('div', { role: 'option' }, [
            makeMiniEl('span', { 'data-testid': 'menu-option-label' }, [makeMiniText('goal')]),
            makeMiniEl('span', { 'data-testid': 'menu-option-description' }, [makeMiniText('Settings')])
        ]),
        makeMiniEl('div', { role: 'option' }, [
            makeMiniEl('span', { 'data-testid': 'menu-option-label' }, [makeMiniText('schedule')]),
            makeMiniEl('span', { 'data-testid': 'menu-option-description' }, [makeMiniText('Cancel')])
        ]),
        makeMiniEl('div', { role: 'option' }, [
            makeMiniEl('span', { 'data-testid': 'menu-option-label' }, [makeMiniText('workspace')]),
            makeMiniEl('span', { 'data-testid': 'menu-option-label' }, [makeMiniText('agent')]),
            makeMiniEl('span', { 'data-testid': 'menu-option-label' }, [makeMiniText('clear')]),
            makeMiniEl('span', { 'data-testid': 'menu-option-label' }, [makeMiniText('Plan')]),
            makeMiniEl('span', { 'data-testid': 'menu-option-description' }, [makeMiniText('Ask a quick question without interrupting the main conversation.')])
        ])
    ]);
    translateNode(mentionMenu);
    const labels = [
        mentionMenu.childNodes[0].childNodes[0].textContent,
        mentionMenu.childNodes[1].childNodes[0].textContent,
        mentionMenu.childNodes[2].childNodes[0].textContent,
        mentionMenu.childNodes[2].childNodes[1].textContent,
        mentionMenu.childNodes[2].childNodes[2].textContent,
        mentionMenu.childNodes[2].childNodes[3].textContent
    ];
    assert.deepEqual(labels, ['goal', 'schedule', 'workspace', 'agent', 'clear', 'Plan']);
    assert.equal(mentionMenu.childNodes[0].childNodes[1].textContent, '設定');
    assert.equal(mentionMenu.childNodes[1].childNodes[1].textContent, '取消');

    // 2. Split <span>/</span><span>goal</span> inside an option
    const splitOption = makeMiniEl('div', { role: 'option' }, [
        makeMiniEl('span', {}, [makeMiniText('/')]),
        makeMiniEl('span', {}, [makeMiniText('goal')]),
        makeMiniEl('span', { class: 'option-description' }, [makeMiniText('Settings')])
    ]);
    translateNode(splitOption);
    assert.equal(splitOption.childNodes[0].textContent, '/');
    assert.equal(splitOption.childNodes[1].textContent, 'goal');
    assert.equal(splitOption.childNodes[2].textContent, '設定');

    // 3. Generic FastPick option with unprefixed command + description sibling
    const fastPick = makeMiniEl('div', { role: 'option', 'data-testid': 'fastpick-item' }, [
        makeMiniEl('span', { class: 'command-name' }, [makeMiniText('grill-me')]),
        makeMiniEl('span', { class: 'description' }, [makeMiniText('Settings')])
    ]);
    translateNode(fastPick);
    assert.equal(fastPick.childNodes[0].textContent, 'grill-me');
    assert.equal(fastPick.childNodes[1].textContent, '設定');

    // 4. Lowercase words in LOWER_WORDS_EXCLUDE do not trigger TitleCase dict entries via lowerMap
    for (const cmd of ['schedule', 'clear', 'goal', 'plan', 'automation', 'reset', 'stop', 'filter', 'commit', 'split']) {
        const n = makeMiniText(cmd);
        translateNode(n);
        assert.equal(n.nodeValue, cmd, `lowercase "${cmd}" must not match TitleCase dict entry`);
    }

    // 5. Slash commands in attributes remain protected
    const attrHost = makeMiniEl('button', { title: '/goal', 'aria-label': '/swarm', 'aria-description': 'Settings' });
    translateNode(attrHost);
    assert.equal(attrHost.getAttribute('title'), '/goal');
    assert.equal(attrHost.getAttribute('aria-label'), '/swarm');
    assert.equal(attrHost.getAttribute('aria-description'), '設定');

    // Adversarial case: an accessible name is itself an unprefixed Slash label.
    // Protect the attributes as well as the command text.
    const nested = makeMiniEl('div', { role: 'option' }, [
        makeMiniEl('span', { title: 'Plan', 'aria-label': 'Plan' }, [makeMiniText('/plan')])
    ]);
    translateNode(nested);
    assert.equal(nested.childNodes[0].textContent, '/plan');
    assert.equal(nested.childNodes[0].getAttribute('title'), 'Plan');
    assert.equal(nested.childNodes[0].getAttribute('aria-label'), 'Plan');
});

test('L0 Taiwan prose fixes in preload_runtime, main_patches, and multi-partition cleanElectronCache', t => {
    const { translateNode } = createMiniDomRuntime();
    const { patchMenuJs } = require('../src/main_patches');
    const { cleanElectronCache } = require('../localization_engine');

    const twCases = [
        ['Send message Enter', '傳送訊息 Enter'],
        ['Queue message Enter', '佇列傳送訊息 Enter'],
        ['Queue message ⏎', '佇列傳送訊息 ⏎'],
        ['Available AI Credits: 500', '可用 AI 點數：500'],
        [
            "Your plan's baseline quota will refresh on May 1, 2026. To continue using this model now, enable AI Credit overages.",
            '您方案的基準配額將於 May 1, 2026 重設。如需立即繼續使用此模型，請啟用 AI 點數超額使用。'
        ],
        [
            'Exceeded the rules token budget. Full rule content (1,200 tokens) was replaced with a lightweight file-path pointer in context.',
            '已超出規則 Token 預算。完整規則內容 (1,200 個 Token) 已在上下文中換成輕量級檔案路徑指標。'
        ],
        ['Posted in #general; click to show only #general', '發布於 #general；按一下僅顯示 #general'],
        ['Explored 2 files, 1 artifact', '已探索 2 個檔案，1 個成品']
    ];
    for (const [input, expected] of twCases) {
        const node = makeMiniText(input);
        translateNode(node);
        assert.equal(node.nodeValue, expected, input);
    }

    const notRefParent = makeMiniEl('div', {}, [
        makeMiniText('Not referenced by any feature ('),
        makeMiniEl('span', {}, [makeMiniText('3')])
    ]);
    translateNode(notRefParent);
    assert.equal(notRefParent.textContent, '尚無任何功能參照 (3');

    const menuPatched = patchMenuJs('function build(menu){ electron_1.Menu.setApplicationMenu(menu); }', true);
    assert.ok(menuPatched.includes("'Replace With New': '取代為新對話'"));
    assert.ok(!menuPatched.includes('替換'));

    // cleanElectronCache purges arbitrary Partitions/* caches + Service Worker CacheStorage while keeping Local Storage
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-cache-clean-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const dirsToRemove = [
        path.join(root, 'Code Cache'),
        path.join(root, 'Default', 'Code Cache'),
        path.join(root, 'Partitions', 'webview-sidecar', 'Code Cache'),
        path.join(root, 'Partitions', 'webview-sidecar', 'Service Worker', 'CacheStorage'),
        path.join(root, 'Partitions', 'hub-browser-1', 'Cache')
    ];
    const dirsToKeep = [
        path.join(root, 'Local Storage'),
        path.join(root, 'Partitions', 'webview-sidecar', 'Local Storage')
    ];
    for (const d of [...dirsToRemove, ...dirsToKeep]) {
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, 'data.bin'), 'x');
    }
    const cleaned = cleanElectronCache([root]);
    assert.equal(cleaned, dirsToRemove.length);
    for (const d of dirsToRemove) assert.equal(fs.existsSync(d), false, 'must purge ' + d);
    for (const d of dirsToKeep) assert.equal(fs.existsSync(d), true, 'must keep ' + d);
});

test('metadata stamp, macOS runtime sync with lock, and Windows task path re-registration prevent watcher rollback', t => {
    const engine = require('../localization_engine');
    const js = engine.generateJs();
    const metaMatch = js.match(/\/\*\s*---\s*ANTIGRAVITY L10N META:(\{[^*\n]+\})\s*---\s*\*\//);
    assert.ok(metaMatch, 'generateJs must embed ANTIGRAVITY L10N META comment');
    const meta = JSON.parse(metaMatch[1]);
    assert.equal(meta.version, engine.getPackageVersion());

    // Simulate macOS runtime pre-sync + commit + lock release
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-mac-sync-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const rtDir = path.join(root, 'runtime');
    fs.mkdirSync(rtDir, { recursive: true });
    const fakeAsar = path.join(root, 'app.asar');
    fs.writeFileSync(fakeAsar, 'new-asar-bytes');

    const session = engine.prepareMacWatcherSync({
        sourceDir: repo,
        runtimes: [{ kind: 'user', runtimeDir: rtDir }]
    });
    assert.equal(session.synced.length, 1);
    assert.ok(fs.existsSync(path.join(rtDir, '.watcher-state', 'run.lock')), 'lock must be held during app.asar swap');
    assert.equal(
        JSON.parse(fs.readFileSync(path.join(rtDir, 'package.json'), 'utf8')).version,
        engine.getPackageVersion()
    );
    engine.commitMacWatcherSync(session, '/Applications/Antigravity.app', fakeAsar);
    engine.cleanupMacWatcherSync(session);
    assert.equal(fs.existsSync(path.join(rtDir, '.watcher-state', 'run.lock')), false, 'lock must be released after commit');

    const crypto = require('node:crypto');
    const stateKey = crypto.createHash('sha256').update('/Applications/Antigravity.app').digest('hex');
    const state = JSON.parse(fs.readFileSync(path.join(rtDir, '.watcher-state', stateKey + '.json'), 'utf8'));
    assert.equal(state.output, crypto.createHash('sha256').update('new-asar-bytes').digest('hex'));

    // Simulate Windows syncActiveWindowsWatcher re-registering task to current directory
    const winRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-win-sync-'));
    t.after(() => fs.rmSync(winRoot, { recursive: true, force: true }));
    fs.mkdirSync(path.join(winRoot, 'resources'), { recursive: true });
    fs.writeFileSync(path.join(winRoot, 'resources', 'app.asar'), 'win-asar');
    const winBase = path.join(winRoot, 'v371');
    fs.mkdirSync(winBase, { recursive: true });
    fs.writeFileSync(path.join(winBase, 'package.json'), '{"version":"3.7.1"}');
    let registeredPath = null;
    const winRes = engine.syncActiveWindowsWatcher(winRoot, path.join(winRoot, 'resources'), {
        baseDir: winBase,
        execFileSyncFn: () => '',
        installTaskFn: ({ scriptPath }) => { registeredPath = scriptPath; }
    });
    assert.equal(winRes.synced, true);
    assert.equal(registeredPath, path.join(winBase, 'auto_localize_watcher.js'));
});

test('quota limits, combined reset strings, region eligibility notices, and v2.33.0 templates translate accurately', () => {
    const { JSDOM } = require('jsdom');
    const js = generateJs();
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
    const prefix = js.slice(0, js.indexOf('    const observer ='));
    const context = { Node: dom.window.Node, document: dom.window.document, console };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode }; })();', context);
    const { translateNode } = context.hooks;

    const doc = dom.window.document;
    const tx = (str) => {
        const span = doc.createElement('span');
        span.textContent = str;
        translateNode(span);
        return span.textContent;
    };

    // Quota limits & combined reset strings
    assert.equal(tx('Weekly limit, resets in 5d 22h'), '每週上限，5 天 22 小時後重設');
    assert.equal(tx('Daily limit, resets in 3h 15m'), '每日上限，3 小時 15 分鐘後重設');
    assert.equal(tx('5h limit, resets in 2h 30m'), '5 小時上限，2 小時 30 分鐘後重設');
    assert.equal(tx('Weekly limit, resets in <1m'), '每週上限，<1 分鐘後重設');
    assert.equal(tx('Weekly limit'), '每週上限');
    assert.equal(tx('Daily limit'), '每日上限');
    assert.equal(tx('Monthly limit'), '每月上限');
    assert.equal(tx('7d limit'), '7 天上限');
    assert.equal(tx('66% left'), '66% 剩餘');

    // Region / country / eligibility errors
    assert.equal(
        tx('Your current account is not eligible for Antigravity, because it is not currently available in your location.'),
        '您目前的帳戶不符合使用 Antigravity 的資格，因為您所在的地區目前不支援此服務。'
    );
    assert.equal(tx('This account is not eligible for Antigravity.'), '目前帳戶不符合使用 Antigravity 的資格。');
    assert.equal(tx('Your current region is not supported.'), '目前不支援您所在的地區。');
    assert.equal(tx('This service is not available in your region.'), '您所在的地區目前不支援此服務。');
    assert.equal(tx('Further action is required to use'), '需要採取進一步行動才能使用');
    assert.equal(tx('Verify'), '驗證');
    // Lowercase 'apply' / 'verify' must remain protected
    assert.equal(tx('apply'), 'apply');
    assert.equal(tx('Apply'), '套用');

    // FAQ in loginError link vs generic FAQ
    const p = doc.createElement('p');
    p.appendChild(doc.createTextNode('Please verify your account, then sign in again to continue. Learn more by visiting our'));
    p.appendChild(doc.createTextNode(' '));
    const faqLink = doc.createElement('a');
    faqLink.textContent = 'FAQ';
    p.appendChild(faqLink);
    p.appendChild(doc.createTextNode('.'));
    translateNode(p);
    assert.equal(faqLink.textContent, '常見問題');

    // v2.33.0 templates & aria-label dynamic rules
    assert.equal(tx('Plan, 3 of 5 steps done'), '計畫，已完成 3 / 5 個步驟');
    assert.equal(tx('Question 2 of 4'), '第 2 題（共 4 題）');
    assert.equal(tx('0 results'), '0 個結果');
    assert.equal(tx("You're signing in on workstation-1. Your sign-in stays on that machine."), '您正在 workstation-1 上登入。您的登入狀態會保留在該電腦上。');

    const btn = doc.createElement('button');
    btn.setAttribute('aria-label', 'Open GitHub Desktop');
    translateNode(btn);
    assert.equal(btn.getAttribute('aria-label'), '開啟 GitHub Desktop');

    const projSpan = doc.createElement('span');
    projSpan.appendChild(doc.createTextNode('Available for '));
    projSpan.appendChild(doc.createTextNode('my-gcp-proj'));
    projSpan.appendChild(doc.createTextNode(' project'));
    translateNode(projSpan);
    assert.equal(projSpan.textContent, '適用於 my-gcp-proj 專案');

    // v2.34.0 rules
    assert.equal(tx("Couldn't disconnect GitHub: token expired"), '無法中斷 GitHub 的連線：token expired');
    assert.equal(tx('Failed to load page 2: timeout'), '載入頁面 2 失敗：timeout');
    assert.equal(tx('More options for Plugins'), 'Plugins 的更多選項');
    assert.equal(tx('Opens the New Conversation screen for this project'), '開啟此專案的新對話畫面');
    assert.equal(tx('Replaced by newer request'), '已由較新的請求取代');

    // v2.34.0 server-returned RPC & model picker / quota strings
    assert.equal(tx('The original Gemini 4 model for advanced workflows'), '適合進階工作流程的初代 Gemini 4 模型');
    assert.equal(tx('The original Gemini 3.5 Pro model for advanced workflows.'), '適合進階工作流程的初代 Gemini 3.5 Pro 模型');
    assert.equal(tx('Gemini 4 Argon Weekly Limit'), 'Gemini 4 Argon 每週上限');
    assert.equal(tx('Models within this group: Gemini 4 Neon, Gemini 4 Hydrogen, Orchestrator (Neon), Gemini 3.8 Flash'), '此群組包含的模型：Gemini 4 Neon, Gemini 4 Hydrogen, Orchestrator (Neon), Gemini 3.8 Flash');
    assert.equal(tx('For paid Pro plans, Argon quota is separate. Higher Argon quota (included as part of the larger Gemini quota bucket) is available on Ultra plans.'), '在 Pro 付費方案中，Argon 配額會獨立計算。Ultra 方案則提供更高的 Argon 配額（納入較大的 Gemini 配額池中）。');
    assert.equal(tx('You have hit your 5-hour limit, so the weekly limit does not currently apply. Your 5-hour limit will refresh in 36 minutes.'), '您已達到 5 小時限制，每週額度限制目前不適用。您的 5 小時限制將於 36 分鐘重設。');
    assert.equal(tx('You have hit your 5-hour limit, it will refresh in 36 minutes. If on a supported paid plan, you can use AI credits in the interim.'), '您已達到 5 小時限制，將於 36 分鐘重設。若您使用受支援的付費方案，可在此期間使用 AI 點數。');
    assert.equal(tx('You have hit your weekly limit, the 5-hour limit does not currently apply. Your weekly limit will fully refresh in 4 days.'), '您已達到每週額度限制，5 小時限制目前不適用。您的每週額度限制將於 4 天完全重設。');
    assert.equal(tx('You have used some of your 5-hour limit, it will fully refresh in 4 hours, 54 minutes.'), '4 小時 54 分鐘後更新');
    assert.equal(tx('You have used some of your weekly limit, it will fully refresh in 6 days, 23 hours.'), '6 天 23 小時後更新');
    assert.equal(tx('You have used some of your daily limit, it will fully refresh in 3 hours.'), '您已使用部分每日額度限制，將於 3 小時完全重設。');
    assert.equal(tx('You can upgrade to a Google AI Ultra plan to receive higher rate limits.'), '您可以升級到 Google AI Ultra 計畫以取得更高的速率限制。');
    assert.equal(tx('You can upgrade to a Google AI Pro plan to receive higher rate limits.'), '您可以升級至 Google AI Pro 方案以獲得更高的速率限制。');
    assert.equal(tx('Design'), '設計');
    assert.equal(tx('design'), 'design');
});

test('v2.34.0 Swarm Hive map, GIF export, and live timer/subagent counters translate accurately', () => {
    const { JSDOM } = require('jsdom');
    const js = generateJs();
    const dom = new JSDOM(`<!doctype html><html><body>
        <div id="swarm-title">Untitled swarm</div>
        <button id="tab-hive">Hive</button>
        <div class="o2 hv">
            <div class="hv-bar">
                <div class="hv-sum"><span><b>12</b> threads</span><span class="busy"><i></i>3 working</span><span class="warn"><i></i>1 waiting</span><span class="bad"><i></i>2 stuck</span><span class="ok"><i></i>4 done</span></div>
                <div class="btn-group hv-zoom" aria-label="Zoom">
                    <button id="z-out" title="Zoom out" aria-label="Zoom out"></button>
                    <button id="z-in" title="Zoom in" aria-label="Zoom in"></button>
                    <button id="z-fit" title="Fit the whole swarm" aria-label="Fit the whole swarm"></button>
                </div>
            </div>
            <svg class="hv-svg" aria-label="Where each worker is, by thread"></svg>
            <div class="hv-bees">
                <button id="bee-work" class="hv-bee working" title="@worker-1 · Codebase Researcher · Working for @coordinator" aria-label="@worker-1 · Codebase Researcher · Working for @coordinator"><span class="hv-nm" id="nm-work">worker-1</span></button>
                <button id="bee-wait" class="hv-bee wait" title="@worker-2 · Waiting on @coordinator"><span class="hv-nm" id="nm-wait">design</span></button>
            </div>
            <div class="hv-key" aria-hidden="true">
                <span id="k-done"><i></i>Tasks done</span>
                <span id="k-sent"><i></i>Message just sent</span>
                <span id="k-waiton"><i></i>Waiting on</span>
                <span id="k-work"><i></i>Working</span>
                <span id="k-wait"><i></i>Waiting</span>
                <span id="k-ok"><i></i>Done</span>
            </div>
            <section class="hv-card">
                <span id="card-prog">3 of 5 done</span>
                <span id="card-bees">2 bees</span>
                <button id="row-open" title="Open @worker-1">x</button>
                <p id="card-empty">No one is on this thread yet.</p>
            </section>
            <span id="stall">Swarm stalled — no agents working</span>
            <span id="coord-ask">The coordinator asked. Answer it in its chat.</span>
            <span id="live-tip" title="Latest action: Reading config">x</span>
            <span id="exp-btn">Export GIF</span>
            <span id="exp-pct">Exporting 42%</span>
            <span id="exp-done">Exported swarm-graph.gif (12 frames · 1.2 MB)</span>
            <span id="exp-save">Right-click image to save, or open in a new tab.</span>
        </div>
        <span id="timers">Waiting for 2 timers</span>
        <span id="timer1">Waiting for timer</span>
        <span id="subrun">3 subagents/tasks running</span>
        <span id="subblk">1 subagent blocked</span>
    </body></html>`, { runScripts: 'outside-only' });
    const prefix = js.slice(0, js.indexOf('    const observer ='));
    const context = { Node: dom.window.Node, document: dom.window.document, console };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode }; })();', context);
    const { translateNode } = context.hooks;

    const doc = dom.window.document;
    translateNode(doc.body);

    assert.equal(doc.getElementById('tab-hive').textContent, '蜂巢');
    assert.equal(doc.querySelector('.hv-zoom').getAttribute('aria-label'), '縮放');
    assert.equal(doc.getElementById('z-out').getAttribute('title'), '縮小');
    assert.equal(doc.getElementById('z-in').getAttribute('title'), '放大');
    assert.equal(doc.getElementById('z-fit').getAttribute('title'), '縮放至完整蜂群');
    assert.equal(doc.querySelector('.hv-svg').getAttribute('aria-label'), '各成員所在的討論串分佈');
    assert.equal(doc.querySelector('.hv-sum').textContent, '12 個討論串3 個工作中1 個等待中2 項受阻4 個已完成');

    assert.equal(doc.getElementById('k-done').textContent, '任務已完成');
    assert.equal(doc.getElementById('k-sent').textContent, '剛傳送訊息');
    assert.equal(doc.getElementById('k-waiton').textContent, '正在等待');
    assert.equal(doc.getElementById('k-work').textContent, '工作中');
    assert.equal(doc.getElementById('k-wait').textContent, '等待中');
    assert.equal(doc.getElementById('k-ok').textContent, '已完成');

    assert.equal(doc.getElementById('bee-work').getAttribute('title'), '@worker-1 · Codebase Researcher · 為 @coordinator 執行中');
    assert.equal(doc.getElementById('bee-wait').getAttribute('title'), '@worker-2 · 正在等待 @coordinator');
    assert.equal(doc.getElementById('nm-work').textContent, 'worker-1');
    assert.equal(doc.getElementById('nm-wait').textContent, 'design');

    assert.equal(doc.getElementById('card-prog').textContent, '已完成 3 / 5 項');
    assert.equal(doc.getElementById('card-bees').textContent, '2 位成員');
    assert.equal(doc.getElementById('row-open').getAttribute('title'), '開啟 @worker-1');
    assert.equal(doc.getElementById('card-empty').textContent, '此討論串目前尚無成員。');

    assert.equal(doc.getElementById('stall').textContent, '蜂群已停滯 — 目前沒有成員執行中');
    assert.equal(doc.getElementById('coord-ask').textContent, '協調器提出詢問。請在協調器對話中回覆。');
    assert.equal(doc.getElementById('live-tip').getAttribute('title'), '最新動作：Reading config');
    assert.equal(doc.getElementById('exp-btn').textContent, '匯出 GIF');
    assert.equal(doc.getElementById('exp-pct').textContent, '正在匯出 42%');
    assert.equal(doc.getElementById('exp-done').textContent, '已匯出 swarm-graph.gif（12 格 · 1.2 MB）');
    assert.equal(doc.getElementById('exp-save').textContent, '在圖片上按右鍵即可儲存，或於新分頁中開啟。');

    assert.equal(doc.getElementById('timers').textContent, '正在等待 2 個計時器');
    assert.equal(doc.getElementById('timer1').textContent, '正在等待計時器');
    assert.equal(doc.getElementById('subrun').textContent, '3 個子代理／任務執行中');
    assert.equal(doc.getElementById('subblk').textContent, '1 個子代理受阻');
});

test('v2.34.0 executor offload phrasing, remaining JSX templates, and Thinking effort protection hold', () => {
    const { JSDOM } = require('jsdom');
    const js = generateJs();
    const dom = new JSDOM(`<!doctype html><html><body>
        <span id="offload">Offloads routine steps to a faster executor. Same quality, fewer tokens used.</span>
        <span id="offload-dyn">Offloads routine steps to Hydrogen. Same Neon-level quality, fewer tokens used.</span>
        <span id="offload-short">Offloads routine steps to a faster executor.</span>
        <span id="same-q">Same quality, fewer tokens used.</span>
        <span id="show5">Show 5</span>
        <span id="show10">Show 10</span>
        <span id="worktree">Worktree Name</span>
        <span id="ans">Answered:</span>
        <span id="swarm-desc">Unlock the power of agent swarms.</span>
        <span id="att">+3 attachments</span>
        <span id="det">Detached at a1b2c3d</span>
        <span id="branch">Branch, current: main</span>
        <span id="gh">GitHub: rate limited</span>
        <span id="ssh">SSH: devbox</span>
        <span id="voice">Voice speed, 1.2x</span>
        <span id="tout">script timed out after 5000ms</span>
        <button id="sel-mod" aria-label="Select model, current: Gemini 4 Neon">x</button>
        <button id="sel-prj" aria-label="Select project, current: my-proj">x</button>
        <button id="stop-sel" title="Stop 3 selected">x</button>
        <button id="cfg-miss" aria-label="Configure MCP, values missing">x</button>
        <div data-testid="model-selector-effort-option"><span id="eff-lc">Thinking effort</span></div>
    </body></html>`, { runScripts: 'outside-only' });
    const prefix = js.slice(0, js.indexOf('    const observer ='));
    const context = { Node: dom.window.Node, document: dom.window.document, console };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode }; })();', context);
    const { translateNode } = context.hooks;

    const doc = dom.window.document;
    translateNode(doc.body);

    assert.equal(doc.getElementById('offload').textContent, '將例行步驟分流至更快的執行模型。維持相同品質，消耗更少 Token。');
    assert.equal(doc.getElementById('offload-dyn').textContent, '將例行步驟分流至 Hydrogen。維持 Neon 同級品質，消耗更少 Token。');
    assert.equal(doc.getElementById('offload-short').textContent, '將例行步驟分流至更快的執行模型。');
    assert.equal(doc.getElementById('same-q').textContent, '維持相同品質，消耗更少 Token。');
    assert.equal(doc.getElementById('show5').textContent, '顯示 5 項');
    assert.equal(doc.getElementById('show10').textContent, '顯示 10 項');
    assert.equal(doc.getElementById('worktree').textContent, 'Worktree 名稱');
    assert.equal(doc.getElementById('ans').textContent, '已回覆：');
    assert.equal(doc.getElementById('swarm-desc').textContent, '釋放多代理蜂群協作的強大威力。');
    assert.equal(doc.getElementById('att').textContent, '另有 3 個附件');
    assert.equal(doc.getElementById('det').textContent, '已分離於 a1b2c3d');
    assert.equal(doc.getElementById('branch').textContent, '目前分支：main');
    assert.equal(doc.getElementById('gh').textContent, 'GitHub：rate limited');
    assert.equal(doc.getElementById('ssh').textContent, 'SSH：devbox');
    assert.equal(doc.getElementById('voice').textContent, '語速，1.2x');
    assert.equal(doc.getElementById('tout').textContent, '指令碼於 5000 毫秒後逾時');
    assert.equal(doc.getElementById('sel-mod').getAttribute('aria-label'), '選擇模型，目前：Gemini 4 Neon');
    assert.equal(doc.getElementById('sel-prj').getAttribute('aria-label'), '選擇專案，目前：my-proj');
    assert.equal(doc.getElementById('stop-sel').getAttribute('title'), '停止已選取的 3 個項目');
    assert.equal(doc.getElementById('cfg-miss').getAttribute('aria-label'), '設定 MCP（缺少值）');
    assert.equal(doc.getElementById('eff-lc').textContent, 'Thinking effort');
});

test('install20 and restore20 clean temp dirs from resourcesDir before resignFn runs', async t => {
    const asar = await import('@electron/asar');
    const { install20, restore20 } = require('../localization_engine');
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag-engine-resign-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = path.join(root, 'source');
    const resources = path.join(root, 'Antigravity.app', 'Contents', 'Resources');
    fs.mkdirSync(path.join(source, 'dist'), { recursive: true });
    fs.mkdirSync(resources, { recursive: true });
    fs.writeFileSync(path.join(source, 'dist', 'preload.js'), '// official preload\n');
    const archive = path.join(resources, 'app.asar');
    await asar.createPackageWithOptions(source, archive, {});

    let installDirsDuringResign = null;
    const okInstall = install20(resources, true, false, {
        resignFn(dir) {
            installDirsDuringResign = fs.readdirSync(dir).filter(n => n.startsWith('.antigravity-'));
            return true;
        }
    });
    assert.equal(okInstall, true);
    assert.deepEqual(installDirsDuringResign, []);

    let restoreDirsDuringResign = null;
    const okRestore = restore20(resources, true, {
        resignFn(dir) {
            restoreDirsDuringResign = fs.readdirSync(dir).filter(n => n.startsWith('.antigravity-'));
            return true;
        }
    });
    assert.equal(okRestore, true);
    assert.deepEqual(restoreDirsDuringResign, []);
});

test('v2.35.1 Inbox Mode, Dictation, Plugins, Quota, Countdown and JSX split-node rules localize in TW', () => {
    const { JSDOM } = require('jsdom');
    const js = generateJs();
    const dom = new JSDOM(`<!doctype html><html><body>
        <span id="inbox-mode">Inbox Mode</span>
        <span id="working-sec">Working Section</span>
        <span id="resolved">Resolved</span>
        <span id="dict-lang">Dictation languages</span>
        <span id="plug-perm">Plugin permissions</span>
        <span id="avail-proj">Available for my-gcp-proj project</span>
        <p id="revoke-msg">All file permissions will be revoked. The plugin will ask before doing this again.</p>
        <span id="ai-credits">Available AI credits: 1,250</span>
        <button id="dismiss-btn" aria-label="Dismiss: Update ready">x</button>
        <span id="move-to">Move to Archive</span>
        <span id="new-ws">New workspace...</span>
        <span id="no-lang">No matching languages for "klingon"</span>
        <button id="rev-all" aria-label="Revoke all: GitHub">Revoke all</button>
        <button id="theme-app" aria-label="Applied DarkTheme">Applied</button>
        <button id="show-plug" aria-label="Show MyPlugin">x</button>
        <span id="quota-reset">Your quota for Gemini 4 Pro will reset on Dec 1, 2026. Switch to another available model to continue.</span>
        <span id="need-credits">You need at least 50 AI Credits to send messages. To continue using Gemini 4 Pro now, purchase more AI Credits.</span>
        <span id="baseline-reset">Your plan's baseline quota will refresh on Dec 5, 2026.</span>
        <span id="retry-in">Model unavailable, retrying in 5s (attempt 2/3)</span>
        <span id="attach-img">3 image attachments</span>
        <span id="left-hm">2h 15m left</span>
        <span id="pub-origin">Published feat/x to origin.</span>
        <div id="best-of">Start Best-of-<span>3</span></div>
        <div id="gen-steps">Generation Steps (<span>4</span>)</div>
    </body></html>`, { runScripts: 'outside-only' });
    const prefix = js.slice(0, js.indexOf('    const observer ='));
    const context = { Node: dom.window.Node, document: dom.window.document, console };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode }; })();', context);
    const { translateNode } = context.hooks;

    const doc = dom.window.document;
    translateNode(doc.body);

    assert.equal(doc.getElementById('inbox-mode').textContent, '收件匣模式');
    assert.equal(doc.getElementById('working-sec').textContent, '進行中區塊');
    assert.equal(doc.getElementById('resolved').textContent, '已解決');
    assert.equal(doc.getElementById('dict-lang').textContent, '聽寫語言');
    assert.equal(doc.getElementById('plug-perm').textContent, '外掛程式權限');
    assert.equal(doc.getElementById('avail-proj').textContent, '適用於 my-gcp-proj 專案');
    assert.equal(doc.getElementById('revoke-msg').textContent, '將撤銷全部 file permissions。外掛程式在再次執行此操作前會先徵求您的同意。');
    assert.equal(doc.getElementById('ai-credits').textContent, '可用 AI 點數：1,250');
    assert.equal(doc.getElementById('dismiss-btn').getAttribute('aria-label'), '關閉：Update ready');
    assert.equal(doc.getElementById('move-to').textContent, '移至封存');
    assert.equal(doc.getElementById('new-ws').textContent, '新增工作區...');
    assert.equal(doc.getElementById('no-lang').textContent, '找不到與「klingon」相符的語言');
    assert.equal(doc.getElementById('rev-all').getAttribute('aria-label'), '全部撤銷：GitHub');
    assert.equal(doc.getElementById('rev-all').textContent, '全部撤銷');
    assert.equal(doc.getElementById('theme-app').getAttribute('aria-label'), '已套用 DarkTheme');
    assert.equal(doc.getElementById('theme-app').textContent, '已套用');
    assert.equal(doc.getElementById('show-plug').getAttribute('aria-label'), '顯示 MyPlugin');
    assert.equal(doc.getElementById('quota-reset').textContent, '您的 Gemini 4 Pro 配額將於 Dec 1, 2026 重設。請切換至其他可用模型以繼續。');
    assert.equal(doc.getElementById('need-credits').textContent, '您需要至少 50 AI 點數才能傳送訊息。若要立即繼續使用 Gemini 4 Pro，請購買更多 AI 點數。');
    assert.equal(doc.getElementById('baseline-reset').textContent, '您方案的基準配額將於 Dec 5, 2026 重設。');
    assert.equal(doc.getElementById('retry-in').textContent, '模型暫時無法使用，5 秒後重試（第 2/3 次嘗試）');
    assert.equal(doc.getElementById('attach-img').textContent, '3 張圖片附件');
    assert.equal(doc.getElementById('left-hm').textContent, '剩餘 2 小時 15 分鐘');
    assert.equal(doc.getElementById('pub-origin').textContent, '已發布 feat/x 至 origin。');
    assert.equal(doc.getElementById('best-of').textContent, '開始 Best-of-3');
    assert.equal(doc.getElementById('gen-steps').textContent, '產生步驟 (4)');
});









test('v2.35.1 icon-font ligature fallbacks render SVG, stay untranslated, and permission pill uses short labels', () => {
    const { JSDOM } = require('jsdom');
    const js = generateJs();
    const dom = new JSDOM(`<!doctype html><html><body>
        <div id="menu-comment"><span class="google-symbols" style="font-size: 18px">comment</span><span>Comment on Selection</span></div>
        <span id="icon-quote" class="google-symbols">format_quote</span>
        <span id="icon-shield" class="google-symbols">laptop_shield</span>
        <span id="icon-restore" class="google-symbols">restore_page</span>
        <span id="icon-unknown" class="material-symbols-outlined">settings</span>
        <button id="perm-pill" data-testid="permissions-selector-trigger"><span>Turbo</span></button>
        <button id="perm-pill-default" data-testid="permissions-selector-trigger"><span>Default</span></button>
        <span id="plain-default">Default</span>
    </body></html>`, { runScripts: 'outside-only' });
    const prefix = js.slice(0, js.indexOf('    const observer ='));
    const context = { Node: dom.window.Node, document: dom.window.document, console };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode }; })();', context);
    const { translateNode } = context.hooks;

    const doc = dom.window.document;
    translateNode(doc.body);

    const commentIcon = doc.querySelector('#menu-comment .google-symbols');
    assert.equal(commentIcon.textContent, '');
    assert.equal(commentIcon.querySelector('svg').getAttribute('data-ag-icon-fallback'), 'comment');
    // 寬高跟隨宿主字級（1em），rem 等非 px 單位也不會算錯
    assert.equal(commentIcon.querySelector('svg').getAttribute('width'), '1em');
    assert.notEqual(doc.querySelector('#menu-comment span:last-child').textContent, 'Comment on Selection');
    for (const [id, name] of [['icon-quote', 'format_quote'], ['icon-shield', 'laptop_shield'], ['icon-restore', 'restore_page']]) {
        const el = doc.getElementById(id);
        assert.equal(el.textContent, '');
        assert.equal(el.querySelectorAll('svg').length, 1);
        assert.equal(el.querySelector('svg').getAttribute('data-ag-icon-fallback'), name);
    }
    // 未知圖示名稱不翻譯，保留給字型連字
    assert.equal(doc.getElementById('icon-unknown').textContent, 'settings');
    assert.equal(doc.getElementById('perm-pill').textContent, '極速');
    assert.equal(doc.getElementById('perm-pill-default').textContent, '預設');
    assert.equal(doc.getElementById('plain-default').textContent, '預設 (Default)');

    // React 重設同一圖示文字時不重複插入 SVG；換成別的圖示時替換 SVG
    const quote = doc.getElementById('icon-quote');
    const quoteText = Array.from(quote.childNodes).find(n => n.nodeType === dom.window.Node.TEXT_NODE);
    quoteText.nodeValue = 'format_quote';
    translateNode(quote);
    assert.equal(quote.querySelectorAll('svg').length, 1);
    quoteText.nodeValue = 'comment';
    translateNode(quote);
    assert.equal(quote.querySelectorAll('svg').length, 1);
    assert.equal(quote.querySelector('svg').getAttribute('data-ag-icon-fallback'), 'comment');

    // 同一文字節點：未知圖示 → 需要 SVG 的圖示 → 未知圖示，換回來時不得殘留舊 SVG
    const unknown = doc.getElementById('icon-unknown');
    const unknownText = unknown.firstChild;
    unknownText.nodeValue = 'comment';
    translateNode(unknown);
    assert.equal(unknown.querySelectorAll('svg').length, 1);
    unknownText.nodeValue = 'settings';
    translateNode(unknown);
    assert.equal(unknown.querySelectorAll('svg').length, 0);
    assert.equal(unknown.textContent, 'settings');
});

test('CJK gap collapse is undone when React reuses neighbor text nodes, and nested markup is walked once', async () => {
    const { JSDOM } = require('jsdom');
    const js = generateJs();
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
    const win = dom.window;
    const doc = win.document;
    const pause = () => new Promise(resolve => setImmediate(resolve));
    win.eval(js);
    win.__agCnRuntimeStart();

    const pair = doc.createElement('span');
    pair.append('Settings', ' ', 'Help');
    doc.body.append(pair);
    const sendNow = doc.createElement('span');
    sendNow.innerHTML = 'Messages now send immediately. Configure in<!----> <span class="whitespace-nowrap"><button>settings</button>.</span>';
    doc.body.append(sendNow);
    await pause();
    assert.equal(pair.textContent, '設定說明');
    assert.equal(sendNow.textContent, '訊息現已改為立即傳送。可在設定中調整。');

    // React 重用同一批文字節點換成英文：收掉的空白要還原（含空白後面是行內元素的情況）
    pair.firstChild.data = 'Alice';
    pair.lastChild.data = 'Bob';
    sendNow.querySelector('button').firstChild.data = 'Foo';
    await pause();
    await pause();
    assert.equal(pair.textContent, 'Alice Bob');
    assert.ok(sendNow.textContent.includes('可在 Foo'), sendNow.textContent);

    // 換回可翻譯的文字時再次收合
    pair.firstChild.data = 'Settings';
    pair.lastChild.data = 'Help';
    await pause();
    await pause();
    assert.equal(pair.textContent, '設定說明');
    win.close();

    // 判斷空白時不翻譯鄰近子樹：巢狀結構每個節點只走訪一次（修正前每多一層呼叫次數加倍）
    const counter = new JSDOM('<body></body>').window;
    const prefix = js.slice(0, js.indexOf('    const observer ='))
        .replace('function translateNode(node) {', 'function translateNode(node) {globalThis.calls++;');
    const context = { Node: counter.Node, document: counter.document, console, calls: 0 };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode }; })();', context);
    let nested = counter.document.createElement('span');
    nested.append('X');
    const depth = 12;
    for (let i = 0; i < depth; i++) {
        const parent = counter.document.createElement('span');
        parent.append('X甲', ' ', nested);
        nested = parent;
    }
    counter.document.body.append(nested);
    context.hooks.translateNode(nested);
    const nodes = 3 * depth + 2;
    assert.ok(context.calls <= 2 * nodes, `translateNode called ${context.calls} times for ${nodes} nodes`);
    counter.close();
});

test('CJK gap handling follows node removal, deep inline edits, author whitespace, reused separators and streaming neighbors', async () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
    const win = dom.window;
    const doc = win.document;
    const pause = async () => { await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); };
    win.eval(generateJs());
    win.__agCnRuntimeStart();
    const add = html => { const el = doc.createElement('div'); el.innerHTML = html; doc.body.append(el); return el; };

    const removal = add('<span>Settings<!----> <!----><b>Help</b>Bob</span>');
    const deep = add('<span>Settings<!----> <!----><a><span><span><span>Help</span></span></span></a></span>');
    const author = add('<span style="white-space:pre-wrap">甲<!----> <!---->乙</span>');
    const sep = add('<span>Settings<!----> <!---->Help</span>');
    const stream = doc.createTextNode('測試');
    const host = doc.createElement('div');
    host.setAttribute('data-testid', 'planner-response-text');
    const section = doc.createElement('section');
    for (let i = 0; i < 1200; i++) { const s = doc.createElement('span'); s.textContent = 'abcdefghij'; section.append(s); }
    host.append(stream, section);
    const box = doc.createElement('div');
    box.append('甲', ' ', host);
    doc.body.append(box);
    await pause();
    assert.equal(removal.textContent, '設定說明Bob');
    assert.equal(deep.textContent, '設定說明');
    // 兩側都不是這裡翻譯出來的中文（作者刻意留的空白、使用者或 AI 的內容）：不動
    assert.equal(author.textContent, '甲 乙');

    // React 只刪除節點（addedNodes 為空）：刪除位置兩側重新判斷，空白還原
    removal.querySelector('b').remove();
    // 四層行內標記裡的文字換成英文：外層的空白也要還原
    deep.querySelector('a span span span').firstChild.data = 'Bob';
    await pause();
    assert.equal(removal.textContent, '設定 Bob');
    assert.equal(deep.textContent, '設定 Bob');

    // 收掉的空白被 React 改成分隔字再清空：舊紀錄作廢，之後不得「還原」出已刪掉的空白
    const sepSpan = sep.firstChild;
    const gap = Array.from(sepSpan.childNodes).find(n => n.nodeType === win.Node.TEXT_NODE && n.data === '');
    gap.data = '/';
    await pause();
    gap.data = '';
    await pause();
    sepSpan.firstChild.data = 'Alice';
    sepSpan.lastChild.data = 'Bob';
    await pause();
    assert.equal(sep.textContent, 'AliceBob');

    // 串流中的 AI 回覆緊鄰空白：判斷空白時不讀整段回覆，也不收掉兩側都未經翻譯的空白
    const desc = Object.getOwnPropertyDescriptor(win.Node.prototype, 'textContent');
    let hostReads = 0;
    Object.defineProperty(host, 'textContent', { configurable: true, get() { hostReads++; return desc.get.call(this); } });
    for (let i = 0; i < 3; i++) { stream.data = '測試' + i; await pause(); }
    delete host.textContent;
    assert.equal(hostReads, 0);
    assert.ok(box.textContent.startsWith('甲 測試2'), box.textContent.slice(0, 8));
    win.close();
});

test('icon fallbacks clean up after the icon class is removed and keep accessible names; attribute rules and source ellipsis survive', async () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
    const win = dom.window;
    const doc = win.document;
    const pause = async () => { await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); };
    win.eval(generateJs());
    win.__agCnRuntimeStart();
    const add = html => { const el = doc.createElement('div'); el.innerHTML = html; doc.body.append(el); return el; };

    const icon = add('<span class="google-symbols">comment</span>');
    const buttons = add('<button><span class="google-symbols">comment</span></button><button><span class="google-symbols" aria-hidden="true">comment</span></button>');
    const labels = add('<button aria-label="Label for Foo">a</button><button aria-label="Open the Swarm UI">b</button><button aria-label="Open Settings">c</button>');
    const ellipsis = add('<span>Show 3 more results…</span><button title="Show 3 more…">x</button>');
    await pause();

    // React 重用圖示的文字節點、拿掉圖示 class 並改成一般文字：補畫的 SVG 要移除
    const iconSpan = icon.firstChild;
    assert.equal(iconSpan.querySelectorAll('svg').length, 1);
    iconSpan.className = '';
    Array.from(iconSpan.childNodes).find(n => n.nodeType === win.Node.TEXT_NODE).data = 'Help';
    await pause();
    assert.equal(iconSpan.querySelectorAll('svg').length, 0);
    assert.equal(iconSpan.textContent, '說明');

    // 按鈕只靠圖示名稱提供無障礙名稱：清空文字後由 SVG 帶著名稱；宿主已隱藏時 SVG 也隱藏
    const [named, hidden] = buttons.querySelectorAll('svg');
    assert.equal(named.getAttribute('role'), 'img');
    assert.equal(named.getAttribute('aria-label'), '評論');
    assert.equal(hidden.getAttribute('aria-hidden'), 'true');
    assert.equal(hidden.hasAttribute('aria-label'), false);

    // 屬性：既有規則照常生效；代入的片段是完整英文片語時保留原文，不拼成中英夾雜
    const [labelFor, swarm, open] = labels.querySelectorAll('button');
    assert.equal(labelFor.getAttribute('aria-label'), 'Foo 的標籤');
    assert.equal(swarm.getAttribute('aria-label'), 'Open the Swarm UI');
    assert.equal(open.getAttribute('aria-label'), '開啟設定');

    // 原文用單一字元的「…」時，譯文也用「…」
    assert.equal(ellipsis.querySelector('span').textContent, '顯示另外 3 個結果…');
    assert.equal(ellipsis.querySelector('button').getAttribute('title'), '顯示另外 3 個…');
    win.close();
});

test('CJK spacing keeps the space beside Latin or symbols, ignores reused nodes, skips fillers the same way on both sides, re-checks grown ancestors, stays bounded and leaves editors alone', async () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
    const win = dom.window;
    const doc = win.document;
    const pause = async () => { await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); };
    // JSDOM 沒有實作 isContentEditable：照瀏覽器的行為補上，才能測「事後變成可編輯」的段落
    Object.defineProperty(win.HTMLElement.prototype, 'isContentEditable', { configurable: true, get() { return !!this.closest('[contenteditable="true"]'); } });
    win.eval(generateJs());
    win.__agCnRuntimeStart();
    const el = (tag, ...parts) => { const e = doc.createElement(tag); for (const p of parts) e.append(p); return e; };
    const para = (...parts) => { const p = el('p', ...parts); doc.body.append(p); return p; };
    // v2.35.1 宣告權限對話框的實際切法（名稱之後的片段）
    const rest = [' run in a dedicated', ' ', 'workspace', ' with its own permissions, which you can change anytime in the ', 'workspace', ' settings page.'];
    const tail = '建立的代理執行於專用的工作區中並擁有獨立權限，您可以隨時在工作區設定頁面中變更。';

    // 譯文靠空白那一側是英文或符號：空白保留
    const google = para('by allowing Google to collect and use my Interactions data, subject to the Google ', el('a', 'Privacy Policy'));
    const crumb = para('Settings - ', el('a', 'General'));
    // 曾是譯文的節點被 React 重用為使用者內容
    const reused = para('Settings', ' ', '乙');
    // 片段與名稱之間有空文字節點（占位）
    const filler = para('Agents created by ', '', '我的外掛', ...rest);
    // 名稱是行內小元素，之後 React 在開頭插入第三個子元素
    const inline = el('span', el('b', '我的'), el('i', '外掛'));
    const grown = para('Agents created by ', inline, ...rest);
    // 翻譯後才變成可編輯的段落
    const editable = para('Agents created by ', 'Foo', ...rest);
    await pause();

    assert.equal(google.textContent, '，允許 Google 收集並使用我的互動資料，並遵守 Google 隱私權政策');
    assert.equal(crumb.textContent, '設定 - 一般');

    assert.equal(reused.textContent, '設定乙');
    reused.firstChild.data = '甲';
    await pause();
    assert.equal(reused.textContent, '甲 乙');
    // 使用者內容之後剛好等於舊譯文：不再當作本套件的譯文，兩側都是使用者的中文，空白不動
    reused.firstChild.data = '設定';
    await pause();
    assert.equal(reused.textContent, '設定 乙');

    assert.equal(filler.textContent, '由我的外掛' + tail);
    filler.childNodes[2].data = 'Foo';
    await pause();
    assert.equal(filler.textContent, '由 Foo ' + tail);

    assert.equal(grown.textContent, '由我的外掛' + tail);
    inline.prepend(el('em', 'Foo'));
    await pause();
    assert.ok(grown.textContent.startsWith('由 Foo我的外掛 建立'), grown.textContent);

    assert.equal(editable.textContent, '由 Foo ' + tail);
    editable.setAttribute('contenteditable', 'true');
    editable.childNodes[1].data = '我的';
    await pause();
    assert.equal(editable.textContent, '由 我的 ' + tail);

    // 緊鄰空白的元素開頭有大量空文字節點（例如串流回覆）：每次變動只看有限個鄰居
    const nodeTypeDesc = Object.getOwnPropertyDescriptor(win.Node.prototype, 'nodeType');
    const countReads = async fillers => {
        const reply = el('div');
        for (let i = 0; i < fillers; i++) reply.append('');
        const stream = doc.createTextNode('x');
        reply.append(stream);
        para('Settings', ' ', reply);
        await pause();
        let reads = 0;
        Object.defineProperty(win.Node.prototype, 'nodeType', { configurable: true, get() { reads++; return nodeTypeDesc.get.call(this); } });
        try {
            for (let i = 0; i < 3; i++) { stream.data = 'y' + i; await pause(); }
        } finally {
            Object.defineProperty(win.Node.prototype, 'nodeType', nodeTypeDesc);
        }
        return reads;
    };
    const few = await countReads(0);
    const many = await countReads(1000);
    assert.ok(many - few < 200, `nodeType 讀取次數：沒有空節點 ${few}、1000 個空節點 ${many}`);
    win.close();
});

test('icon fallbacks handle blank text, host label removal and reused text nodes; capitalized names stay translatable and a moved source ellipsis keeps its form', async () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
    const win = dom.window;
    const doc = win.document;
    const pause = async () => { await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); };
    win.eval(generateJs());
    win.__agCnRuntimeStart();
    const add = html => { const el = doc.createElement('div'); el.innerHTML = html; doc.body.append(el); return el; };
    const textOf = el => Array.from(el.childNodes).find(n => n.nodeType === win.Node.TEXT_NODE);

    const blank = add('<span class="google-symbols">comment</span>');
    const labelled = add('<button><span class="google-symbols" aria-label="Comments">comment</span></button>');
    const sentence = doc.createElement('p');
    for (const t of ['Agents created by ', '我的外掛', ' run in a dedicated', ' ', 'workspace', ' settings page.']) sentence.append(t);
    doc.body.append(sentence);
    const attrs = add('<button title="Keep: My Project">a</button><button aria-label="Label for Foo…">b</button>');
    await pause();

    // 圖示文字改成空白：補畫的 SVG 要移除，不能被空白判斷提早擋下
    const blankHost = blank.firstChild;
    assert.equal(blankHost.querySelectorAll('svg').length, 1);
    textOf(blankHost).data = ' ';
    await pause();
    assert.equal(blankHost.querySelectorAll('svg').length, 0);

    // 宿主另有名稱時 SVG 隱藏；React 拿掉宿主的名稱後，改由 SVG 帶圖示名稱
    const labelledHost = labelled.querySelector('.google-symbols');
    const labelledSvg = labelledHost.querySelector('svg');
    assert.equal(labelledSvg.getAttribute('aria-hidden'), 'true');
    labelledHost.removeAttribute('aria-label');
    await pause();
    assert.equal(labelledSvg.hasAttribute('aria-hidden'), false);
    assert.equal(labelledSvg.getAttribute('role'), 'img');
    assert.ok(labelledSvg.getAttribute('aria-label'));

    // 曾顯示「由 」的文字節點被重用為圖示：之後鄰近內容改變，也不得把「由 」寫回 SVG 旁
    const prefix = sentence.firstChild;
    assert.equal(prefix.data, '由');
    sentence.className = 'google-symbols';
    prefix.data = 'comment';
    await pause();
    assert.equal(sentence.querySelectorAll('svg').length, 1);
    sentence.childNodes[2].data = 'Foo';
    await pause();
    assert.equal(prefix.data, '');

    // 大寫開頭的是名稱，不是英文片語：照常套用規則
    const [keep, labelFor] = attrs.querySelectorAll('button');
    assert.equal(keep.getAttribute('title'), '保留：My Project');
    // 規則調整語序後，原文結尾的「…」落在譯文中間，仍維持原文的寫法
    assert.equal(labelFor.getAttribute('aria-label'), 'Foo… 的標籤');
    win.close();
});

test('dictionary fragments drop built-in edge spaces next to Chinese names, restore them when React swaps the name, and leave user-chosen names untranslated', async () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
    const win = dom.window;
    const doc = win.document;
    const pause = async () => { await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); };
    win.eval(generateJs());
    win.__agCnRuntimeStart();
    // v2.35.1 宣告權限對話框的實際切法：每段字串是獨立文字節點，名稱是第 2 個節點
    const sentence = name => {
        const p = doc.createElement('p');
        for (const t of ['Agents created by ', name, ' run in a dedicated', ' ', 'workspace', ' with its own permissions, which you can change anytime in the ', 'workspace', ' settings page.']) p.append(t);
        doc.body.append(p);
        return p;
    };
    const tail = '建立的代理執行於專用的工作區中並擁有獨立權限，您可以隨時在工作區設定頁面中變更。';
    const cjk = sentence('自動化任務');
    const latin = sentence('Foo Plugin');
    // 名稱是使用者取的：剛好和字典詞條相同（Settings）也不翻譯
    const dictionaryName = sentence('Settings');
    await pause();
    assert.equal(cjk.textContent, '由自動化任務' + tail);
    assert.equal(latin.textContent, '由 Foo Plugin ' + tail);
    assert.equal(dictionaryName.textContent, '由 Settings ' + tail);

    cjk.childNodes[1].data = 'Foo Plugin';
    latin.childNodes[1].data = '我的外掛';
    await pause();
    assert.equal(cjk.textContent, '由 Foo Plugin ' + tail);
    assert.equal(latin.textContent, '由我的外掛' + tail);
    win.close();
});

test('v2.35.1 split-node sentences, Show N more variants, attribute phrases and CJK gap spacing localize cleanly', () => {
    const { JSDOM } = require('jsdom');
    const js = generateJs();
    // <!----> 只用來讓 HTML 解析器把相鄰字串拆成獨立文字節點；解析後移除，還原 React 用戶端渲染的真實 DOM
    const dom = new JSDOM(`<!doctype html><html><body>
        <span role="status" id="perm-guide">In System Settings, click <strong>+</strong>, choose<!----> <!----><strong>Antigravity</strong>, then turn it on.<!----> <!---->Already on? Select <strong>Antigravity</strong>, click <strong>–</strong>, then<!----> <!---->click <strong>+</strong> and add it again.</span>
        <span role="status" id="perm-guide-shown">In System Settings, turn on <strong>Antigravity</strong>. If it isn't in the list, drag it in from the small window next to System Settings.<!----> <!---->Already on? Select <strong>Antigravity</strong>, click <strong>–</strong>, then<!----> <!---->drag it back in from the small window.</span>
        <span id="send-now">Messages now send immediately. Configure in<!----> <span class="whitespace-nowrap"><button>settings</button>.</span></span>
        <span id="keybind">Inspect live bindings or record custom key chords filtered to<!----> <code>antigravity.</code> <!---->commands.</span>
        <span id="weekly"><span class="font-semibold">Weekly</span> on<!----> <!----><span class="font-semibold">Monday</span> around<!----> <!----><span class="font-semibold">9:00 AM</span></span>
        <span id="weekdays"><span class="font-semibold">Weekdays</span> around<!----> <!----><span class="font-semibold">9:00 AM</span></span>
        <div id="declared">Agents created by <!---->Foo Plugin<!----> run in a dedicated<!----> <!---->project<!----> with its own permissions, which you can change anytime in the <!---->project<!----> settings page.</div>
        <div id="no-plugin">No plugin found for<!----> <!----><span class="font-mono">foo-bar</span>.</div>
        <div data-testid="running-selection-bar"><span id="selected" class="text-foreground">3<!----> selected</span></div>
        <div id="more-ell">Show <!---->3<!----> more...</div>
        <div id="more-split">Show <!---->3<!----> more</div>
        <button id="more-single">Show 3 More</button>
        <button id="more-sub">Show 2 more subagents</button>
        <button id="more-all">+4 more (Show all)</button>
        <p id="links"><a>Privacy Policy</a> <a>Terms of Service</a></p>
        <button id="attr-phrase" aria-label="Open the Swarm UI" title="Add to chat input">x</button>
        <button id="attr-name" aria-label="Open Settings" title="Close Foo">y</button>
        <div class="agy-aux-tab"><div id="swarm-tab" class="agy-aux-tab-title" title="Swarm">Swarm</div></div>
        <div data-testid="conversation-row-history"><span id="history-title" class="truncate text-left">Settings</span></div>
        <span id="starting">Starting…</span>
    </body></html>`, { runScripts: 'outside-only' });
    const doc = dom.window.document;
    const walker = doc.createTreeWalker(doc.body, dom.window.NodeFilter.SHOW_COMMENT);
    const comments = [];
    while (walker.nextNode()) comments.push(walker.currentNode);
    comments.forEach(c => c.remove());

    const prefix = js.slice(0, js.indexOf('    const observer ='));
    const context = { Node: dom.window.Node, document: doc, console };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode, translateExactOrDynamic }; })();', context);
    const { translateNode, translateExactOrDynamic: tx } = context.hooks;
    translateNode(doc.body);
    const text = id => doc.getElementById(id).textContent;

    assert.equal(text('perm-guide'), '在「系統設定」中，按一下 +，選取 Antigravity，然後將它開啟。已經開啟？請選取 Antigravity，按一下 –，然後按一下 + 重新加入。');
    assert.equal(text('perm-guide-shown'), '在「系統設定」中，開啟 Antigravity。如果清單中沒有，請從「系統設定」旁的小視窗將它拖曳進來。已經開啟？請選取 Antigravity，按一下 –，然後從小視窗將它重新拖曳進來。');
    assert.equal(text('send-now'), '訊息現已改為立即傳送。可在設定中調整。');
    assert.equal(text('keybind'), '檢視目前生效的按鍵繫結，或錄製自訂按鍵組合，僅限 antigravity. 指令。');
    assert.equal(text('weekly'), '每週星期一約 9:00 AM');
    assert.equal(text('weekdays'), '平日約 9:00 AM');
    assert.equal(text('declared'), '由 Foo Plugin 建立的代理執行於專用的專案中並擁有獨立權限，您可以隨時在專案設定頁面中變更。');
    assert.equal(text('no-plugin'), '找不到外掛程式 foo-bar。');
    assert.equal(text('selected'), '3 項已選取');
    assert.equal(text('more-ell'), '顯示另外 3 個...');
    assert.equal(text('more-split'), '顯示另外 3 個');
    assert.equal(text('more-single'), '顯示另外 3 個');
    assert.equal(text('more-sub'), '顯示另外 2 個子代理');
    assert.equal(text('more-all'), '另外 +4 項（顯示全部）');
    // 文字直接走動態規則時，省略號同樣跟著原文
    assert.equal(tx('Show 3 more'), '顯示另外 3 個');
    assert.equal(tx('Show 3 more results'), '顯示另外 3 個結果');
    assert.equal(tx('Show 3 more...'), '顯示另外 3 個...');
    // 兩個並排連結之間的空白是分隔用的，不能收掉
    assert.equal(text('links'), '隱私權政策 服務條款');
    // 「動詞＋冠詞／介系詞」片語保留原文，避免「開啟 the Swarm UI」；一般「動詞＋名稱」照常翻譯
    assert.equal(doc.getElementById('attr-phrase').getAttribute('aria-label'), 'Open the Swarm UI');
    assert.equal(doc.getElementById('attr-phrase').getAttribute('title'), 'Add to chat input');
    assert.equal(doc.getElementById('attr-name').getAttribute('aria-label'), '開啟設定');
    assert.equal(doc.getElementById('attr-name').getAttribute('title'), '關閉 Foo');
    assert.equal(text('swarm-tab'), '蜂群');
    assert.equal(doc.getElementById('swarm-tab').getAttribute('title'), '蜂群');
    assert.equal(text('history-title'), 'Settings');

    assert.equal(tx('Stop 3 items?'), '確定要停止 3 個項目嗎？');
    assert.equal(tx('Stop 1 item?'), '確定要停止 1 個項目嗎？');
    assert.equal(tx('Antigravity needs Accessibility to use your computer.'), 'Antigravity 需要「輔助使用」權限才能操作您的電腦。');
    assert.equal(tx('Antigravity needs both to use your computer.'), 'Antigravity 需要這兩項權限才能操作您的電腦。');
    assert.equal(tx('Relaunch Antigravity to finish Screen Recording.'), '請重新啟動 Antigravity 以完成「螢幕錄製」設定。');
    assert.equal(tx('Agents created by this automation run in a dedicated project with its own permissions. You can change the permissions in the project settings page.'),
        '此自動化建立的代理會在專用的專案中執行，並擁有獨立權限。您可以在專案設定頁面中變更權限。');
    assert.equal(tx('1 tool'), '1 個工具');
    assert.equal(tx('5 tools · sign in for more'), '5 個工具 · 登入以取得更多');
    assert.equal(tx('See go/sidecars: https://example.com/x'), '請參閱 go/sidecars：https://example.com/x');
    assert.equal(tx('Starting...'), '正在啟動...');
    // 原文用單一字元的「…」：譯文跟著原文，不換成「...」
    assert.equal(text('starting'), '正在啟動…');
    assert.equal(tx('Loading bundle...'), '正在載入外掛程式套件...');
    assert.equal(tx('See more'), '顯示更多');
    assert.equal(tx('See less'), '顯示較少');
});

test('v2.35.1 main-process patches cover menu roles, SSH prompt titles, popup security, passkey QR and WSL notices', () => {
    const { patchMenuJs, patchSshPromptsJs, patchWebviewPopupSecurityJs, patchCablev2Js, patchQrEncoderJs, patchMainJs } = require('../src/main_patches');

    const menuTw = patchMenuJs('function build(menu){ electron_1.Menu.setApplicationMenu(menu); }', true);
    for (const pair of ["'Reload': '重新載入'", "'Force Reload': '強制重新載入'", "'Show Substitutions': '顯示替代'", "'Smart Quotes': '智慧型引號'", "'Start Speaking': '開始朗讀'"]) {
        assert.ok(menuTw.includes(pair), pair);
    }
    assert.ok(patchMenuJs('function build(menu){ electron_1.Menu.setApplicationMenu(menu); }', false).includes("'Force Reload': '强制重新加载'"));

    const fakeSp = [
        '<html lang="en"${dark ? \' class="dark"\' : \'\'}>',
        '<p class="context">Connecting to <span id="label"></span></p>',
        '<div class="buttons"><button id="cancel" class="secondary">Cancel</button><button id="continue" class="primary">Continue</button></div>',
        'function a(who) { return `Password for ${who}`; }',
        'function b(asked, hostPromptsMarked, label) { return `${asked[0]} for ${hostPromptsMarked ? asked[1] : label}`; }'
    ].join('\n');
    const sp = patchSshPromptsJs(fakeSp, true);
    assert.ok(sp.includes('<html lang="zh-TW"'));
    assert.ok(sp.includes('<p class="context">正在連線至 <span id="label"></span></p>'));
    assert.ok(sp.includes('<button id="cancel" class="secondary">取消</button><button id="continue" class="primary">繼續</button>'));
    const titleFns = new Function(sp.split('\n').slice(3).join('\n') + '\nreturn { a, b };')();
    assert.equal(titleFns.a('me@devbox'), 'me@devbox 的密碼');
    assert.equal(titleFns.b(['Passphrase', 'id_ed25519'], true, 'devbox'), 'id_ed25519 的金鑰密碼');
    assert.equal(titleFns.b(['Password'], false, 'devbox'), 'devbox 的密碼');
    assert.equal(titleFns.b(['Token'], false, 'devbox'), 'Token for devbox');

    const fakeWps = [
        "    insecure: 'Not secure',",
        "            { role: 'cut', enabled: canCut },",
        "        lines.push('', state.level === 'secure' ? 'Certificate is valid' : 'Certificate details');",
        "        message: extractOrigin(state.url) ?? (state.url || 'This page'),"
    ].join('\n');
    const wps = patchWebviewPopupSecurityJs(fakeWps, true);
    assert.ok(wps.includes("insecure: '不安全',"));
    assert.ok(wps.includes("{ role: 'cut', label: '剪下', enabled: canCut }"));
    assert.ok(wps.includes("'憑證有效' : '憑證詳細資訊'"));
    assert.ok(wps.includes("(state.url || '此頁面')"));

    const fakeCable = [
        '<html lang="en">',
        '<title>Passkeys</title>',
        '<h1 class="sheet-title">Passkeys</h1>',
        '<p class="mechanism-header">Use your phone or tablet</p>',
        '<p class="hint">Scan this QR code with the camera on the device that has your passkey for ${safeRpId}</p>',
        '<button onclick="window.close()">Cancel</button>',
        "updateStatus('Connecting to your device…')"
    ].join('\n');
    const cable = patchCablev2Js(fakeCable, true);
    for (const zh of ['<html lang="zh-TW">', '<title>通行金鑰</title>', '使用手機或平板電腦', '請使用存有 ${safeRpId} 通行金鑰的裝置，以相機掃描此 QR 碼', 'onclick="window.close()">取消</button>', "updateStatus('正在連線至您的裝置…')"]) {
        assert.ok(cable.includes(zh), zh);
    }
    assert.ok(patchQrEncoderJs('<svg aria-label="Passkey QR code">', true).includes('aria-label="通行金鑰 QR 碼"'));

    const wsl = patchMainJs('const m = { message: `The WSL distro "${WSL_DISTRO}" is no longer installed.` };', true);
    assert.ok(wsl.includes('WSL 發行版「${WSL_DISTRO}」已不在此電腦上。'));
});

test('v2.35.1 SSH remote flow: connection status, error explanations, host and config-file checks and dialog titles are localized', () => {
    const { REMOTE_TEXT_TABLES, patchRemoteTextJs, patchSshErrorTextJs, patchRemoteManagerJs, patchMainJs, patchWizardHtmlJs, MAIN_PROCESS_PATCH_TARGETS } = require('../src/main_patches');
    const placeholders = s => (s.match(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g) || []).map(p => p.replace(/'[^']*'/g, "''")).sort().join('|');
    for (const [rel, rows] of Object.entries(REMOTE_TEXT_TABLES)) {
        assert.ok(MAIN_PROCESS_PATCH_TARGETS.includes(rel), `${rel} 必須列入打包驗證的允許清單`);
        const needles = new Set();
        for (const [needle, sc, tc] of rows) {
            assert.ok(!needles.has(needle), `${rel} 重複的原文：${needle}`);
            needles.add(needle);
            for (const zh of [sc, tc]) {
                assert.equal(placeholders(zh), placeholders(needle), `${rel} 譯文必須保留原句的全部變數：${needle}`);
                assert.ok(!zh.includes(needle), `${rel} 譯文不可再含原文：${needle}`);
                assert.ok(/[　-〿一-鿿＀-￯]/.test(zh), `${rel} 譯文必須是中文：${zh}`);
            }
        }
    }

    const argsSrc = [
        "exports.LINUX_HOST_NEEDED = 'Antigravity needs a Linux host on x64 or arm64 with glibc 2.26 or newer.';",
        'function describe(code, prompts) {',
        '    switch (code) {',
        "        case 'CONNECTION_FAILED':",
        "            return `Couldn't connect to the SSH host. Check its name, your network and ssh config (e.g. a ProxyCommand), and that ssh to it works in a terminal${prompts === 'no' ? ' without a prompt' : ''}.`;",
        "        case 'UNSUPPORTED_HOST':",
        "            return `The SSH host isn't supported. ${exports.LINUX_HOST_NEEDED} Windows and macOS hosts aren't supported yet.`;",
        '        default:',
        "            return `Couldn't connect to the SSH host (${String(code)}).`;",
        '    }',
        '}',
        'return describe;'
    ].join('\n');
    const describeTw = new Function('exports', patchRemoteTextJs('dist/remote/sshArgs.js', argsSrc, true))({});
    assert.equal(describeTw('CONNECTION_FAILED', 'no'), '無法連線至 SSH 主機。請檢查主機名稱、網路與 ssh 設定（例如 ProxyCommand），並確認在終端機中不需任何提示就能用 ssh 連線至該主機。');
    assert.equal(describeTw('UNSUPPORTED_HOST', 'yes'), '不支援這個 SSH 主機。Antigravity 需要使用 glibc 2.26 以上版本、x64 或 arm64 架構的 Linux 主機。目前尚未支援 Windows 與 macOS 主機。');
    assert.equal(describeTw('WEIRD'), '無法連線至 SSH 主機（WEIRD）。');
    const describeSc = new Function('exports', patchRemoteTextJs('dist/remote/sshArgs.js', argsSrc, false))({});
    assert.equal(describeSc('CONNECTION_FAILED', 'yes'), '无法连接到 SSH 主机。请检查主机名、网络和 ssh 配置（例如 ProxyCommand），并确认在终端中可以用 ssh 连接到该主机。');

    const connSrc = [
        'function describeStatus(text, label) {',
        '    switch (text) {',
        "        case 'downloading':",
        '            return `Downloading the Antigravity server on ${label}…`;',
        "        case 'checking other host':",
        '            return `Checking whether another host still runs your Antigravity server…`;',
        '        default:',
        '            return undefined;',
        '    }',
        '}',
        'function describeExit(code, signal, lastLine) {',
        '    const how = signal ? `signal ${signal}` : `exit code ${code}`;',
        '    return lastLine',
        '        ? `ssh exited (${how}): ${(0, types_1.sanitizeRemoteText)(lastLine, 300)}`',
        '        : `ssh exited (${how}).`;',
        '}',
        'function stall(firstLineMs) {',
        '    return `${this.label} did not start the setup within ${Math.round(firstLineMs / 1000)} s. ` +',
        "                    'ssh (e.g. a ProxyCommand or ProxyJump login) or a command in ' +",
        "                    'your shell startup files (e.g. ~/.bashrc) may be waiting for input.';",
        '}',
        'return { describeStatus, describeExit, stall };'
    ].join('\n');
    const connPatched = patchRemoteTextJs('dist/remote/sshConnection.js', connSrc, true);
    const conn = new Function('types_1', connPatched)({ sanitizeRemoteText: s => s });
    assert.equal(conn.describeStatus('downloading', 'devbox'), '正在 devbox 上下載 Antigravity 伺服器…');
    assert.equal(conn.describeStatus('checking other host', 'devbox'), '正在檢查是否仍有其他主機在執行您的 Antigravity 伺服器…');
    assert.equal(conn.describeExit(255, null, ''), 'ssh 已結束（結束代碼 255）。');
    assert.equal(conn.describeExit(null, 'SIGTERM', 'Connection reset'), 'ssh 已結束（訊號 SIGTERM）：Connection reset');
    assert.equal(conn.stall.call({ label: 'devbox' }, 15000), 'devbox 未在 15 秒內開始設定。可能是 ssh（例如 ProxyCommand 或 ProxyJump 登入）或 shell 啟動檔（例如 ~/.bashrc）中的指令正在等待輸入。');
    assert.equal(patchRemoteTextJs('dist/remote/sshConnection.js', connPatched, true), connPatched, '重複套用不得再改動');

    const cfgSrc = [
        'const invalid = (problem) => new Error(`The SSH config file ${problem}`);',
        'const NOT_CONFIG = "isn\'t an SSH config file";',
        "const CHOOSE_CONFIG = 'Choose a file of ssh settings, such as ~/.ssh/config.';",
        'const notConfig = (why) => ({ what: NOT_CONFIG, why, fix: CHOOSE_CONFIG });',
        'const BINARY = notConfig("it\'s a binary file");',
        'function describeSshConfigProblem(file, { what, why, fix }) {',
        '    return `${file} ${what}: ${why}. ${fix}`;',
        '}',
        "const shown = 'cfg';",
        "return [describeSshConfigProblem('/bin/ls', BINARY), invalid(`must be an absolute path (got ${shown}).`).message, invalid(`${shown} doesn't exist or can't be read.`).message];"
    ].join('\n');
    assert.deepEqual(new Function(patchRemoteTextJs('dist/remote/sshConfigHosts.js', cfgSrc, true))(), [
        '/bin/ls 不是 SSH 設定檔：這是二進位檔案。請選擇 ssh 設定檔，例如 ~/.ssh/config。',
        'SSH 設定檔必須是絕對路徑（目前為 cfg）。',
        'SSH 設定檔（cfg）不存在或無法讀取。'
    ]);

    const destSrc = "const port = 'x'; return ['The host name is missing.', `Invalid port \"${port}\": use a number from 1 to 65535.`, 'Enter an SSH host, for example \"devbox\" or \"user@host:2222\".'];";
    assert.deepEqual(new Function(patchRemoteTextJs('dist/remote/sshDestination.js', destSrc, true))(), ['缺少主機名稱。', '連接埠「x」無效：請使用 1 到 65535 之間的數字。', '請輸入 SSH 主機，例如「devbox」或「user@host:2222」。']);

    const errSrc = [
        "function logPath() { return '/tmp/main.log'; }",
        'function codeAndLogs(err) {',
        '    return `Error code: ${err.code}\\nLogs: ${logPath()}`;',
        '}',
        'function detailOf(err, label) {',
        '    const text = err.message;',
        '    return err.reportedByRemote ? `${label} reported: ${text}` : text;',
        '}',
        'function withLog(text) { return `${text}\\nLogs: ${logPath()}`; }',
        'return { codeAndLogs, detailOf, withLog };'
    ].join('\n');
    const errTw = new Function(patchSshErrorTextJs(errSrc, true))();
    assert.equal(errTw.codeAndLogs({ code: 'UNKNOWN' }), '錯誤代碼：UNKNOWN\n記錄檔：/tmp/main.log');
    assert.equal(errTw.detailOf({ reportedByRemote: true, message: 'disk full' }, 'devbox'), 'devbox 回報：disk full');
    assert.equal(errTw.withLog('無法連線'), '無法連線\n記錄檔：/tmp/main.log');
    assert.equal(new Function(patchSshErrorTextJs(errSrc, false))().codeAndLogs({ code: 'UNKNOWN' }), '错误代码：UNKNOWN\n日志：/tmp/main.log');

    const rm = patchRemoteManagerJs([
        "this.reportError(err, entry.label, 'Could not stop the SSH server', win);",
        "this.reportError(err, entry.label, 'Sign-in failed', win);",
        "throw new types_1.RemoteError('CANCELLED', 'Connection cancelled.');"
    ].join('\n'), true);
    for (const zh of ["'無法停止 SSH 伺服器'", "'登入失敗'", "'已取消連線。'"]) assert.ok(rm.includes(zh), zh);

    const wslMain = patchMainJs('const msg = `Failed to install the server into WSL distro "${WSL_DISTRO}":\\n${err.message}`;', true);
    assert.ok(wslMain.includes('`無法將伺服器安裝到 WSL 發行版「${WSL_DISTRO}」：\\n${err.message}`'));
    assert.ok(patchWizardHtmlJs('<html lang="en">', true).includes('<html lang="zh-TW">'));
    // 本專案標榜台灣中文化：原生頁面不論模式一律宣告 zh-TW
    assert.ok(patchWizardHtmlJs('<html lang="en">', false).includes('<html lang="zh-TW">'));
});

test('plugin and feature names stay in the original language (upstream #63)', () => {
    const { JSDOM } = require('jsdom');
    const js = generateJs();
    const dom = new JSDOM(`<!doctype html><html><body>
        <span id="n1">Chief of Staff</span><span id="n2">Concierge</span><span id="n3">Data Agent Kit</span>
        <span id="n4">Google Workspace</span><span id="n5">Google Developer Knowledge</span>
        <span id="s1">Sent to Chief of Staff</span><span id="s2">Chief of Staff voice mode is active</span>
        <span id="s3">Welcome to the Concierge</span><span id="s4">Welcome to your Chief of Staff</span>
    </body></html>`, { runScripts: 'outside-only' });
    const doc = dom.window.document;
    const prefix = js.slice(0, js.indexOf('    const observer ='));
    const context = { Node: dom.window.Node, document: doc, console };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode }; })();', context);
    context.hooks.translateNode(doc.body);
    const text = id => doc.getElementById(id).textContent;
    for (const [id, name] of [['n1', 'Chief of Staff'], ['n2', 'Concierge'], ['n3', 'Data Agent Kit'], ['n4', 'Google Workspace'], ['n5', 'Google Developer Knowledge']]) {
        assert.equal(text(id), name, `${name} 應保留原文`);
    }
    assert.equal(text('s1'), '已傳送給 Chief of Staff');
    // 原本誤用 Concierge 的譯名「語音助手」
    assert.equal(text('s2'), 'Chief of Staff 語音模式已啟用');
    assert.equal(text('s3'), '歡迎使用 Concierge');
    assert.equal(text('s4'), '歡迎使用您的 Chief of Staff');
});
