import { describe, expect, it } from 'vitest';

import {
  securityAdvisoryUpdateCreatePayload,
  type SecurityAdvisoryUpdateValues,
} from './SecurityAdvisoryUpdateModal';
import { isoToLocalInput } from '../../../../lib/datetimeLocal';

describe('securityAdvisoryUpdateCreatePayload', () => {
  it('preserves the advisory publication timestamp for a regular update', () => {
    const publishedAt = '2026-07-21T08:14:35.123Z';
    const values: SecurityAdvisoryUpdateValues = {
      state: '',
      publishedAt: isoToLocalInput(publishedAt),
      originalPublishedAt: publishedAt,
      sendMail: false,
      translations: {
        en: {
          summary: 'Mitigation is in progress',
          message: 'The advisory itself remains published at the original time.',
        },
      },
    };

    expect(securityAdvisoryUpdateCreatePayload(42, values, 'published')).toEqual({
      security_advisory: 42,
      state: null,
      published_at: publishedAt,
      send_mail: false,
      en_summary: 'Mitigation is in progress',
      en_message: 'The advisory itself remains published at the original time.',
    });
  });

  it('cannot retract a draft or revive a retracted advisory through an update payload', () => {
    const values: SecurityAdvisoryUpdateValues = {
      state: 'retracted',
      publishedAt: '2026-07-21T10:14',
      sendMail: false,
      translations: { en: { summary: 'Lifecycle attempt', message: '' } },
    };

    expect(securityAdvisoryUpdateCreatePayload(42, values, 'draft').state).toBeNull();
    expect(securityAdvisoryUpdateCreatePayload(42, { ...values, state: 'published' }, 'retracted').state).toBeNull();
    expect(securityAdvisoryUpdateCreatePayload(42, values, 'published').state).toBe('retracted');
  });
});
