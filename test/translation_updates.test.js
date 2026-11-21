'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const {
    verifyZipEntries, extractZipArchive, validateTranslationPack,
    installTranslationUpdate, downloadVerifiedAsset, readActiveTranslation
} = require('../scripts/auto_updater');
const { buildTranslationPack, makeStoredZip } = require('../scripts/build_translation_pack');
const watcher = require('../auto_localize_watcher');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag2tw-translations-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}

test('translation-only ZIP is well-formed and has no executable files', t => {
    const root = fixture(t);
    const zip = path.join(root, 'translations.zip');
    const packed = buildTranslationPack({
        version: '3.7.2', minEngineVersion: '3.7.1',
        maxEngineVersion: '3.7.9', output: zip
    });
    assert.ok(packed.entries > 3);
    assert.equal(verifyZipEntries(zip).entries, packed.entries);
    const extracted = extractZipArchive(zip, path.join(root, 'extracted'));
    const manifest = validateTranslationPack(extracted, '3.7.2', '3.7.1');
    assert.equal(manifest.version, '3.7.2');
    assert.equal(manifest.schemaVersion, 2);
    assert.deepEqual(fs.readdirSync(extracted).sort(),
        ['dicts', 'dicts_tw', 'rules', 'translation-pack.json'].sort());
    assert.throws(() => validateTranslationPack(extracted, '3.7.2', '3.8.0'), /incompatible/);
});

test('ZIP traversal is rejected before extraction', t => {
    const root = fixture(t);
    const zip = path.join(root, 'escape.zip');
    fs.writeFileSync(zip, makeStoredZip([['../escape.txt', Buffer.from('untrusted')]]));
    assert.throws(() => verifyZipEntries(zip), /Unsafe ZIP entry path/);
    assert.throws(() => extractZipArchive(zip, path.join(root, 'out')), /Unsafe ZIP entry path/);
    assert.equal(fs.existsSync(path.join(root, 'escape.txt')), false);
});

test('downloader refuses to fetch a Release without a mandatory SHA-256', async t => {
    const root = fixture(t);
    await assert.rejects(
        downloadVerifiedAsset('https://github.com/atonnyshen/antigravity2-TW', path.join(root, 'incomplete.zip')),
        /mandatory SHA-256/
    );
});

test('code self-upgrade API and update-policy switches are absent', () => {
    const updater = require('../scripts/auto_updater');
    for (const obsolete of [
        'selfUpdateWatcher', 'applySelfUpdateAtomic', 'validateExtractedPackage',
        'MANAGED_FILES', 'MANAGED_DIRS', 'selectReleaseAsset'
    ]) {
        assert.equal(Object.hasOwn(updater, obsolete), false, obsolete);
    }
    assert.equal(Object.hasOwn(watcher, 'readUpdateMode'), false);
    assert.equal(Object.hasOwn(watcher, 'setUpdateMode'), false);
    const updaterText = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'auto_updater.js'), 'utf8');
    assert.doesNotMatch(updaterText, /function (?:applySelfUpdateAtomic|selfUpdateWatcher)\b/);
});

test('translation update changes only immutable data snapshot and pointer', async t => {
    const root = fixture(t);
    const sourceZip = path.join(root, 'translation.zip');
    buildTranslationPack({
        version: '3.7.2', minEngineVersion: '3.7.1',
        maxEngineVersion: '3.7.9', output: sourceZip
    });
    const targetDir = path.join(root, 'runtime');
    fs.mkdirSync(targetDir);
    fs.writeFileSync(path.join(targetDir, 'localization_engine.js'), 'original-engine');
    fs.writeFileSync(path.join(targetDir, 'auto_localize_watcher.js'), 'original-watcher');
    fs.mkdirSync(path.join(targetDir, 'dicts_tw'));
    fs.writeFileSync(path.join(targetDir, 'dicts_tw', 'common.json'), '{"Settings":"original"}');
    const sha = crypto.createHash('sha256').update(fs.readFileSync(sourceZip)).digest('hex');
    const release = {
        tag: 'v3.7.2',
        assets: [{
            name: 'antigravity2-TW-translations-v3.7.2.zip',
            browser_download_url: 'https://github.com/atonnyshen/antigravity2-TW/releases/download/v3.7.2/translation.zip',
            digest: `sha256:${sha}`
        }]
    };
    const opts = {
        targetDir, currentEngineVersion: '3.7.1', release,
        downloadFn: async (_url, dest, { expectedDigest }) => {
            assert.equal(expectedDigest, `sha256:${sha}`);
            fs.copyFileSync(sourceZip, dest);
        }
    };
    const result = await installTranslationUpdate(opts);
    assert.equal(result.updated, true);
    assert.equal(result.dataOnly, true);
    assert.equal(fs.readFileSync(path.join(targetDir, 'localization_engine.js'), 'utf8'), 'original-engine');
    assert.equal(fs.readFileSync(path.join(targetDir, 'auto_localize_watcher.js'), 'utf8'), 'original-watcher');
    assert.equal(fs.readFileSync(path.join(targetDir, 'dicts_tw', 'common.json'), 'utf8'), '{"Settings":"original"}');
    assert.equal(readActiveTranslation(targetDir).version, '3.7.2');
    assert.equal((await installTranslationUpdate(opts)).reason, 'translation_up_to_date');
});

