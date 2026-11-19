'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { checkReleaseAssets, verifyReleaseArtifact } = require('../scripts/check_release_assets');
const { buildTranslationPack, makeStoredZip } = require('../scripts/build_translation_pack');

const TAG = 'v3.7.2';
const goodAsset = () => ({
    name: `antigravity2-TW-translations-${TAG}.zip`,
    size: 12480,
    state: 'uploaded',
    digest: 'sha256:' + 'a'.repeat(64)
});
const draft = (assets = [goodAsset()]) => ({ tag_name: TAG, draft: true, assets });

test('pre-publication guard permits exactly one verified pure translation asset', () => {
    assert.deepEqual(checkReleaseAssets(draft(), TAG), { ok: true, errors: [] });
});

test('guard rejects all alternative ZIP filenames including legacy fallback and fake manual setup', () => {
    for (const name of [
        'antigravity2-TW-v3.7.2.zip',
        'antigravity2-TW-manual-setup-v3.7.2.zip',
        'unrelated-manual-setup-v3.7.2.zip'
    ]) {
        const result = checkReleaseAssets(draft([{ ...goodAsset(), name }]), TAG);
        assert.equal(result.ok, false, name);
        assert.match(result.errors.join(' '), /Exactly one/);
    }
    const mixed = checkReleaseAssets(draft([
        goodAsset(), { ...goodAsset(), name: 'antigravity2-TW-manual-setup-v3.7.2.zip' }
    ]), TAG);
    assert.equal(mixed.ok, false);
});

test('legacy v3.7.1 patterns select even renamed manual ZIP assets', () => {
    // Equivalent to selectReleaseAsset at the published v3.7.1 tag.
    function oldSelect(assets) {
        return assets.find(a => /^antigravity2-TW-.*\.zip$/i.test(a.name)) ||
            assets.find(a => /\.zip$/i.test(a.name)) || null;
    }
    assert.equal(oldSelect([{ name: 'antigravity2-TW-manual-setup-v3.7.2.zip' }]).name,
        'antigravity2-TW-manual-setup-v3.7.2.zip');
    assert.equal(oldSelect([{ name: 'renamed-other-v3.7.2.zip' }]).name,
        'renamed-other-v3.7.2.zip');
    // A Source code (zip) is generated separately by GitHub and is not an asset.
    assert.equal(oldSelect([]), null);
});

test('guard blocks drafts without digest, incomplete uploads, empty ZIP, or mismatched tags', () => {
    const cases = [
        [draft([{ ...goodAsset(), digest: '' }]), TAG],
        [draft([{ ...goodAsset(), state: 'starter' }]), TAG],
        [draft([{ ...goodAsset(), size: 0 }]), TAG],
        [draft(), 'v3.7.3'],
        [{ ...draft(), draft: false }, TAG],
        [draft([]), TAG]
    ];
    for (const [release, tag] of cases) {
        assert.equal(checkReleaseAssets(release, tag).ok, false);
    }
});

function artifactFixture(t, bytes = null) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag2tw-release-preflight-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const archive = path.join(dir, `antigravity2-TW-translations-${TAG}.zip`);
    if (bytes) fs.writeFileSync(archive, bytes);
    else buildTranslationPack({
        version: TAG.slice(1), minEngineVersion: '3.7.1', maxEngineVersion: '3.7.1', output: archive
    });
    const data = fs.readFileSync(archive);
    const release = draft([{
        name: path.basename(archive), size: data.length, state: 'uploaded',
        digest: 'sha256:' + crypto.createHash('sha256').update(data).digest('hex')
    }]);
    return { archive, release };
}

test('preflight checks actual translation ZIP bytes, dictionaries, and GitHub digest', t => {
    const { archive, release } = artifactFixture(t);
    assert.deepEqual(verifyReleaseArtifact(release, TAG, archive, '3.7.1'),
        { ok: true, errors: [] });
    release.assets[0].digest = 'sha256:' + '0'.repeat(64);
    const mismatch = verifyReleaseArtifact(release, TAG, archive, '3.7.1');
    assert.equal(mismatch.ok, false);
    assert.match(mismatch.errors.join(' '), /SHA-256 differs/);
});

test('correctly named and hashed executable ZIP fails content validation', t => {
    const zip = makeStoredZip([['payload.js', Buffer.from('malicious executable content')]]);
    const { archive, release } = artifactFixture(t, zip);
    const result = verifyReleaseArtifact(release, TAG, archive, '3.7.1');
    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /content verification failed/);
});

test('preflight rejects correct ZIP with incompatible engine and CLI without file', t => {
    const { archive, release } = artifactFixture(t);
    const incompatible = verifyReleaseArtifact(release, TAG, archive, '3.8.0');
    assert.equal(incompatible.ok, false);
    assert.match(incompatible.errors.join(' '), /incompatible/);
    const missingFile = spawnSync(process.execPath,
        [path.join(__dirname, '..', 'scripts', 'check_release_assets.js'), TAG],
        { input: JSON.stringify(release), encoding: 'utf8' });
    assert.equal(missingFile.status, 1);
    const allowed = spawnSync(process.execPath,
        [path.join(__dirname, '..', 'scripts', 'check_release_assets.js'), TAG, '--file', archive,
            '--engine-version', '3.7.1'],
        { input: JSON.stringify(release), encoding: 'utf8' });
    assert.equal(allowed.status, 0, allowed.stderr);
});
