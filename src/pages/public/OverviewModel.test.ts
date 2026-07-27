import { describe, expect, test } from 'vitest';

import {
  categorizePublicOutages,
  groupPublicNodesByLocation,
  publicIpv4BadgeVariant,
  publicIpv4Level,
  resolvePublicIpv4Left,
  summarizePublicNodes,
} from './OverviewModel';

describe('OverviewModel', () => {
  test('groups public nodes by location and summarizes health', () => {
    const groups = groupPublicNodesByLocation(
      [
        { name: 'n1', status: true, location: { label: 'Praha' } },
        { name: 'n2', status: false, location: { label: 'Praha' } },
        { name: 'n4', status: true, location: { label: 'Brno' } },
        { name: 'n3', status: true },
      ],
      'Unknown'
    );

    expect(groups.map((group) => [group.location, group.ok, group.down, group.total])).toEqual([
      ['Praha', 1, 1, 2],
      ['Brno', 1, 0, 1],
      ['Unknown', 1, 0, 1],
    ]);
    expect(summarizePublicNodes(groups)).toEqual({ ok: 3, down: 1, total: 4 });
  });

  test('uses the same canonical location order as the authenticated dashboard', () => {
    const groups = groupPublicNodesByLocation(
      [
        { name: 'brq1', status: true, location: { label: 'Brno' } },
        { name: 'brq2', status: true, location: { label: 'Brno' } },
        { name: 'brq3', status: true, location: { label: 'Brno' } },
        { name: 'pg1', status: true, location: { label: 'Playground' } },
        { name: 'prg1', status: true, location: { label: 'Praha' } },
      ],
      'Unknown',
    );

    expect(groups.map((group) => group.location)).toEqual(['Praha', 'Brno', 'Playground']);
  });

  test('categorizes outages newest first', () => {
    const groups = categorizePublicOutages(
      [
        { id: 1, begins_at: '2026-01-01T00:00:00Z', state: 'resolved', finished_at: '2026-01-01T01:00:00Z' },
        { id: 2, begins_at: '2026-01-02T00:00:00Z' },
        { id: 3, begins_at: '2026-01-10T00:00:00Z' },
      ],
      new Date('2026-01-05T00:00:00Z')
    );

    expect(groups.current.map((outage) => outage.id)).toEqual([2]);
    expect(groups.planned.map((outage) => outage.id)).toEqual([3]);
    expect(groups.resolved.map((outage) => outage.id)).toEqual([1]);
  });

  test('resolves IPv4 pool severity', () => {
    const left = resolvePublicIpv4Left({ user_count: 1, vps_count: 2, ipv4_left: 10 });
    const level = publicIpv4Level(left, 64, 16);

    expect(left).toBe(10);
    expect(level).toBe('critical');
    expect(publicIpv4BadgeVariant(level, left)).toBe('danger');
  });
});
