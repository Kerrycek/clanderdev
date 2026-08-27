import { describe, expect, it } from 'vitest';

import { canManageSecurityAdvisories } from './SecurityAdvisoryAdminGate';

describe('canManageSecurityAdvisories', () => {
  it('permits administrators and denies support and regular accounts', () => {
    expect(canManageSecurityAdvisories('admin')).toBe(true);
    expect(canManageSecurityAdvisories('support')).toBe(false);
    expect(canManageSecurityAdvisories('user')).toBe(false);
    expect(canManageSecurityAdvisories('unknown')).toBe(false);
  });
});