test('existing localization engine loads the active translation snapshot without updating JS', t => {
    const root = fixture(t);
    const repo = path.resolve(__dirname, '..');
    for (const name of ['localization_engine.js', 'package.json']) {
        fs.copyFileSync(path.join(repo, name), path.join(root, name));
    }
    fs.mkdirSync(path.join(root, 'src'));
    for (const name of ['asar_patcher.js', 'main_patches.js', 'preload_runtime.js', 'rules_schema.js']) {
        fs.copyFileSync(path.join(repo, 'src', name), path.join(root, 'src', name));
    }
    const packVersion = '9.9.9';
    const pack = path.join(root, '.translation-packs', packVersion);
    fs.mkdirSync(pack, { recursive: true });
    fs.cpSync(path.join(repo, 'dicts_tw'), path.join(pack, 'dicts_tw'), { recursive: true });
    fs.cpSync(path.join(repo, 'dicts'), path.join(pack, 'dicts'), { recursive: true });
    const settingsFile = path.join(pack, 'dicts_tw', 'page_settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    settings.General = '純翻譯通道測試';
    fs.writeFileSync(settingsFile, JSON.stringify(settings));
    const state = path.join(root, '.watcher-state');
    fs.mkdirSync(state);
    fs.writeFileSync(path.join(state, 'active_translation.json'), JSON.stringify({ version: packVersion }));
    const command = `process.argv.push('--tw');const x=require(${JSON.stringify(path.join(root, 'localization_engine.js'))});const s=x.generateJs();console.log(s.includes('純翻譯通道測試'),s.includes('\\"translationVersion\\":\\"9.9.9\\"'));`;
    const result = spawnSync(process.execPath, ['-e', command], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /true true/);
});

test('installed watcher automatically updates only translations without a separate switch', async t => {
    const root = fixture(t);
    const stateDir = path.join(root, '.watcher-state');
    fs.mkdirSync(stateDir);
    const originalEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    t.after(() => {
        if (originalEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalEnv;
    });
    let checks = 0;
    let installs = 0;
    let reapplications = 0;
    let unexpectedCodeUpdates = 0;
    const updater = {
        readActiveTranslation: () => null,
        checkUpdate: async ({ currentVersion }) => {
            checks++;
            assert.equal(currentVersion, '3.7.1');
            return { hasUpdate: true, tag: 'v3.7.2', release: { tag: 'v3.7.2', assets: [] } };
        },
        installTranslationUpdate: async () => {
            installs++;
            return { updated: true, newVersion: '3.7.2' };
        },
        selfUpdateWatcher: () => { unexpectedCodeUpdates++; throw new Error('No code updates allowed'); },
        notifyMac() {}
    };
    const result = await watcher.refreshTranslationsAndReapply({
        targetDir: root,
        stateDir,
        updater,
        currentVersion: '3.7.1',
        execReapplyFn: () => { reapplications++; },
        verifyReapplyFn: () => true
    });
    assert.equal(result.updated, true);
    assert.equal(checks, 1);
    assert.equal(installs, 1);
    assert.equal(reapplications, 1);
    assert.equal(unexpectedCodeUpdates, 0);
    assert.equal(fs.existsSync(path.join(stateDir, 'update_policy.json')), false);
});

test('active translation version is used for remote checks, not old engine version', async t => {
    const root = fixture(t);
    const stateDir = path.join(root, '.watcher-state');
    fs.mkdirSync(stateDir);
    const previous = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    t.after(() => {
        if (previous === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous;
    });
    let checked = null, downloads = 0;
    const result = await watcher.refreshTranslationsAndReapply({
        targetDir: root,
        stateDir,
        updater: {
            readActiveTranslation: () => ({ version: '3.7.5' }),
            checkUpdate: async (input) => {
                checked = input.currentVersion;
                return { hasUpdate: false };
            },
            installTranslationUpdate: async () => { downloads++; throw new Error('Must not download'); }
        },
        currentVersion: '3.7.1'
    });
    assert.equal(checked, '3.7.5');
    assert.equal(downloads, 0);
    assert.equal(result.reason, 'up_to_date');
});

test('no translation-only asset never triggers executable-code update', async t => {
    const root = fixture(t);
    const stateDir = path.join(root, '.watcher-state');
    fs.mkdirSync(stateDir);
    const prior = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    t.after(() => {
        if (prior === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = prior;
    });
    let downloads = 0, reapplies = 0;
    const result = await watcher.refreshTranslationsAndReapply({
        targetDir: root, stateDir,
        updater: {
            checkUpdate: async () => ({ hasUpdate: true, tag: 'v3.7.2', release: {
                tag: 'v3.7.2', assets: [{
                    name: 'antigravity2-TW-v3.7.2.zip',
                    browser_download_url: 'https://github.com/atonnyshen/antigravity2-TW/releases/download/v3.7.2/full.zip'
                }]
            } }),
            installTranslationUpdate: async ({ release }) => {
                const { selectTranslationAsset } = require('../scripts/auto_updater');
                if (selectTranslationAsset(release.assets, release.tag)) downloads++;
                return { updated: false, reason: 'no_translation_only_asset' };
            },
            notifyMac() {}
        },
        execReapplyFn: () => { reapplies++; }
    });
    assert.equal(result.reason, 'no_translation_only_asset');
    assert.equal(downloads, 0);
    assert.equal(reapplies, 0);
});

test('failed post-download reapplication restores the previous translation pointer', async t => {
    const root = fixture(t);
    const stateDir = path.join(root, '.watcher-state');
    fs.mkdirSync(stateDir);
    const stateFile = path.join(stateDir, 'active_translation.json');
    fs.writeFileSync(stateFile, JSON.stringify({ version: '3.7.4' }));
    const previousEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    t.after(() => {
        if (previousEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousEnv;
    });
    const updater = {
        readActiveTranslation: () => ({ version: JSON.parse(fs.readFileSync(stateFile, 'utf8')).version }),
        checkUpdate: async () => ({ hasUpdate: true, tag: 'v3.7.5', release: { tag: 'v3.7.5' } }),
        installTranslationUpdate: async () => {
            fs.writeFileSync(stateFile, JSON.stringify({ version: '3.7.5' }));
            return { updated: true, newVersion: '3.7.5' };
        }
    };
    await assert.rejects(watcher.refreshTranslationsAndReapply({
        targetDir: root, stateDir, updater, currentVersion: '3.7.1',
        execReapplyFn: () => { throw new Error('mock ASAR write failure'); }
    }), /mock ASAR write failure/);
    assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).version, '3.7.4');
});

test('failed first translation update clears its pointer and falls back to bundled dictionaries', async t => {
    const root = fixture(t);
    const stateDir = path.join(root, '.watcher-state');
    fs.mkdirSync(stateDir);
    const stateFile = path.join(stateDir, 'active_translation.json');
    const prevEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    t.after(() => {
        if (prevEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = prevEnv;
    });
    await assert.rejects(watcher.refreshTranslationsAndReapply({
        targetDir: root, stateDir, currentVersion: '3.7.1',
        updater: {
            readActiveTranslation: () => null,
            checkUpdate: async () => ({ hasUpdate: true, tag: 'v3.7.2', release: { tag: 'v3.7.2' } }),
            installTranslationUpdate: async () => {
                fs.writeFileSync(stateFile, JSON.stringify({ version: '3.7.2' }));
                return { updated: true, newVersion: '3.7.2' };
            }
        },
        execReapplyFn: () => { throw new Error('mock ASAR write failure'); }
    }), /mock ASAR write failure/);
    assert.equal(fs.existsSync(stateFile), false);
});

test('successful child exit without new deployed translation is treated as failure and rolls back pointer', async t => {
    const root = fixture(t);
    const stateDir = path.join(root, '.watcher-state');
    fs.mkdirSync(stateDir);
    const stateFile = path.join(stateDir, 'active_translation.json');
    fs.writeFileSync(stateFile, JSON.stringify({ version: '3.7.4' }));
    const oldEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    t.after(() => {
        if (oldEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = oldEnv;
    });
    let reapplyCalls = 0;
    await assert.rejects(watcher.refreshTranslationsAndReapply({
        targetDir: root, stateDir, currentVersion: '3.7.1',
        updater: {
            readActiveTranslation: () => ({ version: '3.7.4' }),
            checkUpdate: async () => ({ hasUpdate: true, tag: 'v3.7.5', release: { tag: 'v3.7.5' } }),
            installTranslationUpdate: async () => {
                fs.writeFileSync(stateFile, JSON.stringify({ version: '3.7.5' }));
                return { updated: true, newVersion: '3.7.5' };
            }
        },
        execReapplyFn: () => { reapplyCalls++; },
        verifyReapplyFn: () => false
    }), /app.asar 未載入新版翻譯/);
    assert.equal(reapplyCalls, 2, 'failed postcondition retries previous translation only after pointer rollback');
    assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).version, '3.7.4');
});

test('independent mismatch reproduction: a clean child exit is recovered to old ASAR and pointer', async t => {
    const root = fixture(t);
    const stateDir = path.join(root, '.watcher-state');
    fs.mkdirSync(stateDir);
    const stateFile = path.join(stateDir, 'active_translation.json');
    const asarFile = path.join(root, 'isolated-app.asar');
    fs.writeFileSync(stateFile, JSON.stringify({ version: '3.7.4' }));
    fs.writeFileSync(asarFile, 'translationVersion 3.7.4');
    const previousEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    t.after(() => {
        if (previousEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousEnv;
    });
    let reapplications = 0;
    await assert.rejects(watcher.refreshTranslationsAndReapply({
        targetDir: root, stateDir, currentVersion: '3.7.1',
        updater: {
            readActiveTranslation: () => ({ version: '3.7.4' }),
            checkUpdate: async () => ({ hasUpdate: true, tag: 'v3.7.5', release: { tag: 'v3.7.5' } }),
            installTranslationUpdate: async () => {
                fs.writeFileSync(stateFile, JSON.stringify({ version: '3.7.5' }));
                return { updated: true, newVersion: '3.7.5' };
            }
        },
        execReapplyFn: () => {
            reapplications++;
            const pointer = JSON.parse(fs.readFileSync(stateFile, 'utf8')).version;
            fs.writeFileSync(asarFile, 'translationVersion ' + (reapplications === 1 ? '3.7.99' : pointer));
        },
        verifyReapplyFn: version => fs.readFileSync(asarFile, 'utf8') === 'translationVersion ' + version
    }), /app.asar 未載入新版翻譯/);
    assert.equal(reapplications, 2);
    assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).version, '3.7.4');
    assert.equal(fs.readFileSync(asarFile, 'utf8'), 'translationVersion 3.7.4');
});

test('failed secondary recovery never falsely claims successful translation update', async t => {
    const root = fixture(t);
    const stateDir = path.join(root, '.watcher-state');
    fs.mkdirSync(stateDir);
    const stateFile = path.join(stateDir, 'active_translation.json');
    const asarFile = path.join(root, 'isolated-app.asar');
    fs.writeFileSync(stateFile, JSON.stringify({ version: '3.7.4' }));
    fs.writeFileSync(asarFile, 'translationVersion 3.7.4');
    const previousEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    t.after(() => {
        if (previousEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousEnv;
    });
    let reapplications = 0;
    await assert.rejects(watcher.refreshTranslationsAndReapply({
        targetDir: root, stateDir, currentVersion: '3.7.1',
        updater: {
            readActiveTranslation: () => ({ version: '3.7.4' }),
            checkUpdate: async () => ({ hasUpdate: true, tag: 'v3.7.5', release: { tag: 'v3.7.5' } }),
            installTranslationUpdate: async () => {
                fs.writeFileSync(stateFile, JSON.stringify({ version: '3.7.5' }));
                return { updated: true, newVersion: '3.7.5' };
            }
        },
        execReapplyFn: () => {
            reapplications++;
            fs.writeFileSync(asarFile, 'translationVersion 3.7.99');
        },
        verifyReapplyFn: version => fs.readFileSync(asarFile, 'utf8') === 'translationVersion ' + version
    }), /app.asar 未載入新版翻譯/);
    assert.equal(reapplications, 2);
    assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).version, '3.7.4');
    assert.equal(fs.readFileSync(asarFile, 'utf8'), 'translationVersion 3.7.99');
    // The mismatch remains, but unlike the previous implementation it is
    // explicitly reported and the caller receives a non-success outcome.
});

test('data-driven runtime_rules.json updates dynamic rules, scoped terms, and protected labels without touching JS', t => {
    const root = fixture(t);
    const repo = path.resolve(__dirname, '..');
    for (const name of ['localization_engine.js', 'package.json']) {
        fs.copyFileSync(path.join(repo, name), path.join(root, name));
    }
    fs.mkdirSync(path.join(root, 'src'));
    for (const name of ['asar_patcher.js', 'main_patches.js', 'preload_runtime.js', 'rules_schema.js']) {
        fs.copyFileSync(path.join(repo, 'src', name), path.join(root, 'src', name));
    }
    const packVersion = '9.9.9';
    const pack = path.join(root, '.translation-packs', packVersion);
    fs.mkdirSync(pack, { recursive: true });
    fs.cpSync(path.join(repo, 'dicts_tw'), path.join(pack, 'dicts_tw'), { recursive: true });
    fs.cpSync(path.join(repo, 'dicts'), path.join(pack, 'dicts'), { recursive: true });
    fs.cpSync(path.join(repo, 'rules'), path.join(pack, 'rules'), { recursive: true });

    const rulesPath = path.join(pack, 'rules', 'runtime_rules.json');
    const rulesObj = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    rulesObj.protected.modelEffortLabels.push('Turbo Effort');
    rulesObj.scopedMaps.swarm.Pulse = { sc: '脉搏', tw: '脈搏' };
    rulesObj.dynamicRules.unshift({
        id: 'future-ui-banner',
        pattern: '^Future feature (.+?) ready$',
        flags: 'i',
        transforms: { '1': 'trim' },
        sc: '新功能 {1} 已就绪',
        tw: '新功能 {1} 已就緒'
    });
    fs.writeFileSync(rulesPath, JSON.stringify(rulesObj, null, 2));

    const state = path.join(root, '.watcher-state');
    fs.mkdirSync(state);
    fs.writeFileSync(path.join(state, 'active_translation.json'), JSON.stringify({ version: packVersion }));

    const script = `
        process.argv.push('--tw');
        const vm = require('node:vm');
        const { JSDOM } = require(${JSON.stringify(require.resolve('jsdom'))});
        const engine = require(${JSON.stringify(path.join(root, 'localization_engine.js'))});
        const js = engine.generateJs();
        const dom = new JSDOM('<!doctype html><body><div id="fut">Future feature Alpha ready</div><div class="o2" id="sw"><span>Pulse</span></div><div data-testid="model-selector-effort-option" id="eff">Turbo Effort</div></body>', { runScripts: 'outside-only' });
        const prefix = js.slice(0, js.indexOf('    const observer ='));
        const ctx = { Node: dom.window.Node, document: dom.window.document, console };
        vm.runInNewContext(prefix + '\\n globalThis.hooks = { translateNode }; })();', ctx);
        ctx.hooks.translateNode(dom.window.document.body);
        console.log(JSON.stringify({
            fut: dom.window.document.getElementById('fut').textContent,
            sw: dom.window.document.querySelector('#sw span').textContent,
            eff: dom.window.document.getElementById('eff').textContent
        }));
    `;
    const run = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 0, run.stderr);
    const out = JSON.parse(run.stdout.trim());
    assert.equal(out.fut, '新功能 Alpha 已就緒');
    assert.equal(out.sw, '脈搏');
    assert.equal(out.eff, 'Turbo Effort');
});

