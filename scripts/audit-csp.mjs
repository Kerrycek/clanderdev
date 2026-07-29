import crypto from 'node:crypto';
import fs from 'node:fs';
import { validateScriptSource } from './csp-policy.mjs';

const INDEX_PATH = 'index.html';
const NGINX_PATHS = [
  'deploy/dev.crucio.cz/nginx-dev.crucio.cz.conf',
  'deploy/kra.crucio.cz/nginx-kra.crucio.cz.conf',
  'deploy/deploy-clankerdev-ubuntu24.sh',
];

function fail(message) {
  console.error(`[audit-csp] ${message}`);
  process.exitCode = 1;
}

const index = fs.readFileSync(INDEX_PATH, 'utf8');
const inlineScripts = [...index.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];

if (inlineScripts.length !== 1) {
  fail(`expected exactly one inline bootstrap script, found ${inlineScripts.length}`);
} else {
  const body = inlineScripts[0][1];
  const hash = `sha256-${crypto.createHash('sha256').update(body).digest('base64')}`;

  for (const path of NGINX_PATHS) {
    const source = fs.readFileSync(path, 'utf8');
    const policies = source
      .split('\n')
      .filter((line) => line.includes('Content-Security-Policy'));

    if (policies.length === 0) {
      fail(`${path} has no Content-Security-Policy header`);
      continue;
    }

    for (const policy of policies) {
      for (const error of validateScriptSource(policy, hash)) {
        fail(`${path} ${error}`);
      }
    }
  }

  if (!process.exitCode) {
    console.log(`[audit-csp] PASS (${hash})`);
  }
}
