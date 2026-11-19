'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkReleaseAssets } = require('../scripts/check_release_assets');

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
