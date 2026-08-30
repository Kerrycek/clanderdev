#!/usr/bin/env node
/**
 * Mutation Surface Audit
 *
 * Goal: help keep the “preflight → local lock → track action_state → invalidate”
 * contract consistent across the codebase.
 *
 * This script is intentionally heuristic. It does NOT attempt to prove correctness,
 * but it should catch common drift patterns when new mutations are added.
 *
 * Usage:
 *   node scripts/audit-mutations.mjs
 *   node scripts/audit-mutations.mjs --write work/audits/mutations.md
 *   node scripts/audit-mutations.mjs --json
 *
 * Options:
 *   --root <dir>       root directory to scan (default: src)
 *   --write <path>     write a Markdown report to <path>
 *   --json             print JSON output (instead of Markdown)
 *   --fail-on-warn     exit 1 when any warning is found
 *   --help             show help
 *
 * Ignore directives (leading comments before the mutation statement):
 *   // audit:ignore
 *   // audit:ignore <code> <code> ...
 *
 * Warning codes:
 *   - missing-trackActionState
 *   - trackActionState-no-object
 *   - missing-local-lock
 *   - missing-local-lock-release
 *   - async-onMutate-without-snapshot-variables
 *
 * Parsing strategy:
 * - If the optional `typescript` dependency is available (in a developer install),
 *   we use a TypeScript AST to analyze mutations.
 * - If it isn't available (e.g. in minimal environments), we fall back to a
 *   conservative regex/brace-scan heuristic.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

let ts = null;
try {
  // TypeScript is a devDependency, but in some environments node_modules isn't present.
  // In that case we fall back to regex scanning.
  const mod = await import('typescript');
  ts = mod?.default ?? mod;
} catch {
  ts = null;
}

function usage(exitCode = 0) {
  const msg = `
Mutation Surface Audit

Usage:
  node scripts/audit-mutations.mjs [options]

Options:
  --root <dir>       root directory to scan (default: src)
  --write <path>     write a Markdown report to <path>
  --json             print JSON output (instead of Markdown)
  --fail-on-warn     exit 1 when any warning is found
  --help             show help
`.trim();
  // eslint-disable-next-line no-console
  console.log(msg);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const opts = {
    root: 'src',
    write: null,
    json: false,
    failOnWarn: false,
    parser: ts ? 'typescript' : 'regex',
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') usage(0);
    if (a === '--json') {
      opts.json = true;
      continue;
    }
    if (a === '--fail-on-warn') {
      opts.failOnWarn = true;
      continue;
    }
    if (a === '--root') {
      const v = argv[i + 1];
      if (!v) usage(1);
      opts.root = v;
      i++;
      continue;
    }
    if (a === '--write') {
      const v = argv[i + 1];
      if (!v) usage(1);
      opts.write = v;
      i++;
      continue;
    }

    // Unknown arg
    usage(1);
  }

  return opts;
}

async function listSourceFiles(rootDir) {
  const out = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'build' || e.name === '.git') continue;
        await walk(path.join(dir, e.name));
        continue;
      }
      if (!e.isFile()) continue;
      if ((e.name.endsWith('.ts') || e.name.endsWith('.tsx')) && !e.name.endsWith('.d.ts')) {
        out.push(path.join(dir, e.name));
      }
    }
  }

  await walk(rootDir);
  return out.sort();
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

/** ===========================
 *  Shared warning logic
 *  =========================== */

