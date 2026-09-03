import { describe, expect, it } from 'vitest';

import { legacyIpAddressesUrl } from './ipAddresses/legacyIpAddressesUrl';

describe('legacyIpAddressesUrl', () => {
  it('uses the configured legacy networking query and omits an unavailable fallback', () => {
    expect(legacyIpAddressesUrl('https://legacy.example/')).toBe('https://legacy.example/?page=networking&action=ip_addresses');
    expect(legacyIpAddressesUrl(undefined)).toBeUndefined();
  });
});
