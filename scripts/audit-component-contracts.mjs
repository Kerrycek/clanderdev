#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

const RULES = [
  { component: 'PageHeader', badProps: ['subtitle'] },
  { component: 'CardHeader', badProps: ['description'] },
  { component: 'Modal', badProps: ['isOpen'] },
  { component: 'Drawer', badProps: ['onOpenChange'] },
  { component: 'SmartInputHelp', badProps: ['description'] },
  { component: 'Select', badProps: ['description'] },
  { component: 'Input', badProps: ['description'] },
];

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.isFile() && /\.(tsx|jsx)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

function extractTags(text, component) {
  const tags = [];
  let i = 0;
  while (true) {
    const idx = text.indexOf('<' + component, i);
    if (idx === -1) break;
    let j = idx;
    let inSingle = false;
    let inDouble = false;
    let braceDepth = 0;
    while (j < text.length) {
      const ch = text[j];
      if (ch === "'" && !inDouble && braceDepth === 0) inSingle = !inSingle;
      else if (ch === '"' && !inSingle && braceDepth === 0) inDouble = !inDouble;
      else if (!inSingle && !inDouble) {
        if (ch === '{') braceDepth += 1;
        else if (ch === '}' && braceDepth > 0) braceDepth -= 1;
        else if (ch === '>' && braceDepth === 0) {
          j += 1;
          break;
        }
      }
      j += 1;
    }
    tags.push({ start: idx, text: text.slice(idx, j) });
    i = j;
  }
  return tags;
}

function hasBadProp(tagText, prop) {
  const re = new RegExp(`(?:^|\\s)${prop}\\s*=`);
  return re.test(tagText);
}

const findings = [];
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const rule of RULES) {
    for (const tag of extractTags(text, rule.component)) {
      for (const badProp of rule.badProps) {
        if (hasBadProp(tag.text, badProp)) {
          const line = text.slice(0, tag.start).split('\n').length;
          const rel = path.relative(ROOT, file);
          const first = tag.text.split('\n').map((s) => s.trim()).join(' ').slice(0, 220);
          findings.push(`${rel}:${line}: <${rule.component}> uses unsupported prop \`${badProp}\` :: ${first}`);
        }
      }
    }
  }
}

if (findings.length) {
  console.error('Component contract audit failed:\n');
  for (const f of findings) console.error('- ' + f);
  process.exit(1);
}

console.log('audit-component-contracts: OK');
