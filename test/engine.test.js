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
    assert.equal(tx('Opens the New Conversation screen for this project'), '開啟此 專案 的新對話畫面');
    assert.equal(tx('Replaced by newer request'), '已由較新的請求取代');
});






