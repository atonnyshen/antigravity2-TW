/**
 * Antigravity Reverse-Engineering & Diagnostics Dev Tool
 * 统一多功能诊断开发套件
 * 
 * 用法:
 *   node scripts/dev_tool.js port                          # 查看当前 language_server 进程 PID、端口与 CSRF 令牌
 *   node scripts/dev_tool.js search <keyword>              # 在当前运行的 live main.js 中搜索关键字
 *   node scripts/dev_tool.js slice <pos> [len]             # 查看 live main.js 指定位置的代码片段
 *   node scripts/dev_tool.js dump-mcp [--update-baseline]  # 导出全量官方 MCP 目录，并与 Git 基准进行增量差分对比
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const child_process = require('child_process');

function getLanguageServerInfo() {
    try {
        const out = child_process.execSync(
            'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'language_server.exe\'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json"',
            { encoding: 'utf-8', stdio: 'pipe' }
        );
        if (!out || !out.trim()) return null;
        let proc = JSON.parse(out.trim());
        if (Array.isArray(proc)) proc = proc[0];
        if (!proc || !proc.ProcessId) return null;

        const pid = proc.ProcessId;
        const cmd = proc.CommandLine || '';
        const csrfMatch = cmd.match(/--csrf_token\s+([a-f0-9-]+)/i);
        const csrfToken = csrfMatch ? csrfMatch[1] : '';

        // 查询端口
        const netOut = child_process.execSync(
            `powershell -NoProfile -Command "Get-NetTCPConnection -OwningProcess ${pid} -State Listen | Select-Object -ExpandProperty LocalPort"`,
            { encoding: 'utf-8', stdio: 'pipe' }
        );
        const ports = netOut.trim().split(/\r?\n/).map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p));

        return { pid, csrfToken, ports, cmd };
    } catch (e) {
        return null;
    }
}

async function findHttpsPort(ports) {
    for (const port of ports) {
        const ok = await new Promise(resolve => {
            const req = https.get(`https://127.0.0.1:${port}/main.js`, { rejectUnauthorized: false, timeout: 1500 }, res => {
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
        });
        if (ok) return port;
    }
    return null;
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { rejectUnauthorized: false }, res => {
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        }).on('error', reject);
    });
}

async function cmdPort() {
    const info = getLanguageServerInfo();
    if (!info) {
        console.error('[!] 未检测到正在运行的 language_server.exe 进程。');
        return;
    }
    console.log(`[+] 检测到 language_server.exe (PID: ${info.pid})`);
    console.log(`[+] 监听端口列表: ${info.ports.join(', ')}`);
    console.log(`[+] CSRF 令牌: ${info.csrfToken || '未找到'}`);

    const httpsPort = await findHttpsPort(info.ports);
    if (httpsPort) {
        console.log(`[+] Live Web/SPA 端口: https://127.0.0.1:${httpsPort}`);
    } else {
        console.log(`[-] 未能连接至任何 HTTPS Web 端口`);
    }
}

async function cmdSearch(keyword, contextLen = 300) {
    if (!keyword) {
        console.error('用法: node scripts/dev_tool.js search <keyword> [contextLen]');
        return;
    }
    const info = getLanguageServerInfo();
    if (!info) {
        console.error('[!] 未检测到正在运行的 language_server.exe。');
        return;
    }
    const httpsPort = await findHttpsPort(info.ports);
    if (!httpsPort) {
        console.error('[!] 无法探测到 language_server 的 HTTPS 端口。');
        return;
    }

    console.log(`[*] 正在从 https://127.0.0.1:${httpsPort}/main.js 下载并搜索: "${keyword}"...`);
    const js = await fetchUrl(`https://127.0.0.1:${httpsPort}/main.js`);
    console.log(`[*] main.js 大小: ${(js.length / 1024 / 1024).toFixed(2)} MB`);

    let matchCount = 0;
    let idx = 0;
    const clen = parseInt(contextLen, 10) || 300;
    while ((idx = js.indexOf(keyword, idx)) !== -1) {
        matchCount++;
        console.log(`\n=================== 匹配项 #${matchCount} (位置: ${idx}) ===================`);
        const start = Math.max(0, idx - clen);
        const end = Math.min(js.length, idx + keyword.length + clen);
        console.log(js.slice(start, end));
        idx += keyword.length;
    }

    console.log(`\n[*] 搜索完毕，共找到 ${matchCount} 处匹配。`);
}

async function cmdSlice(startPos, length = 500) {
    const start = parseInt(startPos, 10);
    const len = parseInt(length, 10) || 500;
    if (isNaN(start)) {
        console.error('用法: node scripts/dev_tool.js slice <startPos> [length]');
        return;
    }
    const info = getLanguageServerInfo();
    if (!info) return console.error('[!] language_server 未运行');
    const httpsPort = await findHttpsPort(info.ports);
    if (!httpsPort) return console.error('[!] 无法连接 HTTPS 端口');

    const js = await fetchUrl(`https://127.0.0.1:${httpsPort}/main.js`);
    console.log(js.slice(start, start + len));
}

async function cmdDumpMcp(args = []) {
    const info = getLanguageServerInfo();
    if (!info) return console.error('[!] language_server 未运行');
    const httpsPort = await findHttpsPort(info.ports);
    if (!httpsPort) return console.error('[!] 无法连接 HTTPS 端口');
    if (!info.csrfToken) return console.error('[!] 未能解析 CSRF Token');

    console.log(`[*] 正在通过 Connect-Web RPC 向 https://127.0.0.1:${httpsPort} 请求 MCP 目录...`);
    const reqBody = JSON.stringify({ os: process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'darwin' : 'linux'), searchQuery: '' });

    const plugins = await new Promise((resolve, reject) => {
        const req = https.request(`https://127.0.0.1:${httpsPort}/exa.language_server_pb.LanguageServerService/GetAvailableCascadePlugins`, {
            method: 'POST',
            rejectUnauthorized: false,
            headers: {
                'content-type': 'application/json',
                'x-codeium-csrf-token': info.csrfToken
            }
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`RPC 返回 HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString('utf-8')}`));
                }
                try {
                    const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
                    resolve(data.plugins || []);
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(reqBody);
        req.end();
    });

    console.log(`[√] 成功从客户端拉取到 ${plugins.length} 个官方 MCP 服务器！`);

    // 1. 写入本地 scratch 缓存
    const scratchDir = path.join(__dirname, '..', 'scratch');
    if (fs.existsSync(scratchDir)) {
        const outPath = path.join(scratchDir, 'mcp_catalog_official_raw.json');
        fs.writeFileSync(outPath, JSON.stringify(plugins, null, 2), 'utf-8');
        console.log(`[√] 本地抓包缓存已更新: ${outPath}`);
    }

    // 2. 与 Git 追踪的基准文件 (scripts/mcp_catalog_baseline.json) 进行增量差分对比
    const baselinePath = path.join(__dirname, 'mcp_catalog_baseline.json');
    if (fs.existsSync(baselinePath)) {
        try {
            const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
            const baselineIds = new Set(baseline.map(b => b.id));
            const pluginIds = new Set(plugins.map(p => p.id));

            const added = plugins.filter(p => !baselineIds.has(p.id));
            const removed = baseline.filter(b => !pluginIds.has(b.id));

            console.log('\n------------------ 基准对比 (Diff 分析) ------------------');
            console.log(`当前拉取数: ${plugins.length} | Git 基准数: ${baseline.length}`);

            if (added.length === 0 && removed.length === 0) {
                console.log('[√] 与 Git 追踪的基准文件完全一致，未发现任何增删变动！');
            } else {
                if (added.length > 0) {
                    console.log(`\n[+] 发现 ${added.length} 个新增 MCP 服务器:`);
                    for (const item of added) {
                        console.log(`    + [${item.id}] ${item.title}`);
                    }
                }
                if (removed.length > 0) {
                    console.log(`\n[-] 发现 ${removed.length} 个已下线/移除 MCP 服务器:`);
                    for (const item of removed) {
                        console.log(`    - [${item.id}] ${item.title}`);
                    }
                }
            }
        } catch (e) {
            console.warn('[!] 读取基准文件对比失败:', e.message);
        }
    } else {
        console.log('[i] 未找到基准文件 scripts/mcp_catalog_baseline.json');
    }

    // 3. 词典覆盖率检查
    const dictPath = path.join(__dirname, '..', 'dicts', 'page_mcp_knowledge.json');
    if (fs.existsSync(dictPath)) {
        try {
            const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
            const missing = plugins.filter(p => !dict[p.description]);
            console.log('\n------------------ 词典汉化覆盖率检查 ------------------');
            if (missing.length === 0) {
                console.log(`[√] 完美！当前全量 ${plugins.length} 个 MCP 描述均已全部收录在中文词典中！`);
            } else {
                console.log(`[!] 注意: 发现 ${missing.length} 项 MCP 描述尚未在词典中找到翻译:`);
                for (const m of missing) {
                    console.log(`    * [${m.id}] ${m.title}`);
                }
            }
        } catch (e) {}
    }

    // 4. 更新基准文件
    if (args.includes('--update-baseline')) {
        fs.writeFileSync(baselinePath, JSON.stringify(plugins, null, 2), 'utf-8');
        console.log(`\n[√] 已将最新清册写入并更新 Git 基准文件: ${baselinePath}`);
    } else {
        console.log('\n提示: 如需将本次抓取的数据更新为新的 Git 基准，可加上参数: --update-baseline');
    }
}

async function main() {
    const [,, command, ...args] = process.argv;
    switch (command) {
        case 'port':
            await cmdPort();
            break;
        case 'search':
            await cmdSearch(args[0], args[1]);
            break;
        case 'slice':
            await cmdSlice(args[0], args[1]);
            break;
        case 'dump-mcp':
            await cmdDumpMcp(args);
            break;
        default:
            console.log('Antigravity 逆向与排查综合工具集 (dev_tool.js)');
            console.log('可用命令:');
            console.log('  node scripts/dev_tool.js port                          - 检测语言服务器 PID、端口与 CSRF Token');
            console.log('  node scripts/dev_tool.js search <keyword>              - 在运行中的 live main.js 中搜索关键字');
            console.log('  node scripts/dev_tool.js slice <pos> [len]             - 查看 live main.js 指定位置切片');
            console.log('  node scripts/dev_tool.js dump-mcp [--update-baseline]  - 导出官方 MCP 目录并与 Git 基准进行增量对比');
            break;
    }
}

main().catch(err => {
    console.error('[错误]', err.message);
});