test('validateTranslationPack rejects ReDoS regexes, forbidden TW terms, and v1 packs smuggling rules/', t => {
    const repo = path.resolve(__dirname, '..');

    const makeBasePack = () => {
        const dir = fixture(t);
        fs.cpSync(path.join(repo, 'dicts'), path.join(dir, 'dicts'), { recursive: true });
        fs.cpSync(path.join(repo, 'dicts_tw'), path.join(dir, 'dicts_tw'), { recursive: true });
        fs.cpSync(path.join(repo, 'rules'), path.join(dir, 'rules'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'translation-pack.json'), JSON.stringify({
            schemaVersion: 2, version: '3.7.3', minEngineVersion: '3.7.3', maxEngineVersion: '3.7.9'
        }));
        return dir;
    };

    const redosDir = makeBasePack();
    const redosRulesPath = path.join(redosDir, 'rules', 'runtime_rules.json');
    const redosRules = JSON.parse(fs.readFileSync(redosRulesPath, 'utf8'));
    redosRules.dynamicRules.push({
        id: 'evil-redos',
        pattern: '^(a+)+$',
        flags: '',
        sc: '测试 {1}',
        tw: '測試 {1}'
    });
    fs.writeFileSync(redosRulesPath, JSON.stringify(redosRules));
    assert.throws(() => validateTranslationPack(redosDir, '3.7.3', '3.7.3'), /unsafe or invalid regex/);

    const badTermDir = makeBasePack();
    const badRulesPath = path.join(badTermDir, 'rules', 'runtime_rules.json');
    const badRules = JSON.parse(fs.readFileSync(badRulesPath, 'utf8'));
    badRules.dynamicRules.push({
        id: 'bad-term-leak',
        pattern: '^Leak (.+)$',
        flags: '',
        sc: '脚本 {1}',
        tw: '腳本 {1}'
    });
    fs.writeFileSync(badRulesPath, JSON.stringify(badRules));
    assert.throws(() => validateTranslationPack(badTermDir, '3.7.3', '3.7.3'), /terminology and dictionary alignment checks/);

    const v1SmuggledDir = makeBasePack();
    fs.writeFileSync(path.join(v1SmuggledDir, 'translation-pack.json'), JSON.stringify({
        schemaVersion: 1, version: '3.7.3', minEngineVersion: '3.7.3', maxEngineVersion: '3.7.9'
    }));
    assert.throws(() => validateTranslationPack(v1SmuggledDir, '3.7.3', '3.7.3'), /unexpected files/);

    const extraReDoS = [
        '^(a|a)+$',
        '^(a|ab)+$',
        '^([a-z]|\\w)+$',
        '^(.+)\\1+$',
        '^(?=(a+))\\1+b$',
        '^(?:a|a){2,20}$',
        '^.*a.*a.*a.*a.*a.*b$',
        'Future feature (.+)'
    ];
    for (const pat of extraReDoS) {
        const probeDir = makeBasePack();
        const pPath = path.join(probeDir, 'rules', 'runtime_rules.json');
        const pObj = JSON.parse(fs.readFileSync(pPath, 'utf8'));
        pObj.dynamicRules.push({ id: 'probe-redos', pattern: pat, flags: '', sc: '测试 {1}', tw: '測試 {1}' });
        fs.writeFileSync(pPath, JSON.stringify(pObj));
        assert.throws(() => validateTranslationPack(probeDir, '3.7.3', '3.7.3'), /unsafe or invalid regex/, pat);
    }

    const wrongRulesNameDir = makeBasePack();
    fs.renameSync(
        path.join(wrongRulesNameDir, 'rules', 'runtime_rules.json'),
        path.join(wrongRulesNameDir, 'rules', 'other.json')
    );
    assert.throws(() => validateTranslationPack(wrongRulesNameDir, '3.7.3', '3.7.3'), /must contain only runtime_rules\.json/);

    const symlinkDir = makeBasePack();
    fs.unlinkSync(path.join(symlinkDir, 'translation-pack.json'));
    fs.writeFileSync(path.join(symlinkDir, 'real-manifest.json'), JSON.stringify({
        schemaVersion: 2, version: '3.7.3', minEngineVersion: '3.7.3', maxEngineVersion: '3.7.9'
    }));
    fs.symlinkSync('real-manifest.json', path.join(symlinkDir, 'translation-pack.json'));
    assert.throws(() => validateTranslationPack(symlinkDir, '3.7.3', '3.7.3'), /unexpected files or links/);
});

