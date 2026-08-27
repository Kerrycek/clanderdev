import { describe, expect, it } from 'vitest';

import type { NetworkInterfaceMonitorRow } from '../../../../lib/api/networking';
import {
  monitorDataIsStale,
  oldestMonitorTimestamp,
  perSecond,
  staleMonitorCount,
  topTalkers,
  trafficTotals,
} from './networkLiveModel';

const rows: NetworkInterfaceMonitorRow[] = [
  {
    id: 1,
    bytes_in: 1_000,
    bytes_out: 500,
    packets_in: 100,
    packets_out: 50,
    delta: 10,
    updated_at: '2026-08-27T10:00:00.000Z',
    network_interface: {
      id: 11,
      name: 'eth0',
      vps: { id: 21, hostname: 'alpha', user: { id: 31, login: 'alice' } },
    },
  },
  {
    id: 2,
    bytes_in: 3_000,
    bytes_out: 1_000,
    packets_in: 300,
    packets_out: 100,
    delta: 10,
    updated_at: '2026-08-27T10:00:05.000Z',
    network_interface: {
      id: 12,
      name: 'eth1',
      vps: { id: 21, hostname: 'alpha', user: { id: 31, login: 'alice' } },
    },
  },
  {
    id: 3,
    bytes_in: 2_000,
    bytes_out: 4_000,
    delta: 10,
    network_interface: {
      id: 13,
      name: 'eth0',
      vps: { id: 22, hostname: 'beta', user: { id: 32, login: 'bob' } },
    },
  },
];

describe('admin live network model', () => {
  it('normalizes counters to rates and aggregates the current sample', () => {
    expect(perSecond(1_024, 2)).toBe(512);
    expect(trafficTotals(rows)).toEqual({
      bytesIn: 600,
      bytesOut: 550,
      packetsIn: 40,
      packetsOut: 15,
    });
  });

  it('aggregates top talkers without additional API requests', () => {
    expect(topTalkers(rows, 'vps')).toEqual([
      { id: 22, label: 'beta', bytesIn: 200, bytesOut: 400, total: 600 },
      { id: 21, label: 'alpha', bytesIn: 400, bytesOut: 150, total: 550 },
    ]);
    expect(topTalkers(rows, 'user', 1)).toEqual([
      { id: 32, label: 'bob', bytesIn: 200, bytesOut: 400, total: 600 },
    ]);
  });

  it('uses the oldest API timestamp and counts stale or unknown rows conservatively', () => {
    const oldest = oldestMonitorTimestamp(rows);
    expect(oldest).toBe(Date.parse('2026-08-27T10:00:00.000Z'));
    expect(monitorDataIsStale(oldest, Date.parse('2026-08-27T10:00:25.000Z'))).toBe(false);
    expect(monitorDataIsStale(oldest, Date.parse('2026-08-27T10:00:31.000Z'))).toBe(true);
    expect(staleMonitorCount(rows, Date.parse('2026-08-27T10:00:25.000Z'))).toBe(1);
    expect(staleMonitorCount(rows, Date.parse('2026-08-27T10:00:36.000Z'))).toBe(3);
    expect(monitorDataIsStale(null)).toBe(true);
  });
});
