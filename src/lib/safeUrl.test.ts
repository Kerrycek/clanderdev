import { describe, expect, it } from 'vitest';

import { safeAbsoluteHttpUrl, safeContentUrl } from './safeUrl';

describe('safeContentUrl', () => {
  it('allows local navigation and explicit safe protocols', () => {
    expect(safeContentUrl('/app/vps/42')).toBe('/app/vps/42');
    expect(safeContentUrl('?page=security')).toBe('?page=security');
    expect(safeContentUrl('#details')).toBe('#details');
    expect(safeContentUrl('https://status.vpsf.cz')).toBe('https://status.vpsf.cz');
    expect(safeContentUrl('mailto:support@vpsfree.cz', { allowMailto: true })).toBe(
      'mailto:support@vpsfree.cz',
    );
  });

  it('rejects executable and protocol-relative URLs', () => {
    expect(safeContentUrl('//attacker.example/pixel')).toBeNull();
    expect(safeContentUrl('/\\attacker.example/pixel')).toBeNull();
    expect(safeContentUrl('/\t/attacker.example/pixel')).toBeNull();
    expect(safeContentUrl('/\n/attacker.example/pixel')).toBeNull();
    expect(safeContentUrl('https:\\attacker.example/pixel')).toBeNull();
    expect(safeContentUrl('javascript:alert(1)')).toBeNull();
    expect(safeContentUrl('data:text/html,payload')).toBeNull();
    expect(safeContentUrl('mailto:support@vpsfree.cz')).toBeNull();
  });
});

describe('safeAbsoluteHttpUrl', () => {
  it('only returns absolute HTTP(S) URLs', () => {
    expect(safeAbsoluteHttpUrl('https://console.example.test')).toBe(
      'https://console.example.test',
    );
    expect(safeAbsoluteHttpUrl('/relative')).toBeNull();
    expect(safeAbsoluteHttpUrl('https:\\attacker.example/pixel')).toBeNull();
    expect(safeAbsoluteHttpUrl('https://example.test/\u0000pixel')).toBeNull();
    expect(safeAbsoluteHttpUrl('javascript:alert(1)')).toBeNull();
  });
});