function buildWarnings(entry) {
  const warnings = [];
  const ignore = entry.ignore ?? { ignoreAll: false, tags: [] };
  const ignoreAll = !!ignore.ignoreAll;
  const ignoreTags = new Set(ignore.tags || []);

  function warn(code, message) {
    if (ignoreAll) return;
    if (ignoreTags.has(code)) return;
    warnings.push({ code, message });
  }

  const facts = entry.facts || {};

  // React Query awaits onMutate and then reads the mutation options again.
  // Explicit async guards therefore need immutable request variables on both
  // sides of that await, otherwise a rerender can swap route/form closures.
  if (facts.asyncOnMutateWithoutSnapshotVariables) {
    warn(
      'async-onMutate-without-snapshot-variables',
      'Uses an inline async onMutate without snapshot variables in both onMutate and mutationFn.'
    );
  }

  // Strong rule: if we read action_state_id, we should track it (otherwise locks/toasts won't bind)
  if (facts.getMetaActionStateId && !facts.trackActionState) {
    warn(
      'missing-trackActionState',
      'Uses getMetaActionStateId(...) but does not call trackActionState(...).'
    );
  }

  // Strong-ish rule: tracked tasks should be bound to an object whenever possible.
  if (facts.trackActionState && !facts.trackActionStateWithObject) {
    warn(
      'trackActionState-no-object',
      'Tracks an action state without binding it to an object (pass { object: ... }).'
    );
  }

  // Recommended: if we track an object action, we should acquire a local lock so the UI stays safe/responsive.
  if (facts.trackActionStateWithObject && !facts.acquireLocalLock) {
    warn(
      'missing-local-lock',
      'Tracks an object action state but does not acquire a local lock (acquireLocalLock).'
    );
  }

  // Recommended: any acquired local lock should be released on error/settled (locks bound to action_state_id are released on completion).
  if (facts.acquireLocalLock && !facts.releaseLocalLock) {
    warn(
      'missing-local-lock-release',
      'Acquires a local lock but never calls releaseLocalLock (consider onSettled).'
    );
  }

  return warnings;
}

/** ===========================
 *  TypeScript parser mode
 *  =========================== */

function calleeParts(expr) {
  if (ts.isIdentifier(expr)) return [expr.text];
  if (ts.isPropertyAccessExpression(expr)) return [...calleeParts(expr.expression), expr.name.text];
  return [];
}

function findStatement(node) {
  let n = node;
  while (n && !ts.isStatement(n)) n = n.parent;
  return n || null;
}

function parseIgnoreDirectivesTs(sourceText, stmt) {
  const fullStart = stmt.getFullStart();
  const ranges = ts.getLeadingCommentRanges(sourceText, fullStart) || [];
  let ignoreAll = false;
  const tags = new Set();

  for (const r of ranges) {
    const raw = sourceText.slice(r.pos, r.end);
    const m = raw.match(/audit:ignore(?:\s+([^\n*\/]+))?/);
    if (!m) continue;

    const rest = (m[1] || '').trim();
    if (!rest) {
      ignoreAll = true;
      continue;
    }
    for (const tag of rest.split(/\s+/).map((x) => x.trim()).filter(Boolean)) tags.add(tag);
  }

  return { ignoreAll, tags };
}

function objectHasProp(objLit, name) {
  for (const p of objLit.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name) return true;
    if (ts.isPropertyAssignment(p) && ts.isStringLiteral(p.name) && p.name.text === name) return true;
    if (ts.isShorthandPropertyAssignment(p) && p.name.text === name) return true;
  }
  return false;
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function objectFunctionProp(objLit, name) {
  for (const prop of objLit.properties) {
    if (ts.isPropertyAssignment(prop) && propertyNameText(prop.name) === name) {
      const initializer = prop.initializer;
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) return initializer;
    }
    if (ts.isMethodDeclaration(prop) && propertyNameText(prop.name) === name) return prop;
  }
  return null;
}

function hasAsyncModifier(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword));
}

function hasAsyncOnMutateSnapshotRisk(objLit) {
  const onMutate = objectFunctionProp(objLit, 'onMutate');
  if (!onMutate || !hasAsyncModifier(onMutate)) return false;

  const mutationFn = objectFunctionProp(objLit, 'mutationFn');
  return onMutate.parameters.length === 0 || Boolean(mutationFn && mutationFn.parameters.length === 0);
}

