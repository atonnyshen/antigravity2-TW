'use strict';

const ALLOWED_RULE_FLAGS = new Set(['i', 'm', 'u']);
const ALLOWED_TRANSFORMS = new Set([
    'raw',
    'trim',
    'zhPeriod',
    'lookupOrKeep',
    'compactDuration',
    'englishDate',
    'usageDuration',
    'planAudience'
]);
const ALLOWED_PROTECTED_KEYS = new Set(['lowerWordsExclude', 'modelEffortLabels', 'slashCommands']);
const ALLOWED_SCOPED_MAP_KEYS = new Set(['swarm']);
const ALLOWED_TOP_KEYS = new Set(['schemaVersion', 'protected', 'scopedMaps', 'dynamicRules', 'attrDynamicRules']);
const ALLOWED_RULE_KEYS = new Set(['id', 'pattern', 'flags', 'transforms', 'sc', 'tw']);
const FORBIDDEN_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const MAX_REGEX_LENGTH = 512;
const MAX_TEMPLATE_LENGTH = 2000;
const MAX_RULES_PER_LIST = 2000;
const MAX_PROTECTED_ITEMS = 1000;
const MAX_SCOPED_ENTRIES = 1000;

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function hasForbiddenKey(obj) {
    return Object.keys(obj).some(k => FORBIDDEN_PROTO_KEYS.has(k));
}

function readQuantifierSpan(pat, pos) {
    const ch = pat[pos];
    if (ch === '*' || ch === '+' || ch === '?') {
        const next = pos + 1;
        return {
            end: pat[next] === '?' ? next + 1 : next,
            unbounded: ch === '*' || ch === '+',
            repeatable: ch !== '?'
        };
    }
    if (ch === '{') {
        const close = pat.indexOf('}', pos);
        if (close > pos) {
            const inner = pat.slice(pos + 1, close);
            const m = inner.match(/^(\d+)(?:,(\d*))?$/);
            if (m) {
                const min = Number(m[1]);
                const maxStr = m[2];
                const unbounded = maxStr === '';
                const max = maxStr === undefined ? min : (maxStr === '' ? Infinity : Number(maxStr));
                const next = close + 1;
                return {
                    end: pat[next] === '?' ? next + 1 : next,
                    unbounded,
                    repeatable: max > 1
                };
            }
        }
    }
    return null;
}

