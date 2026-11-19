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

function selectTranslationAsset(assets = [], releaseTag = '') {
    if (!Array.isArray(assets) || !/^v\d+\.\d+\.\d+$/.test(releaseTag)) return null;
    const name = `antigravity2-TW-translations-${releaseTag}.zip`;
    const asset = assets.find(a => a && a.name === name && a.browser_download_url);
    if (!asset) return null;
    return {
        name, url: asset.browser_download_url,
        size: Number(asset.size) || 0,
        digest: asset.digest || ''
    };
}

function readActiveTranslation(baseDir) {
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(baseDir, '.watcher-state', 'active_translation.json'), 'utf8'));
        if (!raw || !/^\d+\.\d+\.\d+$/.test(raw.version)) return null;
        const folder = path.join(baseDir, '.translation-packs', raw.version);
        if (!fs.lstatSync(path.join(baseDir, '.translation-packs')).isDirectory() ||
            !fs.lstatSync(folder).isDirectory()) return null;
        return { version: raw.version, folder };
    } catch { return null; }
}

function validateTranslationPack(folder, releaseVersion, engineVersion) {
    const allowedTop = new Set(['translation-pack.json', 'dicts', 'dicts_tw']);
    const top = fs.readdirSync(folder, { withFileTypes: true });
    if (top.length !== allowedTop.size || top.some(e => !allowedTop.has(e.name) || e.isSymbolicLink())) {
        throw new Error('Translation ZIP contains unexpected files or links');
    }
    const manifestPath = path.join(folder, 'translation-pack.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest || manifest.schemaVersion !== 1 || manifest.version !== releaseVersion ||
        !/^\d+\.\d+\.\d+$/.test(manifest.minEngineVersion || '') ||
        !/^\d+\.\d+\.\d+$/.test(manifest.maxEngineVersion || '')) {
        throw new Error('Invalid translation pack manifest');
    }
    if (compareVersions(engineVersion, manifest.minEngineVersion) < 0 ||
        compareVersions(engineVersion, manifest.maxEngineVersion) > 0) {
        throw new Error(`Translation pack ${releaseVersion} is incompatible with engine ${engineVersion}`);
    }
    let totalSize = 0;
    for (const folderName of ['dicts', 'dicts_tw']) {
        const subdir = path.join(folder, folderName);
        if (!fs.statSync(subdir).isDirectory()) throw new Error('Invalid translation directory');
        const entries = fs.readdirSync(subdir, { withFileTypes: true });
        if (!entries.length || entries.length > 80) throw new Error('Unexpected dictionary file count');
        for (const entry of entries) {
            if (!entry.isFile() || !/^[A-Za-z0-9_-]+\.json$/.test(entry.name)) {
                throw new Error('Translation pack contains an unsafe dictionary file');
            }
            const content = fs.readFileSync(path.join(subdir, entry.name));
            if (content.length > 8 * 1024 * 1024) throw new Error('Dictionary file too large');
            totalSize += content.length;
            const obj = JSON.parse(content.toString('utf8'));
            if (!obj || typeof obj !== 'object' || Array.isArray(obj) ||
                Object.values(obj).some(v => typeof v !== 'string')) {
                throw new Error('Translation pack contains invalid dictionary values');
            }
        }
    }
    if (totalSize > 32 * 1024 * 1024) throw new Error('Translation pack exceeds maximum size');
    const { compareDicts } = require('./compare_dicts');
    if (!compareDicts(path.join(folder, 'dicts'), path.join(folder, 'dicts_tw'))) {
        throw new Error('Translation pack failed terminology and dictionary alignment checks');
    }
    return manifest;
}