function scanForFactsTs(node, facts) {
  if (ts.isIdentifier(node) && node.text === 'acquireMutationContext') {
    facts.acquireLocalLock = true;
  }

  if (ts.isPropertyAccessExpression(node)) {
    const parts = calleeParts(node);
    const last = parts.at(-1);
    if (last === 'acquire' && parts.at(-2) === 'lifetimeMutationGuard') facts.acquireLocalLock = true;
    if (last === 'settle' && parts.at(-2) === 'lifetimeMutationGuard') facts.releaseLocalLock = true;
  }

  if (ts.isCallExpression(node)) {
    const parts = calleeParts(node.expression);
    const last = parts[parts.length - 1];

    if (last === 'acquireLocalLock' || last === 'acquireMutationContext'
      || (last === 'acquire' && parts.at(-2) === 'lifetimeMutationGuard')) facts.acquireLocalLock = true;
    if (last === 'releaseLocalLock' || last === 'settleLocalLock'
      || (last === 'settle' && parts.at(-2) === 'lifetimeMutationGuard')) facts.releaseLocalLock = true;

    if (last === 'getMetaActionStateId') facts.getMetaActionStateId = true;

    if (last === 'trackActionState' || (last === 'track' && parts.at(-2) === 'lifetimeMutationGuard')) {
      facts.trackActionState = true;
      if (last === 'track') facts.trackActionStateWithObject = true;
      const arg2 = node.arguments[1];
      if (arg2 && ts.isObjectLiteralExpression(arg2) && objectHasProp(arg2, 'object')) {
        facts.trackActionStateWithObject = true;
      }
    }

    if (typeof last === 'string' && last.toLowerCase().startsWith('preflight')) facts.preflight = true;
  }

  ts.forEachChild(node, (c) => scanForFactsTs(c, facts));
}

function analyzeMutationCallTs(sf, sourceText, callExpr, filePath) {
  const start = callExpr.getStart(sf);
  const loc = sf.getLineAndCharacterOfPosition(start);
  const stmt = findStatement(callExpr);
  const ignore = stmt ? parseIgnoreDirectivesTs(sourceText, stmt) : { ignoreAll: false, tags: new Set() };

  let name = '(anonymous)';
  if (ts.isVariableDeclaration(callExpr.parent) && ts.isIdentifier(callExpr.parent.name)) {
    name = callExpr.parent.name.text;
  }

  const arg0 = callExpr.arguments[0];
  const facts = {
    acquireLocalLock: false,
    releaseLocalLock: false,
    getMetaActionStateId: false,
    trackActionState: false,
    trackActionStateWithObject: false,
    preflight: false,
    hasObjectLiteralArg: ts.isObjectLiteralExpression(arg0),
    asyncOnMutateWithoutSnapshotVariables: false,
  };

  if (ts.isObjectLiteralExpression(arg0)) {
    scanForFactsTs(arg0, facts);
    facts.asyncOnMutateWithoutSnapshotVariables = hasAsyncOnMutateSnapshotRisk(arg0);
  }

  const entry = {
    file: filePath,
    line: loc.line + 1,
    col: loc.character + 1,
    name,
    ignore: { ignoreAll: ignore.ignoreAll, tags: [...ignore.tags] },
    facts,
  };
  entry.warnings = buildWarnings(entry);

  return entry;
}

async function analyzeFileTs(filePath) {
  const sourceText = await fs.readFile(filePath, 'utf8');
  const kind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, kind);

  const mutations = [];

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useMutation') {
      mutations.push(analyzeMutationCallTs(sf, sourceText, node, filePath));
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return mutations;
}

/** ===========================
 *  Regex/brace-scan fallback mode
 *  =========================== */

function computeLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function lineColOfIndex(lineStarts, idx) {
  // Find greatest line start <= idx
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = lineStarts[mid];
    if (v === idx) {
      lo = mid;
      break;
    }
    if (v < idx) lo = mid + 1;
    else hi = mid - 1;
  }
  const line = Math.max(0, lo - 1);
  const col = idx - lineStarts[line];
  return { line: line + 1, col: col + 1 };
}

function isMutationStatementPrefixLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;

  if (/^(?:export\s+)?(?:const|let|var)\b/.test(trimmed)) return true;
  if (/=\s*$/.test(trimmed)) return true;
  if (/^(?:<[^>]+>\s*)?$/.test(trimmed)) return true;

  return false;
}

function parseIgnoreDirectivesRegex(sourceText, idx) {
  const start = Math.max(0, idx - 800);
  const snippet = sourceText.slice(start, idx);
  const lines = snippet.split(/\r?\n/);

  let ignoreAll = false;
  const tags = new Set();
  let skippedStatementPrefix = false;

  // Walk backwards until we hit a non-comment line that is not just the
  // variable-declaration prefix for the current useMutation(...) call.
  for (let i = lines.length - 1, steps = 0; i >= 0 && steps < 16; i--, steps++) {
    const line = (lines[i] || '').trim();
    if (!line) continue;

    const isCommentLine = line.startsWith('//') || line.startsWith('/*') || line.startsWith('*');
    if (!isCommentLine) {
      if (!skippedStatementPrefix && isMutationStatementPrefixLine(line)) {
        skippedStatementPrefix = true;
        continue;
      }
      break;
    }

    const m = line.match(/audit:ignore(?:\s+(.+))?/);
    if (!m) continue;

    const rest = (m[1] || '').trim();
    if (!rest) {
      ignoreAll = true;
      continue;
    }
    for (const tag of rest.split(/\s+/).map((x) => x.trim()).filter(Boolean)) tags.add(tag);
  }

  return { ignoreAll, tags };
}

function scanForwardSkippingStringsAndComments(text, i) {
  // Returns next index after skipping a string/comment starting at i, or i if no skip.
  const ch = text[i];
  const next = text[i + 1];

  // line comment
  if (ch === '/' && next === '/') {
    let j = i + 2;
    while (j < text.length && text[j] !== '\n') j++;
    return j;
  }

  // block comment
  if (ch === '/' && next === '*') {
    let j = i + 2;
    while (j < text.length && !(text[j] === '*' && text[j + 1] === '/')) j++;
    return Math.min(text.length, j + 2);
  }

  // string literal
  if (ch === "'" || ch === '"' || ch === '`') {
    const quote = ch;
    let j = i + 1;
    while (j < text.length) {
      const c = text[j];
      if (c === '\\') {
        j += 2;
        continue;
      }
      if (quote === '`' && c === '$' && text[j + 1] === '{') {
        // Skip template expression content with a small brace depth scanner
        j += 2;
        let depth = 1;
        while (j < text.length && depth > 0) {
          const k = scanForwardSkippingStringsAndComments(text, j);
          if (k !== j) {
            j = k;
            continue;
          }
          const cc = text[j];
          if (cc === '{') depth++;
          else if (cc === '}') depth--;
          j++;
        }
        continue;
      }
      if (c === quote) return j + 1;
      j++;
    }
    return j;
  }

  return i;
}

function findCallOpenParen(text, startIdx) {
  // Find '(' after "useMutation" while skipping generic '<...>' parts.
  let angleDepth = 0;
  for (let i = startIdx; i < text.length && i < startIdx + 600; i++) {
    const k = scanForwardSkippingStringsAndComments(text, i);
    if (k !== i) {
      i = k - 1;
      continue;
    }

    const ch = text[i];
    if (ch === '<') {
      angleDepth++;
      continue;
    }
    if (ch === '>' && angleDepth > 0) {
      // Do not treat the '>' in '=>' as a generic closer.
      if (i > 0 && text[i - 1] === '=') continue;
      angleDepth--;
      continue;
    }
    if (ch === '(' && angleDepth === 0) return i;
  }
  return -1;
}

