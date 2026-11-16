const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { compareVersions, checkUpdate } = require('../scripts/auto_updater.js');

test('compareVersions accurately compares semantic version strings', () => {
    assert.equal(compareVersions('3.3.5', '3.3.4'), 1);
    assert.equal(compareVersions('v3.3.5', '3.3.5'), 0);
    assert.equal(compareVersions('3.3.4', '3.3.5'), -1);
    assert.equal(compareVersions('3.4.0', '3.3.9'), 1);
    assert.equal(compareVersions('4.0.0', '3.99.99'), 1);
    assert.equal(compareVersions('3.3.5.1', '3.3.5'), 1);
    assert.equal(compareVersions('3.3', '3.3.0'), 0);
});

test('checkUpdate throttles within interval window', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-test-'));
    const cacheFile = path.join(tmpDir, 'cache.json');

    // Seed recent cache
    fs.writeFileSync(cacheFile, JSON.stringify({
        lastChecked: Date.now() - 10000,
        remoteVersion: '3.3.5'
    }));

    const res = await checkUpdate({
        currentVersion: '3.3.4',
        cacheFilePath: cacheFile,
        intervalMs: 60000 // 1 min window
    });

    assert.equal(res.skipped, true);
    assert.equal(res.reason, 'within_interval');

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
});
