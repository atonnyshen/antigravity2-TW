#!/usr/bin/env node
'use strict';

// Release-authoring tool. End users only consume the resulting data archive.
// Produces a stored ZIP using Node built-ins, without packaging any executable files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const repo = path.resolve(__dirname, '..');
const semver = /^\d+\.\d+\.\d+$/;
const releaseVersion = require(path.join(repo, 'package.json')).version;

function getArg(name, fallback) {
    const index = process.argv.indexOf(name);
    return index < 0 ? fallback : process.argv[index + 1];
}

function crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) {
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function makeStoredZip(files) {
    const locals = [];
    const central = [];
    let offset = 0;
    for (const [name, data] of files) {
        const filename = Buffer.from(name, 'utf8');
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x800, 6);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(filename.length, 26);
        locals.push(local, filename, data);

        const item = Buffer.alloc(46);
        item.writeUInt32LE(0x02014b50, 0);
        item.writeUInt16LE(0x0314, 4);
        item.writeUInt16LE(20, 6);
        item.writeUInt16LE(0x800, 8);
        item.writeUInt32LE(crc, 16);
        item.writeUInt32LE(data.length, 20);
        item.writeUInt32LE(data.length, 24);
        item.writeUInt16LE(filename.length, 28);
        item.writeUInt32LE((0o100644 << 16) >>> 0, 38);
        item.writeUInt32LE(offset, 42);
        central.push(item, filename);
        offset += local.length + filename.length + data.length;
    }
    const centralBytes = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralBytes.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, centralBytes, end]);
}

function buildTranslationPack({ version, minEngineVersion, maxEngineVersion, output }) {
    if (![version, minEngineVersion, maxEngineVersion].every(v => semver.test(v))) {
        throw new Error('版本必須採用 X.Y.Z 格式。');
    }
    if (!output || path.extname(output).toLowerCase() !== '.zip') {
        throw new Error('請指定 ZIP 輸出路徑。');
    }
    const entries = [['translation-pack.json', Buffer.from(JSON.stringify({
        schemaVersion: 1, version, minEngineVersion, maxEngineVersion
    }, null, 2) + '\n')]];
    for (const folder of ['dicts', 'dicts_tw']) {
        for (const name of fs.readdirSync(path.join(repo, folder)).filter(x => x.endsWith('.json')).sort()) {
            entries.push([`${folder}/${name}`, fs.readFileSync(path.join(repo, folder, name))]);
        }
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const archive = makeStoredZip(entries);
    fs.writeFileSync(output, archive, { flag: 'wx' });
    return { output, entries: entries.length, sha256: crypto.createHash('sha256').update(archive).digest('hex') };
}

if (require.main === module) {
    const version = getArg('--version', releaseVersion);
    const minEngineVersion = getArg('--min-engine', version);
    const maxEngineVersion = getArg('--max-engine', version);
    const output = path.resolve(getArg('--output', path.join(repo, 'dist', `antigravity2-TW-translations-v${version}.zip`)));
    const { validateTranslationPack, verifyZipEntries } = require('./auto_updater');
    const { compareDicts } = require('./compare_dicts');
    if (!compareDicts()) throw new Error('字典檢查未通過，停止製作翻譯包。');
    const result = buildTranslationPack({ version, minEngineVersion, maxEngineVersion, output });
    const verification = verifyZipEntries(output);
    console.log(JSON.stringify({ ...result, verification }, null, 2));
}

module.exports = { buildTranslationPack, makeStoredZip };
