const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ALLOWED_DOWNLOAD_HOSTS = new Set([
    'github.com',
    'objects.githubusercontent.com',
    'release-assets.githubusercontent.com',
    'codeload.github.com'
]);

const MANAGED_FILES = [
    'package.json',
    'package-lock.json',
    'localization_engine.js',
    'auto_localize_watcher.js',
    'README.md',
    'README_TW.md',
    'AI_INSTALL_GUIDE.md',
    'CHANGELOG.md'
];

const MANAGED_DIRS = ['dicts', 'dicts_tw', 'src', 'scripts', 'docs'];

function compareVersions(v1, v2) {
    const clean = v => (v || '').replace(/^[^\d]*/, '').split('.').map(n => parseInt(n, 10) || 0);
    const p1 = clean(v1);
    const p2 = clean(v2);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const num1 = p1[i] || 0;
        const num2 = p2[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }
    return 0;
}

function isAllowedAssetUrl(rawUrl, {
    allowedHosts = ALLOWED_DOWNLOAD_HOSTS,
    allowedProtocols = ['https:']
} = {}) {
    try {
        const parsed = new URL(rawUrl);
        if (!allowedProtocols.includes(parsed.protocol)) return false;
        if (!allowedHosts.has(parsed.hostname.toLowerCase())) return false;
        return true;
    } catch {
        return false;
    }
}

function selectReleaseAsset(assets = []) {
    if (!Array.isArray(assets)) return null;
    const preferred = assets.find(a => a && /^antigravity2-TW-.*\.zip$/i.test(a.name || '') && a.browser_download_url);
    if (preferred) {
        return {
            name: preferred.name,
            url: preferred.browser_download_url,
            size: preferred.size || 0,
            digest: preferred.digest || ''
        };
    }
    const fallback = assets.find(a => a && /\.zip$/i.test(a.name || '') && a.browser_download_url);
    if (!fallback) return null;
    return {
        name: fallback.name,
        url: fallback.browser_download_url,
        size: fallback.size || 0,
        digest: fallback.digest || ''
    };
}

function fetchLatestRelease(repo = 'atonnyshen/antigravity2-TW', timeoutMs = 6000, apiUrl = null) {
    return new Promise((resolve, reject) => {
        const url = apiUrl || `https://api.github.com/repos/${repo}/releases/latest`;
        let parsed;
        try {
            parsed = new URL(url);
        } catch (err) {
            return reject(err);
        }
        const transport = parsed.protocol === 'http:' ? http : https;
        const options = {
            headers: {
                'User-Agent': 'Antigravity2TW-AutoUpdater/3.7',
                'Accept': 'application/vnd.github.v3+json'
            },
            timeout: timeoutMs
        };

        const req = transport.get(url, options, res => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                const redirectUrl = res.headers.location;
                if (!redirectUrl) return reject(new Error('Redirect location missing'));
                return transport.get(redirectUrl, options, redirectRes => {
                    handleResponse(redirectRes, resolve, reject);
                }).on('error', reject);
            }
            handleResponse(res, resolve, reject);
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Check update timed out'));
        });
    });
}

function handleResponse(res, resolve, reject) {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', chunk => { body += chunk; });
    res.on('end', () => {
        if (res.statusCode !== 200) {
            return reject(new Error(`GitHub API returned status ${res.statusCode}`));
        }
        try {
            const data = JSON.parse(body);
            const assets = Array.isArray(data.assets) ? data.assets : [];
            const selectedAsset = selectReleaseAsset(assets);
            resolve({
                tag: data.tag_name || '',
                name: data.name || '',
                body: data.body || '',
                publishedAt: data.published_at || '',
                htmlUrl: data.html_url || '',
                assets,
                asset: selectedAsset
            });
        } catch (e) {
            reject(e);
        }
    });
}

