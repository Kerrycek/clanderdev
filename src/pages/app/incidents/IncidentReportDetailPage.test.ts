import { describe, expect, it } from 'vitest';

import { incidentFiledByPath } from './IncidentReportDetailPage';

describe('incidentFiledByPath', () => {
  it('links filed-by users only in admin mode', () => {
    expect(incidentFiledByPath('admin', '/admin', 8)).toBe('/admin/users/8');
    expect(incidentFiledByPath('user', '/app', 8)).toBeUndefined();
  });
});