function isSafeRegexPattern(pattern, flags = '') {
    if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > MAX_REGEX_LENGTH) {
        return false;
    }
    if (!pattern.startsWith('^') || !pattern.endsWith('$')) return false;
    let trailEsc = 0;
    for (let j = pattern.length - 2; j >= 0 && pattern[j] === '\\'; j--) trailEsc++;
    if (trailEsc % 2 === 1) return false;

    if (typeof flags !== 'string' || flags.length > 3) return false;
    const seenFlags = new Set();
    for (const ch of flags) {
        if (!ALLOWED_RULE_FLAGS.has(ch) || seenFlags.has(ch)) return false;
        seenFlags.add(ch);
    }

    // Structural ReDoS audit: require full-string anchors, reject backreferences/lookarounds,
    // nested quantifiers, repeatable alternations, and >4 unbounded dot wildcards.
    const stack = [];
    let unboundedDotWildcards = 0;
    let i = 0;
    while (i < pattern.length) {
        const ch = pattern[i];
        if (ch === '\\') {
            if (i + 1 >= pattern.length) return false;
            const esc = pattern[i + 1];
            if ((esc >= '1' && esc <= '9') || esc === 'k') return false;
            i += 2;
            const q = readQuantifierSpan(pattern, i);
            if (q) {
                if (q.unbounded && stack.length) stack[stack.length - 1].hasUnbounded = true;
                i = q.end;
                if (readQuantifierSpan(pattern, i)) return false;
            }
            continue;
        }
        if (ch === '[') {
            i++;
            let closed = false;
            while (i < pattern.length) {
                if (pattern[i] === '\\') {
                    i += 2;
                    continue;
                }
                if (pattern[i] === ']') {
                    closed = true;
                    i++;
                    break;
                }
                i++;
            }
            if (!closed) return false;
            const q = readQuantifierSpan(pattern, i);
            if (q) {
                if (q.unbounded && stack.length) stack[stack.length - 1].hasUnbounded = true;
                i = q.end;
                if (readQuantifierSpan(pattern, i)) return false;
            }
            continue;
        }
        if (ch === '(') {
            if (pattern[i + 1] === '?' && (
                pattern[i + 2] === '=' ||
                pattern[i + 2] === '!' ||
                (pattern[i + 2] === '<' && (pattern[i + 3] === '=' || pattern[i + 3] === '!'))
            )) {
                return false;
            }
            stack.push({ hasUnbounded: false, hasAlternation: false });
            i++;
            continue;
        }
        if (ch === '|') {
            if (stack.length === 0) return false;
            stack[stack.length - 1].hasAlternation = true;
            i++;
            continue;
        }
        if (ch === ')') {
            if (stack.length === 0) return false;
            const frame = stack.pop();
            i++;
            const q = readQuantifierSpan(pattern, i);
            if (q) {
                if (q.repeatable && (frame.hasUnbounded || frame.hasAlternation)) return false;
                if (stack.length) {
                    if (q.unbounded || frame.hasUnbounded) stack[stack.length - 1].hasUnbounded = true;
                    if (frame.hasAlternation) stack[stack.length - 1].hasAlternation = true;
                }
                i = q.end;
                if (readQuantifierSpan(pattern, i)) return false;
            } else if (stack.length) {
                if (frame.hasUnbounded) stack[stack.length - 1].hasUnbounded = true;
                if (frame.hasAlternation) stack[stack.length - 1].hasAlternation = true;
            }
            continue;
        }
        if (ch === '.') {
            i++;
            const q = readQuantifierSpan(pattern, i);
            if (q) {
                if (q.unbounded) {
                    unboundedDotWildcards++;
                    if (unboundedDotWildcards > 4) return false;
                    if (stack.length) stack[stack.length - 1].hasUnbounded = true;
                }
                i = q.end;
                if (readQuantifierSpan(pattern, i)) return false;
            }
            continue;
        }
        if (ch === '*' || ch === '+' || ch === '?' || ch === '{') {
            const q = readQuantifierSpan(pattern, i);
            if (q) {
                if (q.unbounded && stack.length) stack[stack.length - 1].hasUnbounded = true;
                i = q.end;
                if (readQuantifierSpan(pattern, i)) return false;
                continue;
            }
        }
        i++;
    }
    if (stack.length !== 0) return false;

    try {
        new RegExp(pattern, flags);
        return true;
    } catch {
        return false;
    }
}

function validateRuleList(rules, sectionName) {
    if (!Array.isArray(rules)) {
        throw new Error(`${sectionName} must be an array`);
    }
    if (rules.length > MAX_RULES_PER_LIST) {
        throw new Error(`${sectionName} exceeds maximum rule count`);
    }
    const seenIds = new Set();
    for (let idx = 0; idx < rules.length; idx++) {
        const rule = rules[idx];
        if (!isPlainObject(rule) || hasForbiddenKey(rule)) {
            throw new Error(`${sectionName}[${idx}] must be a plain object without forbidden keys`);
        }
        for (const key of Object.keys(rule)) {
            if (!ALLOWED_RULE_KEYS.has(key)) {
                throw new Error(`${sectionName}[${idx}] contains unsupported key "${key}"`);
            }
        }
        if (typeof rule.id !== 'string' || !/^[a-z0-9._-]+$/.test(rule.id)) {
            throw new Error(`${sectionName}[${idx}] requires an ASCII slug id`);
        }
        if (seenIds.has(rule.id)) {
            throw new Error(`${sectionName} contains duplicate rule id "${rule.id}"`);
        }
        seenIds.add(rule.id);

        const flags = rule.flags === undefined ? '' : rule.flags;
        if (!isSafeRegexPattern(rule.pattern, flags)) {
            throw new Error(`${sectionName}[${idx}] (${rule.id}) has unsafe or invalid regex pattern`);
        }
        if (rule.transforms !== undefined) {
            if (!isPlainObject(rule.transforms) || hasForbiddenKey(rule.transforms)) {
                throw new Error(`${sectionName}[${idx}] (${rule.id}) transforms must be a plain object`);
            }
            for (const [groupKey, transformName] of Object.entries(rule.transforms)) {
                if (!/^[1-9]$/.test(groupKey)) {
                    throw new Error(`${sectionName}[${idx}] (${rule.id}) invalid capture group "${groupKey}"`);
                }
                if (typeof transformName !== 'string' || !ALLOWED_TRANSFORMS.has(transformName)) {
                    throw new Error(`${sectionName}[${idx}] (${rule.id}) unsupported transform "${transformName}"`);
                }
            }
        }
        for (const field of ['sc', 'tw']) {
            if (typeof rule[field] !== 'string' || rule[field].trim() === '' || rule[field].length > MAX_TEMPLATE_LENGTH) {
                throw new Error(`${sectionName}[${idx}] (${rule.id}) field "${field}" must be a bounded non-empty string`);
            }
        }
    }
}

