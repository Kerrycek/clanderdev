import { describe, expect, it } from 'vitest';

import { sanitizePaymentInstructionsHtml } from '../pages/app/payments/PaymentsModel';
import { sanitizeNewsHtml } from './sanitizeHtml';

const XSS_CORPUS = [
  {
    name: 'script elements',
    html: '<p>safe<script>alert(1)</script></p>',
  },
  {
    name: 'event handlers',
    html: '<p onclick="alert(2)">safe</p><img src="/qr.png" onerror="alert(3)">',
  },
  {
    name: 'javascript URLs',
    html: '<a href="javascript:alert(4)" target="_blank">unsafe</a>',
  },
  {
    name: 'data URLs',
    html: '<a href="data:text/html,unsafe">unsafe</a><img src="data:image/svg+xml,unsafe">',
  },
  {
    name: 'protocol-relative URLs',
    html: '<a href="//attacker.example/link">unsafe</a><img src="//attacker.example/pixel">',
  },
  {
    name: 'backslash protocol-relative URLs',
    html: '<a href="/\\attacker.example/link">unsafe</a><img src="/\\attacker.example/pixel">',
  },
  {
    name: 'SVG payloads',
    html: '<svg onload="alert(5)"><a xlink:href="javascript:alert(6)">unsafe</a><script>alert(7)</script></svg>',
  },
  {
    name: 'broken markup',
    html: '<div><p title="safe">text<svg><script>alert(8)</script><a href="javascript:alert(9)">link',
  },
] as const;

const SANITIZERS = [
  { name: 'news', sanitize: sanitizeNewsHtml },
  { name: 'payment instructions', sanitize: sanitizePaymentInstructionsHtml },
] as const;

function expectSafeHtml(html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html;

  expect(template.content.querySelector('script, style, iframe, object, template, svg')).toBeNull();
  expect(html).not.toMatch(/(?:javascript|data):/i);
  expect(html).not.toContain('attacker.example');

  for (const element of Array.from(template.content.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      expect(attribute.name).not.toMatch(/^on/i);
      expect(attribute.name).not.toBe('style');
      expect(attribute.name).not.toBe('srcdoc');
      expect(attribute.name).not.toBe('xlink:href');
    }
  }
}

describe.each(SANITIZERS)('$name shared XSS corpus', ({ sanitize }) => {
  it.each(XSS_CORPUS)('neutralizes $name', ({ html }) => {
    expectSafeHtml(sanitize(html));
  });
});