test('placeholder tokens and end markers in dict/rules cannot corrupt generated JS or Sidecar slicing', t => {
    const root = fixture(t);
    const repo = path.resolve(__dirname, '..');
    const vm = require('node:vm');
    const { patchPreloadJs } = require('../src/main_patches');

    for (const name of ['localization_engine.js', 'package.json']) {
        fs.copyFileSync(path.join(repo, name), path.join(root, name));
    }
    fs.mkdirSync(path.join(root, 'src'));
    for (const name of ['asar_patcher.js', 'main_patches.js', 'preload_runtime.js', 'rules_schema.js']) {
        fs.copyFileSync(path.join(repo, 'src', name), path.join(root, 'src', name));
    }
    fs.cpSync(path.join(repo, 'dicts'), path.join(root, 'dicts'), { recursive: true });
    fs.cpSync(path.join(repo, 'dicts_tw'), path.join(root, 'dicts_tw'), { recursive: true });
    fs.cpSync(path.join(repo, 'rules'), path.join(root, 'rules'), { recursive: true });

    const pageMainPath = path.join(root, 'dicts_tw', 'page_main.json');
    const pageMain = JSON.parse(fs.readFileSync(pageMainPath, 'utf8'));
    pageMain['Breakout probe'] = 'RULES_PLACEHOLDER DICT_PLACEHOLDER </script> /* --- ANTIGRAVITY CHINESE LOCALIZATION END --- */';
    fs.writeFileSync(pageMainPath, JSON.stringify(pageMain, null, 2));

    const script = `
        process.argv.push('--tw');
        const engine = require(${JSON.stringify(path.join(root, 'localization_engine.js'))});
        console.log(engine.generateJs());
    `;
    const run = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 0, run.stderr);
    const js = run.stdout.trim();

    const sigStart = '/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */';
    const sigEnd = '/* --- ANTIGRAVITY CHINESE LOCALIZATION END --- */';
    assert.equal(js.indexOf(sigEnd), js.lastIndexOf(sigEnd), 'Injected payload must have only one real end marker');
    assert.ok(!js.includes('</script>'), 'JSON embed must escape </script>');
    const patchedPreload = patchPreloadJs('orig', js, sigStart, sigEnd);
    const restoredPreload = patchPreloadJs(patchedPreload, '', sigStart, sigEnd);
    assert.ok(restoredPreload.startsWith('orig'));
    assert.doesNotMatch(restoredPreload, /ANTIGRAVITY|RULES_PLACEHOLDER|Breakout probe/);

    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><body><div id="probe">Breakout probe</div></body>', { runScripts: 'outside-only' });
    const prefix = js.slice(0, js.indexOf('    const observer ='));
    const ctx = { Node: dom.window.Node, document: dom.window.document, console };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode }; })();', ctx);
    ctx.hooks.translateNode(dom.window.document.body);
    assert.equal(
        dom.window.document.getElementById('probe').textContent,
        'RULES_PLACEHOLDER DICT_PLACEHOLDER </script> /* --- ANTIGRAVITY CHINESE LOCALIZATION END --- */'
    );
});

