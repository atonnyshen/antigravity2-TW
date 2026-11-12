#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const changelogPath = path.join(repo, 'CHANGELOG.md');
const content = fs.readFileSync(changelogPath, 'utf8');

// Parse sections from CHANGELOG.md by splitting on ## <version>
const sections = {};
const parts = content.split(/\n(?=##\s+[0-9])/);
for (const part of parts) {
    const m = part.match(/^##\s+([0-9]+\.[0-9]+\.[0-9]+)/);
    if (m) {
        sections[m[1]] = part.trim();
    }
}

const titles = {
    '3.3.4': 'v3.3.4 — 適配 Antigravity v2.31.1+、協調器 (Coordinator) 與授權登入繁中化',
    '3.3.3': 'v3.3.3 — 登入引導 (NUX) 節點繁中補全與背景守護重啟隔離修復',
    '3.3.2': 'v3.3.2 — 適配 Antigravity v2.30.0+ 與 macOS Sequoia 相容性加固',
    '3.3.1': 'v3.3.1 — 雙軌安裝架構與原地寫入防護',
    '3.3.0': 'v3.3.0 — 整合上游 2.22+、FastPick 本地化與守護權限加固',
    '3.2.0': 'v3.2.0 — 背景守護架構升級與跨平台測試'
};

for (const [ver, body] of Object.entries(sections)) {
    const tag = `v${ver}`;
    const title = titles[ver] || `Release ${tag}`;
    console.log(`Syncing release ${tag} (length ${body.length} chars)...`);
    try {
        const out = execFileSync('gh', ['release', 'edit', tag, '--title', title, '--notes-file', '-'], {
            input: body,
            encoding: 'utf8',
            cwd: repo,
            timeout: 30000
        });
        console.log(`  Success: ${out.trim()}`);
    } catch (err) {
        console.error(`  Error editing ${tag}:`, err.stderr || err.message);
    }
}