async function installTranslationUpdate({
    targetDir, currentEngineVersion, release,
    downloadFn = downloadVerifiedAsset,
    extractFn = extractZipArchive
} = {}) {
    if (!targetDir || !release || !/^v\d+\.\d+\.\d+$/.test(release.tag || '')) {
        throw new Error('Invalid translation update request');
    }
    const version = release.tag.slice(1);
    const current = readActiveTranslation(targetDir);
    const installedVersion = current ? current.version : currentEngineVersion;
    if (compareVersions(version, installedVersion) <= 0) {
        return { updated: false, reason: 'translation_up_to_date' };
    }
    const asset = selectTranslationAsset(release.assets, release.tag);
    if (!asset) return { updated: false, reason: 'no_translation_only_asset' };
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ag2tw-translation-update-'));
    let stageDir = null;
    try {
        const zipPath = path.join(workRoot, asset.name);
        await downloadFn(asset.url, zipPath, { expectedDigest: asset.digest });
        const extracted = extractFn(zipPath, path.join(workRoot, 'unpacked'));
        validateTranslationPack(extracted, version, currentEngineVersion);

        const packsRoot = path.join(targetDir, '.translation-packs');
        if (fs.existsSync(packsRoot) && !fs.lstatSync(packsRoot).isDirectory()) {
            throw new Error('Unsafe translation pack root');
        }
        fs.mkdirSync(packsRoot, { recursive: true, mode: 0o700 });
        const finalDir = path.join(packsRoot, version);
        stageDir = fs.mkdtempSync(path.join(packsRoot, '.stage-'));
        for (const dir of ['dicts', 'dicts_tw']) copyDirRecursive(path.join(extracted, dir), path.join(stageDir, dir));
        fs.copyFileSync(path.join(extracted, 'translation-pack.json'), path.join(stageDir, 'translation-pack.json'));
        if (fs.existsSync(finalDir)) {
            validateTranslationPack(finalDir, version, currentEngineVersion);
            fs.rmSync(stageDir, { recursive: true, force: true });
        } else {
            fs.renameSync(stageDir, finalDir);
        }
        stageDir = null;

        const stateDir = path.join(targetDir, '.watcher-state');
        fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
        const statePath = path.join(stateDir, 'active_translation.json');
        const tempPath = path.join(stateDir, `active_translation.${process.pid}.tmp`);
        fs.writeFileSync(tempPath, JSON.stringify({ version }) + '\n', { flag: 'wx', mode: 0o600 });
        try { fs.renameSync(tempPath, statePath); }
        catch (error) { try { fs.unlinkSync(tempPath); } catch {} throw error; }
        return { updated: true, previousVersion: installedVersion, newVersion: version, dataOnly: true };
    } finally {
        if (stageDir) try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch {}
        fs.rmSync(workRoot, { recursive: true, force: true });
    }
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
        if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.github.com' ||
            !/^\/repos\/atonnyshen\/antigravity2-TW\/releases\/latest\/?$/.test(parsed.pathname)) {
            return reject(new Error('Blocked untrusted release metadata URL'));
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
                const next = new URL(redirectUrl, url);
                if (next.protocol !== 'https:' || next.hostname !== 'api.github.com' || next.pathname !== parsed.pathname) {
                    return reject(new Error('Blocked release API redirect'));
                }
                res.resume();
                return https.get(next, options, redirectRes => {
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
    res.on('data', chunk => {
        body += chunk;
        if (body.length > 2 * 1024 * 1024) res.destroy(new Error('Release metadata exceeds size limit'));
    });
    res.on('error', reject);
    res.on('end', () => {
        if (res.statusCode !== 200) {
            return reject(new Error(`GitHub API returned status ${res.statusCode}`));
        }
        try {
            const data = JSON.parse(body);
            const assets = Array.isArray(data.assets) ? data.assets : [];
            resolve({
                tag: data.tag_name || '',
                name: data.name || '',
                body: data.body || '',
                publishedAt: data.published_at || '',
                htmlUrl: data.html_url || '',
                assets
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
        const normalizedExpected = String(expectedDigest || '').replace(/^sha256:/i, '').trim().toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(normalizedExpected)) {
            return reject(new Error('Release asset has no valid mandatory SHA-256 digest'));
        }
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
                        if (actualSha256 !== normalizedExpected) {
                            cleanupPart();
                            return reject(new Error(`SHA-256 checksum mismatch: expected ${normalizedExpected}, got ${actualSha256}`));
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

// Read the ZIP central directory without extracting untrusted entries. Reject
// path traversal, links, special files and oversized archives on every OS.
function verifyZipEntries(zipPath) {
    const st = fs.statSync(zipPath);
    if (st.size < 22 || st.size > 128 * 1024 * 1024) throw new Error('Invalid ZIP file size');
    const buf = fs.readFileSync(zipPath);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50 && i + 22 + buf.readUInt16LE(i + 20) === buf.length) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error('ZIP end-of-central-directory not found');
    const count = buf.readUInt16LE(eocd + 10);
    const centralSize = buf.readUInt32LE(eocd + 12);
    let pos = buf.readUInt32LE(eocd + 16);
    if (!count || count === 0xffff || count > 4000 || pos === 0xffffffff ||
        centralSize === 0xffffffff || pos + centralSize > eocd) {
        throw new Error('ZIP central-directory bounds invalid or unsupported');
    }
    const end = pos + centralSize;
    let totalSize = 0;
    for (let n = 0; n < count; n++) {
        if (pos + 46 > end || buf.readUInt32LE(pos) !== 0x02014b50) throw new Error('Invalid ZIP central directory');
        const flags = buf.readUInt16LE(pos + 8);
        const method = buf.readUInt16LE(pos + 10);
        const compressed = buf.readUInt32LE(pos + 20);
        const unpacked = buf.readUInt32LE(pos + 24);
        const nameLen = buf.readUInt16LE(pos + 28);
        const extraLen = buf.readUInt16LE(pos + 30);
        const commentLen = buf.readUInt16LE(pos + 32);
        const next = pos + 46 + nameLen + extraLen + commentLen;
        if (next > end || !nameLen || (flags & 1) || ![0, 8].includes(method) ||
            compressed === 0xffffffff || unpacked === 0xffffffff) {
            throw new Error('Invalid or encrypted ZIP entry');
        }
        const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString(flags & 0x800 ? 'utf8' : 'latin1');
        const localOffset = buf.readUInt32LE(pos + 42);
        if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50 ||
            buf.readUInt16LE(localOffset + 8) !== method) {
            throw new Error('Invalid ZIP local header');
        }
        const localNameLen = buf.readUInt16LE(localOffset + 26);
        const localName = buf.subarray(localOffset + 30, localOffset + 30 + localNameLen);
        if (localOffset + 30 + localNameLen > buf.length ||
            !localName.equals(buf.subarray(pos + 46, pos + 46 + nameLen))) {
            throw new Error('ZIP local filename differs from central directory');
        }
        const parts = name.split('/');
        if (name.startsWith('/') || name.includes('\\') || name.includes('\0') || name.includes(':') ||
            parts.some(part => part === '.' || part === '..' || /[. ]$/.test(part) && part !== '')) {
            throw new Error(`Unsafe ZIP entry path: ${name}`);
        }
        const mode = (buf.readUInt32LE(pos + 38) >>> 16) & 0o170000;
        if (![0, 0o040000, 0o100000].includes(mode)) throw new Error(`Unsafe ZIP entry type: ${name}`);
        totalSize += unpacked;
        if (totalSize > 256 * 1024 * 1024) throw new Error('ZIP exceeds maximum uncompressed size');
        pos = next;
    }
    if (pos !== end) throw new Error('Unexpected ZIP central-directory trailing bytes');
    return { entries: count, uncompressedBytes: totalSize };
}

function extractZipArchive(zipPath, extractDir) {
    verifyZipEntries(zipPath);
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

function notifyMac(title, message) {
    if (process.platform !== 'darwin') return;
    try {
        const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`;
        execFileSync('/usr/bin/osascript', ['-e', script], { stdio: 'ignore' });
    } catch {}
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
    compareVersions,
    isAllowedAssetUrl,
    selectTranslationAsset,
    readActiveTranslation,
    validateTranslationPack,
    installTranslationUpdate,
    verifyZipEntries,
    fetchLatestRelease,
    downloadVerifiedAsset,
    extractZipArchive,
    checkUpdate,
    notifyMac
};