function findMatchingBrace(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const k = scanForwardSkippingStringsAndComments(text, i);
    if (k !== i) {
      i = k - 1;
      continue;
    }

    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractMutationObjectLiteral(text, useMutationIdx) {
  const openParen = findCallOpenParen(text, useMutationIdx);
  if (openParen === -1) return null;

  // Find first '{' after the '('
  let openBrace = -1;
  for (let i = openParen + 1; i < text.length && i < openParen + 800; i++) {
    const k = scanForwardSkippingStringsAndComments(text, i);
    if (k !== i) {
      i = k - 1;
      continue;
    }
    if (text[i] === '{') {
      openBrace = i;
      break;
    }
    // If we hit ')' before '{', it's not an object-literal config
    if (text[i] === ')') return null;
  }
  if (openBrace === -1) return null;

  const closeBrace = findMatchingBrace(text, openBrace);
  if (closeBrace === -1) return null;

  return { openBrace, closeBrace, body: text.slice(openBrace, closeBrace + 1) };
}

function inferNameFromPrefix(prefix) {
  // Try to find "const name = useMutation" near the end of prefix.
  const m = prefix.match(/(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*$/);
  if (m) return m[1];
  return '(anonymous)';
}

function scanFactsRegex(bodyText) {
  const facts = {
    acquireLocalLock: false,
    releaseLocalLock: false,
    getMetaActionStateId: false,
    trackActionState: false,
    trackActionStateWithObject: false,
    preflight: false,
    hasObjectLiteralArg: true,
    asyncOnMutateWithoutSnapshotVariables: false,
  };

  facts.acquireLocalLock = bodyText.includes('acquireLocalLock')
    || bodyText.includes('acquireMutationContext')
    || bodyText.includes('lifetimeMutationGuard.acquire');
  facts.releaseLocalLock = bodyText.includes('releaseLocalLock')
    || bodyText.includes('settleLocalLock')
    || bodyText.includes('lifetimeMutationGuard.settle');
  facts.getMetaActionStateId = bodyText.includes('getMetaActionStateId');
  const customGuardTracksObject = bodyText.includes('lifetimeMutationGuard.track');
  facts.trackActionState = bodyText.includes('trackActionState') || customGuardTracksObject;

  if (facts.trackActionState) {
    // Heuristic: a trackActionState call with an object in the metadata.
    facts.trackActionStateWithObject = customGuardTracksObject
      || /trackActionState\s*\([\s\S]{0,500}\{\s*[\s\S]{0,500}\bobject\s*:/.test(bodyText);
  }

  facts.preflight = /\bpreflight[A-Za-z0-9_]*\s*\(/.test(bodyText);
  const explicitAsyncOnMutate = /\bonMutate\s*:\s*async\s*(?:function\s*)?\(/.test(bodyText);
  const zeroArgAsyncOnMutate = /\bonMutate\s*:\s*async\s*(?:function\s*)?\(\s*\)/.test(bodyText);
  const zeroArgMutationFn = /\bmutationFn\s*:\s*(?:async\s*)?(?:function\s*)?\(\s*\)/.test(bodyText);
  facts.asyncOnMutateWithoutSnapshotVariables =
    explicitAsyncOnMutate && (zeroArgAsyncOnMutate || zeroArgMutationFn);

  return facts;
}

async function analyzeFileRegex(filePath) {
  const sourceText = await fs.readFile(filePath, 'utf8');
  const lineStarts = computeLineStarts(sourceText);

  const entries = [];
  const re = /\buseMutation\b/g;
  let m;
  while ((m = re.exec(sourceText)) !== null) {
    const idx = m.index;

    // Try to infer the variable name by examining the prefix on the same statement.
    const prefixStart = Math.max(0, idx - 300);
    const prefix = sourceText.slice(prefixStart, idx);
    const name = inferNameFromPrefix(prefix.replace(/[\r\n]/g, ' '));

    const ignore = parseIgnoreDirectivesRegex(sourceText, idx);

    const obj = extractMutationObjectLiteral(sourceText, idx);
    const loc = lineColOfIndex(lineStarts, idx);

    if (!obj) {
      const entry = {
        file: filePath,
        line: loc.line,
        col: loc.col,
        name,
        ignore: { ignoreAll: ignore.ignoreAll, tags: [...ignore.tags] },
        facts: { hasObjectLiteralArg: false },
      };
      entry.warnings = buildWarnings(entry);
      entries.push(entry);
      continue;
    }

    const facts = scanFactsRegex(obj.body);
    const entry = {
      file: filePath,
      line: loc.line,
      col: loc.col,
      name,
      ignore: { ignoreAll: ignore.ignoreAll, tags: [...ignore.tags] },
      facts,
    };
    entry.warnings = buildWarnings(entry);
    entries.push(entry);
  }

  return entries;
}

/** ===========================
 *  Formatting
 *  =========================== */

function formatMarkdownReport(opts, entries, startedAtIso) {
  const warnings = entries.flatMap((e) => (e.warnings || []).map((w) => ({ ...w, entry: e })));

  const byCode = new Map();
  for (const w of warnings) {
    const arr = byCode.get(w.code) || [];
    arr.push(w);
    byCode.set(w.code, arr);
  }

  const lines = [];
  lines.push('# Mutation surface audit report');
  lines.push('');
  lines.push(`Generated: ${startedAtIso}`);
  lines.push('');
  lines.push(`Scanned root: \`${opts.root}\``);
  lines.push('');
  lines.push(`Parser: \`${opts.parser}\``);
  lines.push('');
  lines.push(`Found \`${entries.length}\` useMutation(...) calls.`);
  lines.push('');

  if (warnings.length === 0) {
    lines.push('✅ No warnings found.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`⚠️ Warnings: \`${warnings.length}\``);
  lines.push('');

  const codes = [...byCode.keys()].sort();
  for (const code of codes) {
    const arr = byCode.get(code) || [];
    lines.push(`## ${code} (${arr.length})`);
    lines.push('');
    for (const w of arr) {
      const e = w.entry;
      lines.push(`- \`${toPosix(path.relative(process.cwd(), e.file))}:${e.line}\` – **${e.name}** – ${w.message}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- This audit is heuristic. Some warnings may be acceptable.');
  lines.push('- Use ignore directives on the mutation statement to silence known/intentional exceptions:');
  lines.push('  - `// audit:ignore`');
  lines.push('  - `// audit:ignore missing-local-lock`');
  lines.push('');
  lines.push('See: `docs/spec/MUTATION_SURFACE_AUDIT.md`');
  lines.push('');

  return lines.join('\n');
}

/** ===========================
 *  Main
 *  =========================== */

async function analyzeFile(filePath) {
  if (ts) return analyzeFileTs(filePath);
  return analyzeFileRegex(filePath);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const startedAtIso = new Date().toISOString();

  const rootDir = path.resolve(process.cwd(), opts.root);
  const files = await listSourceFiles(rootDir);

  const all = [];
  for (const f of files) {
    const muts = await analyzeFile(f);
    all.push(...muts);
  }

  const warnCount = all.reduce((acc, e) => acc + (e.warnings?.length || 0), 0);

  if (opts.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ startedAt: startedAtIso, root: opts.root, parser: opts.parser, mutations: all }, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.log(formatMarkdownReport(opts, all, startedAtIso));
  }

  if (opts.write) {
    const outPath = path.resolve(process.cwd(), opts.write);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, formatMarkdownReport(opts, all, startedAtIso), 'utf8');
  }

  if (opts.failOnWarn && warnCount > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(2);
});
