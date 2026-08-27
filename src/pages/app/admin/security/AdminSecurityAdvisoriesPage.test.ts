import { describe, expect, it } from 'vitest';

import { securityAdvisoryPageCount } from './AdminSecurityAdvisoriesPage';

describe('securityAdvisoryPageCount', () => {
  it('returns the exact number of client-side pages', () => {
    expect(securityAdvisoryPageCount(101, 25)).toBe(5);
  });

  it('keeps one page for an empty result', () => {
    expect(securityAdvisoryPageCount(0, 25)).toBe(1);
  });

  it('guards against an invalid limit', () => {
    expect(securityAdvisoryPageCount(3, 0)).toBe(3);
  });
});
