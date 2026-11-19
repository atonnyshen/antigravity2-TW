#!/usr/bin/env node
'use strict';

// Pre-publication guard for users of the v3.7.1 watcher.
// The legacy updater selects ANY *.zip Release Asset and may execute a
// valid full package; GitHub's generated Source code (zip) is not an Asset.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

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

// Metadata alone cannot prove that a correctly named ZIP contains only
// translation data. Compare the actual artifact against GitHub's digest,
// then inspect the extracted content with the installer's own validator.
function verifyReleaseArtifact(release, expectedTag, archivePath, engineVersion) {
    const result = checkReleaseAssets(release, expectedTag);
    const errors = [...result.errors];
    const expectedName = `antigravity2-TW-translations-${expectedTag}.zip`;
    if (!archivePath || path.basename(archivePath) !== expectedName) {
        errors.push(`Local artifact path must end with ${expectedName}`);
        return { ok: false, errors };
    }
    if (!/^\d+\.\d+\.\d+$/.test(engineVersion || '')) {
        errors.push('Explicit compatible engine version is required (X.Y.Z)');
        return { ok: false, errors };
    }
    if (!result.ok) return { ok: false, errors };
    let tempRoot;
    try {
        const stat = fs.statSync(archivePath);
        if (!stat.isFile() || stat.size === 0 || stat.size > 128 * 1024 * 1024) {
            throw new Error('Local ZIP must be a nonempty regular file no larger than 128 MB');
        }
        const actual = fs.readFileSync(archivePath);
        const asset = release.assets[0];
        if (actual.length !== Number(asset.size)) errors.push('Asset byte length differs from GitHub');
        const actualDigest = crypto.createHash('sha256').update(actual).digest('hex');
        if (asset.digest.toLowerCase() !== `sha256:${actualDigest}`) {
            errors.push('Local translation ZIP SHA-256 differs from GitHub Release digest');
        }
        if (errors.length) return { ok: false, errors };
        const updater = require('./auto_updater');
        updater.verifyZipEntries(archivePath);
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ag2tw-release-check-'));
        const extracted = updater.extractZipArchive(archivePath, path.join(tempRoot, 'extract'));
        updater.validateTranslationPack(extracted, expectedTag.slice(1), engineVersion);
    } catch (err) {
        errors.push('Translation ZIP content verification failed: ' + err.message);
    } finally {
        if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    return { ok: errors.length === 0, errors };
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const tag = args[0];
    const fileAt = args.indexOf('--file');
    const versionAt = args.indexOf('--engine-version');
    const archivePath = fileAt < 0 ? null : args[fileAt + 1];
    const engineVersion = versionAt < 0 ? require('../package.json').version : args[versionAt + 1];
    try {
        const input = fs.readFileSync(0, 'utf8');
        const release = JSON.parse(input);
        const result = verifyReleaseArtifact(release, tag, archivePath, engineVersion);
        if (result.ok) {
            console.log(`PASS: draft ${tag} has one verified translation ZIP matching GitHub SHA-256 and compatible engine ${engineVersion}.`);
        } else {
            for (const issue of result.errors) console.error('BLOCK RELEASE: ' + issue);
            process.exitCode = 1;
        }
    } catch (error) {
        console.error('BLOCK RELEASE: Cannot inspect draft metadata: ' + error.message);
        process.exitCode = 1;
    }
}

module.exports = { checkReleaseAssets, verifyReleaseArtifact };
