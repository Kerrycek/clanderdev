import { describe, expect, it } from 'vitest';

import { sanitizeNewsHtml } from './sanitizeHtml';

describe('sanitizeNewsHtml', () => {
  it('keeps safe news links and adds rel protection', () => {
    const html = sanitizeNewsHtml(
      'Introducing <a href="https://status.vpsf.cz" target="_blank">status</a> and <a href="?page=security_advisory&action=list">advisories</a>.'
    );

    expect(html).toContain('<a href="https://status.vpsf.cz" rel="noopener noreferrer" target="_blank">status</a>');
    expect(html).toContain('<a href="?page=security_advisory&amp;action=list" rel="noopener noreferrer">advisories</a>');
  });

  it('removes scripts, event handlers and javascript links', () => {
    const html = sanitizeNewsHtml(
      '<script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(2)">bad</a><strong onmouseover="x">ok</strong>'
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('onmouseover');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<a>bad</a>');
    expect(html).toContain('<strong>ok</strong>');
  });

  it('rejects protocol-relative links', () => {
    const html = sanitizeNewsHtml('<a href="//attacker.example/track">bad</a>');

    expect(html).toBe('<a>bad</a>');
  });
});