function downloadVerifiedAsset(assetUrl, destPath, {
    expectedDigest = '',
    maxRedirects = 5,
    timeoutMs = 30000,
    allowedHosts = ALLOWED_DOWNLOAD_HOSTS,
    allowedProtocols = ['https:']
} = {}) {
    return new Promise((resolve, reject) => {
        const partPath = `${destPath}.part`;
        const cleanupPart = () => {
            try { if (fs.existsSync(partPath)) fs.unlinkSync(partPath); } catch {}
        };

        const requestUrl = (currentUrl, redirectsLeft) => {
            if (!isAllowedAssetUrl(currentUrl, { allowedHosts, allowedProtocols })) {
                cleanupPart();
                return reject(new Error(`Blocked untrusted download URL: ${currentUrl}`));
            }
            const parsed = new URL(currentUrl);
            const transport = parsed.protocol === 'http:' ? http : https;
            const req = transport.get(currentUrl, {
                headers: { 'User-Agent': 'Antigravity2TW-AutoUpdater/3.7' },
                timeout: timeoutMs
            }, res => {
                if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                    const nextUrl = res.headers.location;
                    res.resume();
                    if (!nextUrl) {
                        cleanupPart();
                        return reject(new Error('Redirect location missing during asset download'));
                    }
                    if (redirectsLeft <= 0) {
                        cleanupPart();
                        return reject(new Error('Too many redirects during asset download'));
                    }
                    let resolvedNext;
                    try {
                        resolvedNext = new URL(nextUrl, currentUrl).toString();
                    } catch (err) {
                        cleanupPart();
                        return reject(err);
                    }
                    return requestUrl(resolvedNext, redirectsLeft - 1);
                }

                if (res.statusCode !== 200) {
                    res.resume();
                    cleanupPart();
                    return reject(new Error(`Asset download returned HTTP ${res.statusCode}`));
                }

                fs.mkdirSync(path.dirname(destPath), { recursive: true });
                const out = fs.createWriteStream(partPath);
                const hash = crypto.createHash('sha256');
                let totalBytes = 0;

                res.on('data', chunk => {
                    totalBytes += chunk.length;
                    hash.update(chunk);
                });
                res.pipe(out);

                out.on('finish', () => {
                    out.close(() => {
                        if (totalBytes === 0) {
                            cleanupPart();
                            return reject(new Error('Downloaded asset is empty'));
                        }
                        const actualSha256 = hash.digest('hex').toLowerCase();
                        if (expectedDigest) {
                            const normalizedExpected = String(expectedDigest).replace(/^sha256:/i, '').trim().toLowerCase();
                            if (!/^[a-f0-9]{64}$/.test(normalizedExpected) || actualSha256 !== normalizedExpected) {
                                cleanupPart();
                                return reject(new Error(`SHA-256 checksum mismatch: expected ${normalizedExpected}, got ${actualSha256}`));
                            }
                        }
                        fs.renameSync(partPath, destPath);
                        resolve({ path: destPath, sha256: actualSha256, bytes: totalBytes });
                    });
                });

                const onStreamErr = err => {
                    out.destroy();
                    cleanupPart();
                    reject(err);
                };
                res.on('error', onStreamErr);
                out.on('error', onStreamErr);
            });

            req.on('error', err => {
                cleanupPart();
                reject(err);
            });
            req.on('timeout', () => {
                req.destroy();
                cleanupPart();
                reject(new Error('Asset download timed out'));
            });
        };

        requestUrl(assetUrl, maxRedirects);
    });
}

function extractZipArchive(zipPath, extractDir) {
    fs.mkdirSync(extractDir, { recursive: true });
    if (process.platform === 'win32') {
        execFileSync('tar.exe', ['-xf', zipPath, '-C', extractDir], { stdio: 'pipe', timeout: 60000 });
    } else if (process.platform === 'darwin') {
        try {
            execFileSync('/usr/bin/ditto', ['-xk', zipPath, extractDir], { stdio: 'pipe', timeout: 60000 });
        } catch {
            execFileSync('unzip', ['-oq', zipPath, '-d', extractDir], { stdio: 'pipe', timeout: 60000 });
        }
    } else {
        execFileSync('unzip', ['-oq', zipPath, '-d', extractDir], { stdio: 'pipe', timeout: 60000 });
    }
    const entries = fs.readdirSync(extractDir, { withFileTypes: true }).filter(e => !e.name.startsWith('__MACOSX') && e.name !== '.DS_Store');
    if (entries.length === 1 && entries[0].isDirectory() && !fs.existsSync(path.join(extractDir, 'package.json'))) {
        return path.join(extractDir, entries[0].name);
    }
    return extractDir;
}

