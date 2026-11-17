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
    const prefix = js.slice(0, js.indexOf('    const observer = new MutationObserver'));
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
    const prefix = js.slice(0, js.indexOf('    const observer = new MutationObserver'));
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
    const prefix = js.slice(0, js.indexOf('    const observer = new MutationObserver'));
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

test('main process and native dialog patches localize quit, IPC and SSH dialogs', () => {
    const {
        patchMainJs,
        patchIpcHandlersJs,
        patchRemoteManagerJs,
        patchSshPromptsJs
    } = require('../src/main_patches');

    const fakeMain = `const options = {
        buttons: ['Cancel', 'Quit'],
        title: 'Confirm Quit',
        message: 'Are you sure you want to quit?',
        detail: 'There may be agents or background tasks running.'
    };
    dialog.showErrorBox('Binary not found', msg);
    dialog.showErrorBox('Startup failed', msg);`;
    const patchedMain = patchMainJs(fakeMain, true);
    assert.ok(patchedMain.includes("title: '確認結束'"));
    assert.ok(patchedMain.includes("message: '您確定要結束 Antigravity 嗎？'"));
    assert.ok(patchedMain.includes("buttons: ['取消', '結束']"));
    assert.ok(patchedMain.includes("dialog.showErrorBox('找不到執行檔'"));

    const fakeIpc = `dialog.showErrorBox('Cannot open folder', t.error);
    void dialog.showMessageBox({ message: 'Folder is on the Windows filesystem' });
    const r = await dialog.showOpenDialog({ title: 'Open workspace' });`;
    const patchedIpc = patchIpcHandlersJs(fakeIpc, true);
    assert.ok(patchedIpc.includes("dialog.showErrorBox('無法開啟資料夾'"));
    assert.ok(patchedIpc.includes("message: '資料夾位於 Windows 檔案系統'"));
    assert.ok(patchedIpc.includes("title: '開啟工作區'"));

    const fakeRm = `dialog.showMessageBox(win, {
        buttons: ['Stop Server', 'Cancel'],
        title: 'Stop SSH server',
        message: \`Stop the Antigravity server on \${entry.label}?\`
    });`;
    const patchedRm = patchRemoteManagerJs(fakeRm, true);
    assert.ok(patchedRm.includes("title: '停止 SSH 伺服器'"));
    assert.ok(patchedRm.includes("buttons: ['停止伺服器', '取消']"));

    const fakeSp = `dialog.showMessageBox(parent, {
        message: 'Touch your security key',
        buttons: confirm ? ['Yes', 'No'] : ['Cancel']
    });`;
    const patchedSp = patchSshPromptsJs(fakeSp, true);
    assert.ok(patchedSp.includes("message: '請輕觸您的安全性金鑰'"));
    assert.ok(patchedSp.includes("buttons: confirm ? ['是', '否'] : ['取消']"));
});

test('user greeting handles dynamic user name and fragmented DOM nodes', () => {
    const js = generateJs();
    const prefix = js.slice(0, js.indexOf('    const observer = new MutationObserver'));
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



