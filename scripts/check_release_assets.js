#!/usr/bin/env node
'use strict';

// Pre-publication guard for users of the v3.7.1 watcher.
// The legacy updater selects ANY *.zip Release Asset and may execute a
// valid full package; GitHub's generated Source code (zip) is not an Asset.
const fs = require('node:fs');

function checkReleaseAssets(release, expectedTag) {
    const errors = [];
    if (!/^v\d+\.\d+\.\d+$/.test(expectedTag || '')) {
        errors.push('Expected tag must be vX.Y.Z');
    }
    if (!release || release.tag_name !== expectedTag) {
        errors.push('Release tag does not match the expected tag');
    }
    if (!release || release.draft !== true) {
        errors.push('Release must remain a draft until this preflight passes');
    }

    const assets = release && Array.isArray(release.assets) ? release.assets : [];
    const expectedName = `antigravity2-TW-translations-${expectedTag}.zip`;
    // There may be other non-ZIP assets in the future, but a single
    // translation-only asset is the simplest policy for this migration.
    if (assets.length !== 1 || !assets[0] || assets[0].name !== expectedName) {
        errors.push(`Exactly one Release Asset is allowed: ${expectedName}`);
    }
    const translationAsset = assets.find(a => a && a.name === expectedName);
    if (translationAsset) {
        if (!/^sha256:[a-f\d]{64}$/i.test(translationAsset.digest || '')) {
            errors.push('Translation ZIP must have a GitHub-provided SHA-256 digest');
        }
        if (!(Number(translationAsset.size) > 0) || translationAsset.state !== 'uploaded') {
            errors.push('Translation ZIP must be fully uploaded and nonempty');
        }
    }
    return { ok: errors.length === 0, errors };
}

if (require.main === module) {
    const tag = process.argv[2];
    try {
        const input = fs.readFileSync(0, 'utf8');
        const release = JSON.parse(input);
        const result = checkReleaseAssets(release, tag);
        if (result.ok) {
            console.log(`PASS: draft ${tag} has exactly one verified pure-translation asset.`);
        } else {
            for (const issue of result.errors) console.error('BLOCK RELEASE: ' + issue);
            process.exitCode = 1;
        }
    } catch (error) {
        console.error('BLOCK RELEASE: Cannot inspect draft metadata: ' + error.message);
        process.exitCode = 1;
    }
}

module.exports = { checkReleaseAssets };