function validateExtractedPackage(pkgDir, currentVersion) {
    const pkgPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(pkgPath)) throw new Error('Missing package.json in extracted update');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.name !== 'antigravity2-tw') {
        throw new Error(`Unexpected package name in update: ${pkg.name}`);
    }
    if (!pkg.version || compareVersions(pkg.version, currentVersion) <= 0) {
        throw new Error(`Extracted package version (${pkg.version}) is not newer than current (${currentVersion})`);
    }

    const requiredJs = [
        'localization_engine.js',
        'auto_localize_watcher.js',
        path.join('src', 'preload_runtime.js'),
        path.join('src', 'main_patches.js'),
        path.join('src', 'asar_patcher.js')
    ];
    for (const rel of requiredJs) {
        const full = path.join(pkgDir, rel);
        if (!fs.existsSync(full)) {
            throw new Error(`Missing required file in update: ${rel}`);
        }
        execFileSync(process.execPath, ['--check', full], { stdio: 'pipe', timeout: 10000 });
    }

    for (const dictFolder of ['dicts', 'dicts_tw']) {
        const dirPath = path.join(pkgDir, dictFolder);
        if (!fs.existsSync(dirPath)) {
            throw new Error(`Missing dictionary directory in update: ${dictFolder}`);
        }
        const jsonFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
        if (jsonFiles.length === 0) {
            throw new Error(`Empty dictionary directory in update: ${dictFolder}`);
        }
        for (const jf of jsonFiles) {
            const parsed = JSON.parse(fs.readFileSync(path.join(dirPath, jf), 'utf8'));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error(`Invalid dictionary JSON object: ${dictFolder}/${jf}`);
            }
        }
    }
    return pkg;
}

function copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(s, d);
        } else if (entry.isFile()) {
            fs.copyFileSync(s, d);
        }
    }
}

function applySelfUpdateAtomic(sourcePkgDir, targetDir) {
    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag2tw-selfupdate-bak-'));
    const replacedFiles = [];
    const replacedDirs = [];

    try {
        for (const file of MANAGED_FILES) {
            const dst = path.join(targetDir, file);
            if (fs.existsSync(dst)) {
                fs.copyFileSync(dst, path.join(backupDir, file));
            }
        }
        for (const dir of MANAGED_DIRS) {
            const dst = path.join(targetDir, dir);
            if (fs.existsSync(dst)) {
                copyDirRecursive(dst, path.join(backupDir, dir));
            }
        }

        for (const file of MANAGED_FILES) {
            const src = path.join(sourcePkgDir, file);
            if (!fs.existsSync(src)) continue;
            const dst = path.join(targetDir, file);
            const tmpDst = path.join(targetDir, `.${file}.tmp-${process.pid}`);
            fs.copyFileSync(src, tmpDst);
            fs.renameSync(tmpDst, dst);
            replacedFiles.push(file);
        }

        for (const dir of MANAGED_DIRS) {
            const src = path.join(sourcePkgDir, dir);
            if (!fs.existsSync(src)) continue;
            const dst = path.join(targetDir, dir);
            const stageDir = path.join(targetDir, `.${dir}.tmp-${process.pid}`);
            fs.rmSync(stageDir, { recursive: true, force: true });
            copyDirRecursive(src, stageDir);
            fs.rmSync(dst, { recursive: true, force: true });
            fs.renameSync(stageDir, dst);
            replacedDirs.push(dir);
        }

        // Verify installed files in targetDir
        const newPkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
        if (!newPkg || !newPkg.version) throw new Error('Post-update package.json invalid');
        for (const rel of ['localization_engine.js', 'auto_localize_watcher.js', path.join('src', 'preload_runtime.js')]) {
            if (!fs.existsSync(path.join(targetDir, rel))) {
                throw new Error(`Post-update file missing: ${rel}`);
            }
        }
        return { version: newPkg.version, replacedFiles, replacedDirs };
    } catch (err) {
        // Rollback managed files and directories without touching node_modules or .watcher-state
        for (const file of MANAGED_FILES) {
            const bak = path.join(backupDir, file);
            const dst = path.join(targetDir, file);
            try {
                if (fs.existsSync(bak)) fs.copyFileSync(bak, dst);
            } catch {}
        }
        for (const dir of MANAGED_DIRS) {
            const bak = path.join(backupDir, dir);
            const dst = path.join(targetDir, dir);
            const tmpStage = path.join(targetDir, `.${dir}.tmp-${process.pid}`);
            try { fs.rmSync(tmpStage, { recursive: true, force: true }); } catch {}
            try {
                if (fs.existsSync(bak)) {
                    fs.rmSync(dst, { recursive: true, force: true });
                    copyDirRecursive(bak, dst);
                }
            } catch {}
        }
        throw err;
    } finally {
        try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch {}
    }
}

