const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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

function fetchLatestRelease(repo = 'atonnyshen/antigravity2-TW', timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
        const url = `https://api.github.com/repos/${repo}/releases/latest`;
        const options = {
            headers: {
                'User-Agent': 'Antigravity2TW-AutoUpdater/3.0',
                'Accept': 'application/vnd.github.v3+json'
            },
            timeout: timeoutMs
        };

        const req = https.get(url, options, res => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                const redirectUrl = res.headers.location;
                if (!redirectUrl) return reject(new Error('Redirect location missing'));
                return https.get(redirectUrl, options, redirectRes => {
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
            resolve({
                tag: data.tag_name || '',
                name: data.name || '',
                body: data.body || '',
                publishedAt: data.published_at || '',
                htmlUrl: data.html_url || ''
            });
        } catch (e) {
            reject(e);
        }
    });
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
    silentNotification = false
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
        const release = await fetchLatestRelease(repo);
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
            notifyMac('Antigravity 繁體中文化更新', `發現新版本 ${release.tag}，包含最新字典與修復。點擊或至終端執行更新。`);
        }

        return result;
    } catch (e) {
        return { hasUpdate: false, error: e.message, lastChecked: Date.now() };
    }
}

module.exports = {
    compareVersions,
    fetchLatestRelease,
    checkUpdate,
    notifyMac
};
