import { describe, expect, it } from 'vitest';

import {
  canEditSecurityAdvisory,
  canPostSecurityAdvisoryUpdate,
  parseSecurityAdvisoryCves,
  relevantSecurityAdvisoryNodes,
  resourceId,
  resourceLabel,
  securityAdvisoryPublishIssues,
  securityAdvisoryUpdateStateChange,
} from './securityAdvisoryAdminModel';

describe('security advisory admin model', () => {
  it('enforces the draft, published and retracted lifecycle', () => {
    expect(canEditSecurityAdvisory('draft')).toBe(true);
    expect(canEditSecurityAdvisory('published')).toBe(false);
    expect(canEditSecurityAdvisory('retracted')).toBe(false);

    expect(canPostSecurityAdvisoryUpdate('draft')).toBe(false);
    expect(canPostSecurityAdvisoryUpdate('published')).toBe(true);
    expect(canPostSecurityAdvisoryUpdate('retracted')).toBe(false);

    expect(securityAdvisoryUpdateStateChange('published', '')).toBeNull();
    expect(securityAdvisoryUpdateStateChange('published', 'retracted')).toBe('retracted');
    expect(securityAdvisoryUpdateStateChange('draft', 'retracted')).toBeNull();
    expect(securityAdvisoryUpdateStateChange('retracted', 'published')).toBeNull();
  });

  it('normalizes, validates and de-duplicates CVE identifiers', () => {
    expect(parseSecurityAdvisoryCves(' cve-2026-1234, CVE-2026-1234;CVE-2025-99999 ')).toEqual({
      valid: true,
      cves: ['CVE-2026-1234', 'CVE-2025-99999'],
    });
    expect(parseSecurityAdvisoryCves('')).toMatchObject({ valid: false, reason: 'empty' });
    expect(parseSecurityAdvisoryCves('CVE-nope')).toMatchObject({
      valid: false,
      reason: 'invalid',
      invalid: 'CVE-NOPE',
    });
  });

  it('keeps active compute and storage nodes in a stable order', () => {
    expect(
      relevantSecurityAdvisoryNodes([
        { id: 8, type: 'storage', active: true },
        { id: 3, type: 'node', active: true },
        { id: 2, type: 'other', active: true },
        { id: 1, type: 'node', active: false },
      ]).map((node) => node.id),
    ).toEqual([3, 8]);
  });

  it('blocks publishing until every relevant node is resolved', () => {
    const nodes = [
      { id: 1, type: 'node', active: true, domain_name: 'node1.prg' },
      { id: 2, type: 'storage', active: true, domain_name: 'storage1.prg' },
      { id: 3, type: 'node', active: true, domain_name: 'node2.prg' },
    ];

    expect(
      securityAdvisoryPublishIssues({
        cves: [],
        nodes,
        statuses: [
          { node_id: 1, state: 'vulnerable' },
          { node_id: 2, state: 'mitigated', vulnerable_until: null, mitigated_since: null },
        ],
      }),
    ).toEqual([
      { type: 'missing_cves' },
      { type: 'unresolved_node', nodeId: 1, nodeName: 'node1.prg', state: 'vulnerable' },
      { type: 'missing_mitigation_times', nodeId: 2, nodeName: 'storage1.prg' },
      { type: 'missing_node_status', nodeId: 3, nodeName: 'node2.prg' },
    ]);

    expect(
      securityAdvisoryPublishIssues({
        cves: ['CVE-2026-1234'],
        nodes,
        statuses: [
          { node_id: 1, state: 'not_affected' },
          {
            node_id: 2,
            state: 'mitigated',
            vulnerable_until: '2026-07-01T10:00:00Z',
            mitigated_since: '2026-07-01T10:00:00Z',
          },
          { node_id: 3, state: 'not_affected' },
        ],
      }),
    ).toEqual([]);
  });

  it('reads HaveAPI resource references defensively', () => {
    expect(resourceId({ id: 42 })).toBe(42);
    expect(resourceId(undefined, 7)).toBe(7);
    expect(resourceLabel({ id: 42, hostname: 'web-1' })).toBe('web-1');
    expect(resourceLabel({ id: 42 })).toBe('#42');
  });
});
