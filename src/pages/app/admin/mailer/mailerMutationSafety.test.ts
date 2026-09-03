import { describe, expect, it } from 'vitest';

import { mailTemplateEditFingerprint, strictPositiveIntegerId } from './mailerMutationSafety';

describe('strictPositiveIntegerId', () => {
  it.each([
    [1, 1],
    ['42', 42],
    [' 7 ', 7],
  ])('accepts a positive integer resource id %#', (value, expected) => {
    expect(strictPositiveIntegerId(value)).toBe(expected);
  });

  it.each([undefined, null, true, false, '', ' ', 0, -1, 1.5, '1.5', Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects malformed resource id %s',
    (value) => {
      expect(strictPositiveIntegerId(value)).toBeNull();
    },
  );
});

describe('mailTemplateEditFingerprint', () => {
  it('changes when mutable data or the server version changes', () => {
    const original = { updated_at: '2026-09-03T10:00:00Z', label: 'Welcome', user_visibility: 'visible' };
    expect(mailTemplateEditFingerprint({ ...original })).toBe(mailTemplateEditFingerprint(original));
    expect(mailTemplateEditFingerprint({ ...original, label: 'New label' })).not.toBe(mailTemplateEditFingerprint(original));
    expect(mailTemplateEditFingerprint({ ...original, updated_at: '2026-09-03T10:01:00Z' })).not.toBe(mailTemplateEditFingerprint(original));
  });
});
