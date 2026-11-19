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
    assert.deepEqual(fs.readdirSync(extracted).sort(),
        ['dicts', 'dicts_tw', 'translation-pack.json'].sort());
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
    for (const name of ['asar_patcher.js', 'main_patches.js', 'preload_runtime.js']) {
        fs.copyFileSync(path.join(repo, 'src', name), path.join(root, 'src', name));
    }
    const packVersion = '3.7.2';
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
    const command = `process.argv.push('--tw');const x=require(${JSON.stringify(path.join(root, 'localization_engine.js'))});const s=x.generateJs();console.log(s.includes('純翻譯通道測試'),s.includes('\\"translationVersion\\":\\"3.7.2\\"'));`;
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
        execReapplyFn: () => { reapplications++; }
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
