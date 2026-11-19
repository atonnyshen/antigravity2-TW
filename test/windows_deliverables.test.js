'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const { readAsarLayout } = require('../src/asar_patcher');
const watcher = require('../auto_localize_watcher');

function countLoneLf(buf) {
    let count = 0;
    for (let i = 0; i < buf.length; i++) {
        if (buf[i] === 0x0a && (i === 0 || buf[i - 1] !== 0x0d)) count++;
    }
    return count;
}

function hasUtf8Bom(buf) {
    return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

test('Windows .bat files are pure ASCII with strict CRLF, no BOM, and safe cmd patterns', () => {
    const batFiles = fs.readdirSync(repo).filter(f => f.toLowerCase().endsWith('.bat'));
    assert.deepEqual(batFiles.sort(), [
        '點兩下卸載Windows背景守護.bat',
        '點兩下安裝Windows背景守護.bat',
        '點兩下安裝繁體中文.bat',
        '點兩下還原官方英文.bat'
    ], 'Expected exactly the 4 Traditional Chinese .bat launchers');

    const commandFiles = fs.readdirSync(repo).filter(f => f.toLowerCase().endsWith('.command'));
    assert.deepEqual(commandFiles.sort(), [
        '點兩下卸載macOS背景守護.command',
        '點兩下安裝macOS背景守護.command',
        '點兩下安裝繁體中文.command',
        '點兩下還原官方英文.command'
    ], 'Expected exactly the 4 Traditional Chinese .command launchers');

    for (const file of batFiles) {
        const buf = fs.readFileSync(path.join(repo, file));
        const text = buf.toString('ascii');
        assert.equal(hasUtf8Bom(buf), false, `${file} must NOT have UTF-8 BOM`);
        assert.equal(countLoneLf(buf), 0, `${file} must use CRLF everywhere (no lone LF)`);
        for (let i = 0; i < buf.length; i++) {
            assert.ok(buf[i] <= 0x7f, `${file} contains non-ASCII byte 0x${buf[i].toString(16)} at offset ${i}`);
        }
        assert.match(text, /chcp 65001 >nul/i, `${file} must switch console to UTF-8`);
        assert.match(text, /cd \/d "%~dp0"/i, `${file} must cd to its directory with quotes`);
        assert.match(text, /%ProgramFiles%\\nodejs\\node\.exe/i, `${file} must probe standard Node.js path`);
        assert.match(text, /goto :check_node_ver/i, `${file} should use goto labels instead of fragile parenthesized blocks`);
        assert.doesNotMatch(text, /ExecutionPolicy|powershell|npm ci/i, `${file} must not run PowerShell Bypass or npm ci`);
    }
});

test('Windows .ps1 files have UTF-8 BOM, strict CRLF, zero 4-byte Emojis, and no remote dropper patterns', () => {
    const ps1Files = fs.readdirSync(repo).filter(f => f.toLowerCase().endsWith('.ps1'));
    assert.deepEqual(ps1Files.sort(), ['install_windows_autowatcher.ps1', 'uninstall_windows_autowatcher.ps1']);

    for (const file of ps1Files) {
        const buf = fs.readFileSync(path.join(repo, file));
        assert.equal(hasUtf8Bom(buf), true, `${file} must have UTF-8 BOM for PowerShell 5.1`);
        assert.equal(countLoneLf(buf), 0, `${file} must use strict CRLF`);
        const text = buf.slice(3).toString('utf8');
        assert.equal(/[\u{10000}-\u{10FFFF}]/u.test(text), false, `${file} must not contain 4-byte Emojis`);
        assert.doesNotMatch(text, /Invoke-WebRequest|Expand-Archive|irm\s|iex\b|ExecutionPolicy|npm ci/i, `${file} must not download/extract remote archives`);
    }
});

test('macOS .command and .sh files use strict LF and valid bash syntax', () => {
    const unixScripts = fs.readdirSync(repo).filter(f => f.endsWith('.command') || f.endsWith('.sh'));
    assert.deepEqual(unixScripts.sort(), [
        'install_macos_autowatcher.sh',
        'uninstall_macos_autowatcher.sh',
        '點兩下卸載macOS背景守護.command',
        '點兩下安裝macOS背景守護.command',
        '點兩下安裝繁體中文.command',
        '點兩下還原官方英文.command'
    ], 'Expected exactly the 4 Traditional Chinese .command and 2 .sh scripts');
    for (const file of unixScripts) {
        const full = path.join(repo, file);
        const buf = fs.readFileSync(full);
        assert.equal(buf.includes(0x0d), false, `${file} must NOT contain CR bytes`);
        if (process.platform !== 'win32') {
            const mode = fs.statSync(full).mode;
            assert.ok((mode & 0o111) !== 0, `${file} must have executable permission`);
            const syn = spawnSync('bash', ['-n', full], { encoding: 'utf8' });
            assert.equal(syn.status, 0, `${file} bash -n failed: ${syn.stderr}`);
        }
    }
});

test('.gitattributes enforces CRLF for .bat/.ps1 and LF for .command/.sh', () => {
    const attr = fs.readFileSync(path.join(repo, '.gitattributes'), 'utf8');
    assert.match(attr, /^\*\.bat\s+text\s+eol=crlf/m);
    assert.match(attr, /^\*\.ps1\s+text\s+eol=crlf/m);
    assert.match(attr, /^\*\.command\s+text\s+eol=lf/m);
    assert.match(attr, /^\*\.sh\s+text\s+eol=lf/m);
});

test('localization_engine.js removes AV-trigger proxy DLL strings and blind taskkill', () => {
    const engineSrc = fs.readFileSync(path.join(repo, 'localization_engine.js'), 'utf8');
    assert.doesNotMatch(engineSrc, /version\.dll|dbghelp\.dll|proxy_config/);
    assert.doesNotMatch(engineSrc, /else if \(process\.platform === 'win32'\)\s*\{\s*try\s*\{\s*child_process\.execSync\('taskkill/);
});

test('watcher Windows candidate discovery handles LOCALAPPDATA, Program Files, x86, drive roots, spaces & CJK', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-win-cand-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const localApp = path.join(root, 'Users', '王 小明', 'AppData', 'Local');
    const progX86 = path.join(root, 'Program Files (x86)');
    const ideDir = path.join(localApp, 'Programs', 'Antigravity IDE');
    const customDir = path.join(root, 'Custom Path With 空白', 'Antigravity');

    fs.mkdirSync(path.join(ideDir, 'resources'), { recursive: true });
    fs.writeFileSync(path.join(ideDir, 'resources', 'app.asar'), 'stub');
    fs.mkdirSync(path.join(customDir, 'resources'), { recursive: true });
    fs.writeFileSync(path.join(customDir, 'resources', 'app.asar'), 'stub');

    const candidates = watcher.getWindowsAppCandidates({
        env: {
            LOCALAPPDATA: localApp,
            ProgramFiles: path.join(root, 'Program Files'),
            'ProgramFiles(x86)': progX86,
            ANTIGRAVITY_HOME: customDir
        },
        includeRegistry: false
    });
    assert.ok(candidates.includes(customDir));
    assert.ok(candidates.includes(path.join(localApp, 'Programs', 'antigravity')));
    assert.ok(candidates.includes(ideDir));
    assert.ok(candidates.includes(path.join(progX86, 'Antigravity')));

    const resolvedCustom = watcher.getAppInfo({
        platform: 'win32',
        env: { ANTIGRAVITY_HOME: customDir, LOCALAPPDATA: localApp },
        includeRegistry: false
    });
    assert.equal(resolvedCustom.appPath, customDir);

    const resolvedIde = watcher.getAppInfo({
        platform: 'win32',
        env: { LOCALAPPDATA: localApp },
        includeRegistry: false
    });
    assert.equal(resolvedIde.appPath, ideDir);
});

test('watcher Windows Task Scheduler XML installer/uninstaller handles spaces, CJK, &, UTF-16LE BOM & cleanup', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-win-task-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const disableFlag = path.join(root, '.disable_autowatcher');
    fs.writeFileSync(disableFlag, 'disabled\n');

    const calls = [];
    let writtenXmlBuf = null;
    let writtenXmlPath = null;
    const fakeExec = (bin, args) => {
        calls.push({ bin, args });
        return '';
    };

    const nodePath = 'C:\\Program Files\\nodejs\\node.exe';
    const scriptPath = 'C:\\Users\\測試 & 使用者\\Desktop\\antigravity2-TW\\auto_localize_watcher.js';
    const installRes = watcher.installWindowsTask({
        nodePath,
        scriptPath,
        baseDir: root,
        runLevel: 'HighestAvailable',
        onXmlWritten: (xmlPath, buf) => {
            writtenXmlPath = xmlPath;
            writtenXmlBuf = buf;
        },
        execFileSyncFn: fakeExec
    });

    assert.equal(fs.existsSync(disableFlag), false, 'Installing task should clear .disable_autowatcher');
    assert.ok(writtenXmlPath && !fs.existsSync(writtenXmlPath), 'Temp XML file must be cleaned up after schtasks');
    assert.ok(writtenXmlBuf && writtenXmlBuf[0] === 0xff && writtenXmlBuf[1] === 0xfe, 'XML must have UTF-16LE BOM for schtasks /XML');
    const decodedXml = writtenXmlBuf.slice(2).toString('utf16le');
    assert.match(decodedXml, /^<\?xml version="1\.0" encoding="UTF-16"\?>\r\n/);
    assert.match(decodedXml, /<Interval>PT5M<\/Interval>/);
    assert.match(decodedXml, /<LogonType>InteractiveToken<\/LogonType>/);
    assert.match(decodedXml, /<RunLevel>HighestAvailable<\/RunLevel>/);
    assert.match(decodedXml, /<Command>C:\\Program Files\\nodejs\\node\.exe<\/Command>/);
    assert.match(decodedXml, /<Arguments>&quot;C:\\Users\\測試 &amp; 使用者\\Desktop\\antigravity2-TW\\auto_localize_watcher\.js&quot;<\/Arguments>/);

    assert.equal(calls.length, 2);
    assert.equal(calls[0].bin, 'schtasks.exe');
    assert.equal(calls[0].args[0], '/create');
    assert.equal(calls[0].args[1], '/tn');
    assert.equal(calls[0].args[2], 'AntigravityAutoLocalize');
    assert.equal(calls[0].args[3], '/xml');
    assert.equal(calls[0].args[5], '/f');
    assert.deepEqual(calls[1].args, ['/run', '/tn', 'AntigravityAutoLocalize']);

    // Uninstall when task exists
    const uninstallCalls = [];
    const resExisting = watcher.uninstallWindowsTask({
        baseDir: root,
        execFileSyncFn: (bin, args) => {
            uninstallCalls.push({ bin, args });
            return '';
        }
    });
    assert.equal(resExisting.existed, true);
    assert.equal(resExisting.deleted, true);
    assert.equal(fs.existsSync(disableFlag), true);
    assert.deepEqual(uninstallCalls[0].args, ['/query', '/tn', 'AntigravityAutoLocalize']);
    assert.deepEqual(uninstallCalls[1].args, ['/delete', '/tn', 'AntigravityAutoLocalize', '/f']);

    // Uninstall idempotently when task does not exist
    const resMissing = watcher.uninstallWindowsTask({
        baseDir: root,
        execFileSyncFn: (bin, args) => {
            if (args[0] === '/query') throw new Error('ERROR: The system cannot find the file specified.');
            throw new Error('Should not call /delete when query failed');
        }
    });
    assert.equal(resMissing.existed, false);
    assert.equal(resMissing.deleted, false);
});

test('stress: CLI interactive brand modes, CJK+space paths, restore, and missing backup guard', async t => {
    const asar = await import('@electron/asar');
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ag stress 測試 $ path-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const source = path.join(root, 'source');
    const appRoot = path.join(root, 'Antigravity 桌面版');
    const resources = path.join(appRoot, 'resources');
    fs.mkdirSync(path.join(source, 'dist'), { recursive: true });
    fs.mkdirSync(resources, { recursive: true });
    fs.writeFileSync(path.join(source, 'dist', 'preload.js'), '// official preload\n');
    const archive = path.join(resources, 'app.asar');
    await asar.createPackage(source, archive);
    const officialBuf = fs.readFileSync(archive);

    // Case 1: Restore before any backup exists -> must fail cleanly without altering app.asar
    const earlyRestore = spawnSync(
        process.execPath,
        [path.join(repo, 'localization_engine.js'), '--tw', '--huifu', '--no-kill', '--install-dir', appRoot],
        { encoding: 'utf8', timeout: 30000 }
    );
    assert.notEqual(earlyRestore.status, 0);
    assert.deepEqual(fs.readFileSync(archive), officialBuf);

    // Case 2: Interactive selection across modes ('2' hidden, '3' translated, '' default english)
    const cases = [
        { input: '2\n', checkDict: dict => assert.equal(dict.Antigravity, '') },
        { input: '3\n', checkDict: dict => assert.ok(typeof dict.Antigravity === 'string' && dict.Antigravity.length > 0) },
        { input: '\n', checkDict: dict => assert.equal('Antigravity' in dict, false) }
    ];
    for (const tc of cases) {
        const res = spawnSync(
            process.execPath,
            [path.join(repo, 'localization_engine.js'), '--tw', '--interactive', '--no-kill', '--install-dir', appRoot],
            { input: tc.input, encoding: 'utf8', timeout: 30000 }
        );
        assert.equal(res.status, 0, res.stdout + res.stderr);
        const layout = readAsarLayout(archive);
        const preload = layout.files.get('dist/preload.js').body.toString('utf8');
        new vm.Script(preload);
        const m = preload.match(/const map = new Map\(Object\.entries\((\{[\s\S]*?\})\)\);/);
        assert.ok(m, 'dictionary map must exist in injected preload');
        const dict = JSON.parse(m[1]);
        tc.checkDict(dict);
        assert.deepEqual(fs.readFileSync(archive + '.bak'), officialBuf);
    }

    // Case 3: Restore returns byte-for-byte official app.asar
    const restoreRes = spawnSync(
        process.execPath,
        [path.join(repo, 'localization_engine.js'), '--tw', '--huifu', '--no-kill', '--install-dir', appRoot],
        { encoding: 'utf8', timeout: 30000 }
    );
    assert.equal(restoreRes.status, 0, restoreRes.stdout + restoreRes.stderr);
    assert.deepEqual(fs.readFileSync(archive), officialBuf);
});

test('Windows read-only Program Files ACL triggers admin guidance cleanly', () => {
    const script = `
        Object.defineProperty(process, 'platform', { value: 'win32' });
        process.argv = [process.execPath, 'engine', '--tw'];
        const fs = require('fs');
        const origWrite = fs.writeFileSync;
        fs.writeFileSync = function(p, ...args) {
            if (typeof p === 'string' && p.includes('.permission_probe')) {
                const err = new Error('EPERM: operation not permitted, open ' + p);
                err.code = 'EPERM';
                throw err;
            }
            return origWrite.apply(this, [p, ...args]);
        };
        const { ensureWritePermission } = require(${JSON.stringify(path.join(repo, 'localization_engine.js'))});
        ensureWritePermission('C:\\\\Program Files\\\\Antigravity\\\\resources');
    `;
    const run = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /以系統管理員身分執行/);
});

test('README.md and README_TW.md match repo files, terminology, and runtime promises', () => {
    const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8');
    const readmeTw = fs.readFileSync(path.join(repo, 'README_TW.md'), 'utf8');
    assert.equal(readme, readmeTw, 'README.md and README_TW.md must stay synchronized');

    assert.doesNotMatch(readme, /irm\s+https?:\/\/.*\s*\|\s*iex/i, 'Must not promote irm | iex');
    assert.doesNotMatch(readme, /install_windows\.ps1|點兩下還原VSCode擴充官方英文/, 'Must not reference deleted scripts');
    assert.match(readme, /執行期零外部依賴/);

    const referencedScripts = readme.matchAll(/`([^`\n]+\.(?:bat|ps1|command|sh))`/g);
    for (const match of referencedScripts) {
        const scriptName = match[1].replace(/^\.[\\/]/, '');
        assert.ok(fs.existsSync(path.join(repo, scriptName)), `Referenced script must exist in repo: ${scriptName}`);
    }

    // Verify all TW terms promised in README terminology table exist in dicts_tw/*.json values
    const twValues = new Set();
    for (const file of fs.readdirSync(path.join(repo, 'dicts_tw')).filter(f => f.endsWith('.json'))) {
        const data = JSON.parse(fs.readFileSync(path.join(repo, 'dicts_tw', file), 'utf8'));
        for (const v of Object.values(data)) twValues.add(String(v));
    }
    const allTwJoined = Array.from(twValues).join('\n');
    const promisedTerms = [
        '命令選擇區',
        '儲存庫',
        '代理',
        '設定排程任務',
        '終端機指令',
        '本機',
        '外掛程式',
        '快速鍵',
        '儲存',
        '重新啟動',
        '存取原則',
        'Token 預算額度已超限',
        '可重複使用',
        '尚無對話記錄',
        '好'
    ];
    for (const term of promisedTerms) {
        assert.ok(allTwJoined.includes(term), `Promised TW term "${term}" must exist in dicts_tw/`);
    }

    assert.ok(fs.existsSync(path.join(repo, 'AI_INSTALL_GUIDE.md')), 'AI_INSTALL_GUIDE.md must be bundled');
    assert.ok(fs.existsSync(path.join(repo, 'AGENTS.md')), 'AGENTS.md must be bundled');
    const aiGuide = fs.readFileSync(path.join(repo, 'AI_INSTALL_GUIDE.md'), 'utf8');
    assert.match(aiGuide, /--no-kill/);
    assert.match(aiGuide, /--install-windows-task/);
    assert.match(aiGuide, /--uninstall-windows-task/);
    assert.match(aiGuide, /--huifu/);
    assert.match(aiGuide, /第一階段：唯讀檢查/);
});

test('v2.33.0 remoteManager, wizardHtml, SVG-only loadingOverlay, and runtime browser/keybinding rules work', () => {
    const patches = require('../src/main_patches');
    const rmSample = `dialog.showMessageBox(parent, { title: 'Choose another SSH config file', buttons: ['Choose Another File…', 'Cancel'] });
    dialog.showMessageBox(win, { title: 'Microphone access', message: \`Allow \${label} to use your microphone?\`, buttons: ['Allow', 'Block'] });
    dialog.showMessageBox(win, { title: 'Shared home directory', buttons: ['Take Over', 'Cancel'] });
    dialog.showMessageBox(win, { title: 'Restart SSH server', message: \`\${label} is running server \${running}; this app is \${expected}. Restart the server now?\`, detail: \`Any \${what} still running on it stops. The server starts again with this app's version.\` });`;
    const rmPatched = patches.patchRemoteManagerJs(rmSample, true);
    assert.ok(rmPatched.includes("title: '選取另一個 SSH 設定檔'"));
    assert.ok(rmPatched.includes("title: '麥克風存取權限'"));
    assert.ok(rmPatched.includes("title: '共用家目錄'"));
    assert.ok(rmPatched.includes("title: '重新啟動 SSH 伺服器'"));

    const wizardSample = `<title>Welcome to Antigravity</title><div class="text">Setting up…</div><h1>Welcome to the new Antigravity!</h1><span>Download the Antigravity IDE</span><button class="btn-primary" id="btn-skip">Explore the new Antigravity</button>`;
    const wizardPatched = patches.patchWizardHtmlJs(wizardSample, true);
    assert.ok(wizardPatched.includes('<title>歡迎使用 Antigravity</title>'));
    assert.ok(wizardPatched.includes('>正在設定…<'));
    assert.ok(wizardPatched.includes('<span>下載 Antigravity IDE</span>'));

    const svgOnlyLoading = 'function getLoadingHtml(){return `<svg class="logo"></svg>`;}';
    assert.equal(patches.patchLoadingOverlayJs(svgOnlyLoading, true), svgOnlyLoading);

    process.argv.push('--tw');
    const { generateJs } = require('../localization_engine');
    const js = generateJs();
    const prefix = js.slice(0, js.indexOf('    const observer ='));
    const context = { Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 } };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode }; })();', context);
    const { translateNode } = context.hooks;

    for (const [input, expected] of [
        ['Clear Browsing Data?', '要清除瀏覽資料嗎？'],
        ['Cookies by Site', '依網站檢視 Cookie'],
        ['Keybinding Scheme', '快速鍵設定方案'],
        ['No sites match “example.com”.', '找不到符合「example.com」的網站。'],
        ["Couldn't delete cookies for example.com. Try again.", '無法刪除 example.com 的 Cookie，請再試一次。'],
        ['Microphone problem', '麥克風發生問題'],
        ['Unarchive the main conversation to insert', '請先取消封存主對話再插入']
    ]) {
        const node = { nodeType: 3, nodeValue: input };
        translateNode(node);
        assert.equal(node.nodeValue, expected, input);
    }
});
