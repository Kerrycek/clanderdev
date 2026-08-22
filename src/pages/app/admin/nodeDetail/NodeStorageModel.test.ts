import { describe, expect, test } from 'vitest';

import {
  extractNodePoolDevices,
  nodeAggregatePool,
  nodePoolCapacity,
  nodePoolRoleValue,
  nodePoolScanValue,
  nodePoolStateValue,
  nodePoolTitle,
  parseNodeDetailSection,
  summarizeNodePools,
} from './NodeStorageModel';

describe('NodeStorageModel', () => {
  test('parses known sections and falls back to overview', () => {
    expect(parseNodeDetailSection('storage')).toBe('storage');
    expect(parseNodeDetailSection('maintenance')).toBe('maintenance');
    expect(parseNodeDetailSection('other')).toBe('overview');
    expect(parseNodeDetailSection(null)).toBe('overview');
  });

  test('derives used space only when total and available are present', () => {
    expect(nodePoolCapacity({ id: 1, total_space: 1_000, available_space: 250 })).toEqual({
      total: 1_000,
      used: 750,
      available: 250,
    });
    expect(nodePoolCapacity({ id: 2, available_space: 250 })).toEqual({
      total: undefined,
      used: undefined,
      available: 250,
    });
  });

  test('summarizes only capacity values returned by the API', () => {
    expect(
      summarizeNodePools([
        { id: 1, total_space: 1_000, used_space: 600, available_space: 400 },
        { id: 2, total_space: 500, used_space: 100, available_space: 400 },
        { id: 3, state: 'online' },
      ])
    ).toEqual({ total: 1_500, used: 700, available: 800, measuredPools: 2 });
  });

  test('resolves both HaveAPI strings and legacy numeric pool enums', () => {
    expect(nodePoolRoleValue('primary')).toBe('primary');
    expect(nodePoolRoleValue(2)).toBe('backup');
    expect(nodePoolRoleValue('0')).toBe('hypervisor');

    expect(nodePoolStateValue('DEGRADED')).toBe('degraded');
    expect(nodePoolStateValue(1)).toBe('online');
    expect(nodePoolStateValue(99)).toBe('unknown');

    expect(nodePoolScanValue('resilver')).toBe('resilver');
    expect(nodePoolScanValue(2)).toBe('scrub');
    expect(nodePoolScanValue('internal_value')).toBe('unknown');
  });

  test('extracts and de-duplicates disks from optional API extension shapes', () => {
    expect(
      extractNodePoolDevices({
        id: 1,
        devices: [{ path: '/dev/nvme0n1', state: 'online', size: 1024 }],
        vdevs: [{ name: 'mirror-0', children: [{ path: '/dev/nvme0n1', state: 'online', size: 1024 }, '/dev/nvme1n1'] }],
      })
    ).toEqual([
      { key: 'devices.0:/dev/nvme0n1', name: '/dev/nvme0n1', state: 'online' },
      { key: 'vdevs.0:mirror-0', name: 'mirror-0', state: undefined },
      { key: 'vdevs.0.children.1:/dev/nvme1n1', name: '/dev/nvme1n1' },
    ]);
  });

  test('uses stable fallbacks for pool and aggregate titles', () => {
    expect(nodePoolTitle({ id: 4, filesystem: 'tank/vps' })).toBe('tank/vps');
    expect(nodePoolTitle({ id: 5 })).toBe('#5');
    expect(nodeAggregatePool({ id: 9, domain_name: 'node9.example', pool_state: 'online' })).toMatchObject({
      id: 9,
      label: 'node9.example',
      state: 'online',
    });
  });
});