function notifyMac(title, message) {
    if (process.platform !== 'darwin') return;
    try {
        const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`;
        execFileSync('/usr/bin/osascript', ['-e', script], { stdio: 'ignore' });
    } catch {}
}

async function selfUpdateWatcher({
    targetDir,
    currentVersion,
    release,
    cacheFilePath = '',
    allowedHosts = ALLOWED_DOWNLOAD_HOSTS,
    allowedProtocols = ['https:'],
    extractFn = extractZipArchive,
    silentNotification = false
} = {}) {
    if (!release || !release.asset || !release.asset.url) {
        return { updated: false, reason: 'no_zip_asset' };
    }
    const remoteVersion = String(release.tag || '').replace(/^v/, '');
    if (!remoteVersion || compareVersions(remoteVersion, currentVersion) <= 0) {
        return { updated: false, reason: 'up_to_date' };
    }

    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ag2tw-update-'));
    try {
        const zipPath = path.join(workRoot, path.basename(release.asset.name || 'update.zip'));
        await downloadVerifiedAsset(release.asset.url, zipPath, {
            expectedDigest: release.asset.digest || '',
            allowedHosts,
            allowedProtocols
        });

        const extractDir = path.join(workRoot, 'extracted');
        const pkgDir = extractFn(zipPath, extractDir);
        const pkg = validateExtractedPackage(pkgDir, currentVersion);
        const result = applySelfUpdateAtomic(pkgDir, targetDir);

        if (cacheFilePath) {
            try {
                let existing = {};
                if (fs.existsSync(cacheFilePath)) {
                    existing = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
                }
                fs.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
                fs.writeFileSync(cacheFilePath, JSON.stringify({
                    ...existing,
                    currentVersion: result.version,
                    selfUpdatedFrom: currentVersion,
                    selfUpdatedTo: result.version,
                    selfUpdatedAt: new Date().toISOString()
                }, null, 2) + '\n');
            } catch {}
        }

        if (!silentNotification) {
            notifyMac('Antigravity 繁體中文化更新', `已自動更新至 v${result.version} 並重新套用繁中化。`);
        }

        return {
            updated: true,
            previousVersion: currentVersion,
            newVersion: pkg.version,
            assetName: release.asset.name
        };
    } finally {
        try { fs.rmSync(workRoot, { recursive: true, force: true }); } catch {}
    }
}

async function checkUpdate({
    repo = 'atonnyshen/antigravity2-TW',
    currentVersion = '',
    cacheFilePath = '',
    intervalMs = 24 * 60 * 60 * 1000,
    force = false,
    silentNotification = false,
    apiUrl = null
} = {}) {
    if (!force && cacheFilePath && fs.existsSync(cacheFilePath)) {
        try {
            const cache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
            if (cache.lastChecked && (Date.now() - cache.lastChecked < intervalMs)) {
                return { skipped: true, reason: 'within_interval', cache };
            }
        } catch {}
    }

    try {
        const release = await fetchLatestRelease(repo, 6000, apiUrl);
        const remoteVersion = release.tag.replace(/^v/, '');
        const hasUpdate = compareVersions(remoteVersion, currentVersion) > 0;

        const result = {
            hasUpdate,
            currentVersion,
            remoteVersion,
            tag: release.tag,
            htmlUrl: release.htmlUrl,
            asset: release.asset || null,
            lastChecked: Date.now()
        };

        if (cacheFilePath) {
            try {
                fs.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
                fs.writeFileSync(cacheFilePath, JSON.stringify(result, null, 2) + '\n');
            } catch {}
        }

        if (hasUpdate && !silentNotification) {
            notifyMac('Antigravity 繁體中文化更新', `發現新版本 ${release.tag}，包含最新字典與修復。`);
        }

        return { ...result, release };
    } catch (e) {
        return { hasUpdate: false, error: e.message, lastChecked: Date.now() };
    }
}

module.exports = {
    ALLOWED_DOWNLOAD_HOSTS,
    MANAGED_FILES,
    MANAGED_DIRS,
    compareVersions,
    isAllowedAssetUrl,
    selectReleaseAsset,
    fetchLatestRelease,
    downloadVerifiedAsset,
    extractZipArchive,
    validateExtractedPackage,
    applySelfUpdateAtomic,
    selfUpdateWatcher,
    checkUpdate,
    notifyMac
};