test('stale older translation packs are ignored on engine upgrade and cleaned on macOS watcher sync', t => {
    const root = fixture(t);
    const repo = path.resolve(__dirname, '..');
    const sourceEngine = require('../localization_engine');

    const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
    pkg.version = '3.7.3';
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg, null, 2));
    for (const name of ['localization_engine.js', 'auto_localize_watcher.js']) {
        fs.copyFileSync(path.join(repo, name), path.join(root, name));
    }
    fs.mkdirSync(path.join(root, 'src'));
    for (const name of ['asar_patcher.js', 'main_patches.js', 'preload_runtime.js', 'rules_schema.js']) {
        fs.copyFileSync(path.join(repo, 'src', name), path.join(root, 'src', name));
    }
    fs.cpSync(path.join(repo, 'dicts'), path.join(root, 'dicts'), { recursive: true });
    fs.cpSync(path.join(repo, 'dicts_tw'), path.join(root, 'dicts_tw'), { recursive: true });
    fs.cpSync(path.join(repo, 'rules'), path.join(root, 'rules'), { recursive: true });

    const stalePack = path.join(root, '.translation-packs', '3.7.2');
    fs.mkdirSync(stalePack, { recursive: true });
    fs.cpSync(path.join(repo, 'dicts'), path.join(stalePack, 'dicts'), { recursive: true });
    fs.cpSync(path.join(repo, 'dicts_tw'), path.join(stalePack, 'dicts_tw'), { recursive: true });
    const staleSettings = JSON.parse(fs.readFileSync(path.join(stalePack, 'dicts_tw', 'page_settings.json'), 'utf8'));
    staleSettings.General = '舊版翻譯包洩漏';
    fs.writeFileSync(path.join(stalePack, 'dicts_tw', 'page_settings.json'), JSON.stringify(staleSettings));

    const stateDir = path.join(root, '.watcher-state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'active_translation.json'), JSON.stringify({ version: '3.7.2' }));

    assert.equal(readActiveTranslation(root), null, 'readActiveTranslation must ignore older 3.7.2 pack on 3.7.3 engine');

    const cmd = `
        process.argv.push('--tw');
        const engine = require(${JSON.stringify(path.join(root, 'localization_engine.js'))});
        const js = engine.generateJs();
        console.log(JSON.stringify({
            hasStale: js.includes('舊版翻譯包洩漏'),
            hasUpgradeVersion: js.includes('"translationVersion":"3.7.3"')
        }));
    `;
    const run = spawnSync(process.execPath, ['-e', cmd], { encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout.trim()), { hasStale: false, hasUpgradeVersion: true });

    // prepareMacWatcherSync cleans stale active_translation.json (<= sourceVersion)
    const rtDir = path.join(root, 'mac-runtime');
    fs.mkdirSync(path.join(rtDir, '.watcher-state'), { recursive: true });
    fs.writeFileSync(path.join(rtDir, '.watcher-state', 'active_translation.json'), JSON.stringify({ version: '3.7.3' }));
    const session = sourceEngine.prepareMacWatcherSync({
        sourceDir: root,
        runtimes: [{ kind: 'user', runtimeDir: rtDir }]
    });
    for (const release of session.locks) release();
    assert.equal(fs.existsSync(path.join(rtDir, '.watcher-state', 'active_translation.json')), false);
});

