import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getCspDirectiveTokens, validateScriptSource } from './csp-policy.mjs';

const hash = 'sha256-example=';

describe('CSP policy validation', () => {
  it('reads directives from a complete nginx header', () => {
    const source = `add_header Content-Security-Policy "default-src 'self'; script-src 'self' '${hash}'; object-src 'none'" always;`;

    assert.deepEqual(getCspDirectiveTokens(source, 'script-src'), [
      "'self'",
      `'${hash}'`,
    ]);
    assert.deepEqual(validateScriptSource(source, hash), []);
  });

  it('rejects unsafe-inline regardless of token order', () => {
    const beforeHash = `script-src 'self' 'unsafe-inline' '${hash}'`;
    const afterHash = `script-src 'self' '${hash}' https: 'unsafe-inline'`;

    assert.deepEqual(validateScriptSource(beforeHash, hash), [
      'script-src allows unsafe inline scripts',
    ]);
    assert.deepEqual(validateScriptSource(afterHash, hash), [
      'script-src allows unsafe inline scripts',
    ]);
  });

  it('does not confuse style-src unsafe-inline with script-src', () => {
    const source = `script-src 'self' '${hash}'; style-src 'self' 'unsafe-inline'`;

    assert.deepEqual(validateScriptSource(source, hash), []);
  });

  it('reports missing script requirements', () => {
    assert.deepEqual(validateScriptSource("script-src https:", hash), [
      "script-src does not allow 'self'",
      'script-src does not include the current inline-script hash',
    ]);
    assert.deepEqual(validateScriptSource("default-src 'self'", hash), [
      'has no script-src directive',
    ]);
  });
});