function validateRuntimeRulesObject(obj) {
    if (!isPlainObject(obj) || hasForbiddenKey(obj)) {
        throw new Error('Runtime rules root must be a plain object');
    }
    for (const key of Object.keys(obj)) {
        if (!ALLOWED_TOP_KEYS.has(key)) {
            throw new Error(`Runtime rules contains unsupported top-level key "${key}"`);
        }
    }
    if (obj.schemaVersion !== 1) {
        throw new Error('Runtime rules schemaVersion must be 1');
    }

    if (obj.protected !== undefined) {
        if (!isPlainObject(obj.protected) || hasForbiddenKey(obj.protected)) {
            throw new Error('protected must be a plain object');
        }
        for (const [key, list] of Object.entries(obj.protected)) {
            if (!ALLOWED_PROTECTED_KEYS.has(key)) {
                throw new Error(`protected contains unsupported key "${key}"`);
            }
            if (!Array.isArray(list) || list.length > MAX_PROTECTED_ITEMS) {
                throw new Error(`protected.${key} must be a bounded array`);
            }
            for (const item of list) {
                if (typeof item !== 'string' || item.trim() === '' || item.length > 200) {
                    throw new Error(`protected.${key} contains an invalid entry`);
                }
            }
        }
    }

    if (obj.scopedMaps !== undefined) {
        if (!isPlainObject(obj.scopedMaps) || hasForbiddenKey(obj.scopedMaps)) {
            throw new Error('scopedMaps must be a plain object');
        }
        for (const [scopeName, entries] of Object.entries(obj.scopedMaps)) {
            if (!ALLOWED_SCOPED_MAP_KEYS.has(scopeName)) {
                throw new Error(`scopedMaps contains unsupported scope "${scopeName}"`);
            }
            if (!isPlainObject(entries) || hasForbiddenKey(entries)) {
                throw new Error(`scopedMaps.${scopeName} must be a plain object`);
            }
            const keys = Object.keys(entries);
            if (keys.length > MAX_SCOPED_ENTRIES) {
                throw new Error(`scopedMaps.${scopeName} exceeds maximum entries`);
            }
            for (const [k, pair] of Object.entries(entries)) {
                if (!k || k.length > 200 || !isPlainObject(pair) || hasForbiddenKey(pair)) {
                    throw new Error(`scopedMaps.${scopeName}["${k}"] must map to { sc, tw }`);
                }
                const pairKeys = Object.keys(pair);
                if (pairKeys.some(pk => pk !== 'sc' && pk !== 'tw') ||
                    typeof pair.sc !== 'string' || pair.sc.trim() === '' ||
                    typeof pair.tw !== 'string' || pair.tw.trim() === '') {
                    throw new Error(`scopedMaps.${scopeName}["${k}"] requires non-empty sc and tw strings`);
                }
            }
        }
    }

    if (obj.dynamicRules !== undefined) {
        validateRuleList(obj.dynamicRules, 'dynamicRules');
    }
    if (obj.attrDynamicRules !== undefined) {
        validateRuleList(obj.attrDynamicRules, 'attrDynamicRules');
    }
    return obj;
}

module.exports = {
    ALLOWED_RULE_FLAGS,
    ALLOWED_TRANSFORMS,
    isSafeRegexPattern,
    validateRuntimeRulesObject
};