test('removing protected modelEffortLabel via runtime_rules.json unprotects it and active rules invalidate recipeHash', t => {
    const root = fixture(t);
    const repo = path.resolve(__dirname, '..');

    for (const name of ['localization_engine.js', 'auto_localize_watcher.js', 'package.json']) {
        fs.copyFileSync(path.join(repo, name), path.join(root, name));
    }
    fs.mkdirSync(path.join(root, 'src'));
    for (const name of ['asar_patcher.js', 'main_patches.js', 'preload_runtime.js', 'rules_schema.js']) {
        fs.copyFileSync(path.join(repo, 'src', name), path.join(root, 'src', name));
    }
    fs.mkdirSync(path.join(root, 'scripts'));
    for (const name of ['auto_updater.js', 'compare_dicts.js']) {
        fs.copyFileSync(path.join(repo, 'scripts', name), path.join(root, 'scripts', name));
    }
    fs.cpSync(path.join(repo, 'dicts'), path.join(root, 'dicts'), { recursive: true });
    fs.cpSync(path.join(repo, 'dicts_tw'), path.join(root, 'dicts_tw'), { recursive: true });
    fs.cpSync(path.join(repo, 'rules'), path.join(root, 'rules'), { recursive: true });

    const packVersion = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version;
    const pack = path.join(root, '.translation-packs', packVersion);
    fs.mkdirSync(pack, { recursive: true });
    fs.cpSync(path.join(repo, 'dicts'), path.join(pack, 'dicts'), { recursive: true });
    fs.cpSync(path.join(repo, 'dicts_tw'), path.join(pack, 'dicts_tw'), { recursive: true });
    fs.cpSync(path.join(repo, 'rules'), path.join(pack, 'rules'), { recursive: true });

    const packMainTwPath = path.join(pack, 'dicts_tw', 'page_main.json');
    const packMainTw = JSON.parse(fs.readFileSync(packMainTwPath, 'utf8'));
    packMainTw.Medium = '適中';
    fs.writeFileSync(packMainTwPath, JSON.stringify(packMainTw, null, 2));
    const packMainScPath = path.join(pack, 'dicts', 'page_main.json');
    const packMainSc = JSON.parse(fs.readFileSync(packMainScPath, 'utf8'));
    packMainSc.Medium = '适中';
    fs.writeFileSync(packMainScPath, JSON.stringify(packMainSc, null, 2));

    const rulesPath = path.join(pack, 'rules', 'runtime_rules.json');
    const rulesObj = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    rulesObj.protected.modelEffortLabels = rulesObj.protected.modelEffortLabels.filter(x => x !== 'Medium');
    fs.writeFileSync(rulesPath, JSON.stringify(rulesObj, null, 2));

    const state = path.join(root, '.watcher-state');
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(path.join(state, 'active_translation.json'), JSON.stringify({ version: packVersion }));

    const script = `
        process.argv.push('--tw');
        const vm = require('node:vm');
        const { JSDOM } = require(${JSON.stringify(require.resolve('jsdom'))});
        const engine = require(${JSON.stringify(path.join(root, 'localization_engine.js'))});
        const watcher = require(${JSON.stringify(path.join(root, 'auto_localize_watcher.js'))});
        const hash1 = watcher.recipeHash();
        const js = engine.generateJs();
        const dom = new JSDOM('<!doctype html><body><div role="menu" aria-label="Select model"><span id="med">Medium</span><span id="eff">Thinking effort</span></div></body>', { runScripts: 'outside-only' });
        const prefix = js.slice(0, js.indexOf('    const observer ='));
        const ctx = { Node: dom.window.Node, document: dom.window.document, console };
        vm.runInNewContext(prefix + '\\n globalThis.hooks = { translateNode }; })();', ctx);
        ctx.hooks.translateNode(dom.window.document.body);
        console.log(JSON.stringify({
            hash1,
            med: dom.window.document.getElementById('med').textContent,
            eff: dom.window.document.getElementById('eff').textContent
        }));
    `;
    const run1 = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 10000 });
    assert.equal(run1.status, 0, run1.stderr);
    const out1 = JSON.parse(run1.stdout.trim());
    assert.notEqual(out1.med, 'Medium', 'Removing Medium from protected.modelEffortLabels must allow translation');
    assert.equal(out1.eff, 'Thinking effort');

    // Modify active runtime_rules.json and verify watcher.recipeHash() invalidates
    rulesObj.scopedMaps.swarm.Pulse = { sc: '脉搏', tw: '脈搏' };
    fs.writeFileSync(rulesPath, JSON.stringify(rulesObj, null, 2));
    const run2 = spawnSync(process.execPath, ['-e', `console.log(require(${JSON.stringify(path.join(root, 'auto_localize_watcher.js'))}).recipeHash())`], { encoding: 'utf8', timeout: 10000 });
    assert.equal(run2.status, 0, run2.stderr);
    assert.notEqual(run2.stdout.trim(), out1.hash1);
});
