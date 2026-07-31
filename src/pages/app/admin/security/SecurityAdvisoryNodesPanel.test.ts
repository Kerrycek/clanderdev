import { describe, expect, it } from 'vitest';

import {
  buildSecurityAdvisoryNodeStatusPayload,
  remainingSecurityAdvisoryBulkNodeIds,
  securityAdvisoryNodeStatusNodeId,
  type SecurityAdvisoryNodeFormValues,
} from './SecurityAdvisoryNodesPanel';

function values(overrides: Partial<SecurityAdvisoryNodeFormValues> = {}): SecurityAdvisoryNodeFormValues {
  return {
    state: 'unknown',
    vulnerableUntil: '',
    mitigatedSince: '',
    note: '',
    ...overrides,
  };
}

describe('security advisory node status panel helpers', () => {
  it('clears both timestamps for not affected nodes', () => {
    expect(
      buildSecurityAdvisoryNodeStatusPayload(
        42,
        values({
          state: 'not_affected',
          vulnerableUntil: '2026-07-01T10:00',
          mitigatedSince: '2026-07-02T10:00',
          note: '  unaffected kernel  ',
        }),
      ),
    ).toEqual({
      valid: true,
      payload: {
        node: 42,
        state: 'not_affected',
        vulnerable_until: null,
        mitigated_since: null,
        note: 'unaffected kernel',
      },
    });
  });

  it('requires both timestamps for mitigated nodes', () => {
    expect(
      buildSecurityAdvisoryNodeStatusPayload(
        42,
        values({ state: 'mitigated', mitigatedSince: '2026-07-02T10:00' }),
      ),
    ).toEqual({ valid: false, reason: 'vulnerable_until_required' });

    expect(
      buildSecurityAdvisoryNodeStatusPayload(
        42,
        values({ state: 'mitigated', vulnerableUntil: '2026-07-01T10:00' }),
      ),
    ).toEqual({ valid: false, reason: 'mitigated_since_required' });

    const parsed = buildSecurityAdvisoryNodeStatusPayload(
      42,
      values({
        state: 'mitigated',
        vulnerableUntil: '2026-07-01T10:00',
        mitigatedSince: '2026-07-02T10:00',
      }),
    );
    expect(parsed.valid).toBe(true);
    if (parsed.valid) {
      expect(parsed.payload.vulnerable_until).toMatch(/^2026-07-01T/);
      expect(parsed.payload.mitigated_since).toMatch(/^2026-07-02T/);
    }
  });

  it('never repeats completed nodes after a partial bulk failure', () => {
    const completed = new Set([2, 4]);
    expect(remainingSecurityAdvisoryBulkNodeIds([1, 2, 3, 4, 5], completed)).toEqual([1, 3, 5]);
  });

  it('resolves node ids from both flattened and included references', () => {
    expect(securityAdvisoryNodeStatusNodeId({ id: 1, node_id: 9 })).toBe(9);
    expect(securityAdvisoryNodeStatusNodeId({ id: 1, node: 10 })).toBe(10);
    expect(securityAdvisoryNodeStatusNodeId({ id: 1, node: { id: 11, name: 'node11' } })).toBe(11);
    expect(securityAdvisoryNodeStatusNodeId({ id: 1 })).toBeNull();
  });
});
