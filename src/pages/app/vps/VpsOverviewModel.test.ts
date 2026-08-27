import { describe, expect, it } from 'vitest';

import type { TransactionChain } from '../../../lib/api/transactions';

import {
  isRemoteConsoleAvailable,
  overviewHealthKey,
  overviewHealthState,
  overviewUsageMetric,
  ipAddressDisplayLabel,
  classifyIpAddress,
  primarySshIpAddress,
  resourceLabel,
  selectOverviewIpAddresses,
  shouldShowVpsOwner,
  sortChainsForOverview,
} from './VpsOverviewModel';

describe('VpsOverviewModel', () => {
  describe('shouldShowVpsOwner', () => {
    it('hides the owner row for the current owner in user mode', () => {
      expect(shouldShowVpsOwner({ mode: 'user', ownerId: 10, currentUserId: 10 })).toBe(false);
    });

    it('keeps user mode quiet when the current user is not known yet', () => {
      expect(shouldShowVpsOwner({ mode: 'user', ownerId: 10 })).toBe(false);
    });

    it('can still show a non-self owner in user mode when that context is explicit', () => {
      expect(shouldShowVpsOwner({ mode: 'user', ownerId: 11, currentUserId: 10 })).toBe(true);
    });

    it('always shows owner context in admin mode', () => {
      expect(shouldShowVpsOwner({ mode: 'admin', ownerId: 10, currentUserId: 10 })).toBe(true);
      expect(shouldShowVpsOwner({ mode: 'admin' })).toBe(true);
    });
  });

  it('prefers operational labels commonly returned by admin includes', () => {
    expect(resourceLabel({ id: 1, domain_name: 'node1.example' })).toBe('node1.example');
    expect(resourceLabel({ id: 2, full_name: 'tank/vps/123/root' })).toBe('tank/vps/123/root');
    expect(resourceLabel({ id: 3, login: 'alice' })).toBe('alice');
  });

  describe('ipAddressDisplayLabel', () => {
    it('formats an address with its prefix', () => {
      expect(ipAddressDisplayLabel({ id: 1, addr: '198.51.100.10', prefix: 32 })).toBe('198.51.100.10/32');
      expect(ipAddressDisplayLabel({ id: 2, addr: '2001:db8::10', prefix: 64 })).toBe('2001:db8::10/64');
    });

    it('does not duplicate a prefix and falls back to the resource id', () => {
      expect(ipAddressDisplayLabel({ id: 3, addr: '198.51.100.10/32', prefix: 32 })).toBe('198.51.100.10/32');
      expect(ipAddressDisplayLabel({ id: 4, addr: '198.51.100.11' })).toBe('198.51.100.11');
      expect(ipAddressDisplayLabel({ id: 42, addr: '  ' })).toBe('#42');
    });
  });

  describe('classifyIpAddress', () => {
    it('classifies public IPv4, private IPv4, and IPv6 from API metadata', () => {
      expect(classifyIpAddress({ id: 1, addr: '198.51.100.10', network: { id: 1, ip_version: 4, role: 'public_access' } })).toBe(
        'ipv4_public'
      );
      expect(classifyIpAddress({ id: 2, addr: '10.0.0.10', network: { id: 2, ip_version: 4, role: 'private_access' } })).toBe(
        'ipv4_private'
      );
      expect(classifyIpAddress({ id: 3, addr: '2001:db8::10', network: { id: 3, ip_version: 6, role: 'public_access' } })).toBe(
        'ipv6'
      );
    });

    it('uses the address as an IPv6 fallback when version metadata is missing', () => {
      expect(classifyIpAddress({ id: 4, addr: '2001:db8::20' })).toBe('ipv6');
    });
  });

  describe('selectOverviewIpAddresses', () => {
    it('shows one representative of each address family before filling remaining slots', () => {
      const addresses = [
        { id: 1, addr: '10.0.0.10', network: { id: 1, ip_version: 4, role: 'private_access' } },
        { id: 2, addr: '10.0.0.11', network: { id: 1, ip_version: 4, role: 'private_access' } },
        { id: 3, addr: '2001:db8::10', network: { id: 2, ip_version: 6, role: 'public_access' } },
        { id: 4, addr: '198.51.100.10', network: { id: 3, ip_version: 4, role: 'public_access' } },
      ];

      expect(selectOverviewIpAddresses(addresses, 3).map((ip) => ip.id)).toEqual([4, 1, 3]);
    });
  });

  describe('primarySshIpAddress', () => {
    it('prefers a canonical public network and removes CIDR prefixes from SSH hosts', () => {
      expect(primarySshIpAddress([
        { id: 1, addr: '172.16.9.142/32', network: { id: 1, role: 'private_access' } },
        { id: 2, addr: '37.205.10.61/32', network: { id: 2, role: 'public_access' } },
      ])).toBe('37.205.10.61');
    });

    it('does not mistake a private CIDR address for a public address', () => {
      expect(primarySshIpAddress([
        { id: 1, addr: '172.16.9.142/32' },
        { id: 2, addr: '198.51.100.20/32' },
      ])).toBe('198.51.100.20');
    });
  });

  it('sorts recent activity by recency instead of promoting stale failures', () => {
    const chains: TransactionChain[] = [
      { id: 10, state: 'failed' },
      { id: 12, state: 'done' },
      { id: 11, state: 'running' },
    ];
    expect(sortChainsForOverview(chains).map((chain) => chain.id)).toEqual([12, 11, 10]);
  });

  describe('overviewUsageMetric', () => {
    it('returns normalized values and percentage for known usage', () => {
      expect(overviewUsageMetric('25', 100)).toEqual({
        state: 'known',
        used: 25,
        max: 100,
        percent: 25,
      });
      expect(overviewUsageMetric(125, 100)).toEqual({
        state: 'known',
        used: 125,
        max: 100,
        percent: 125,
      });
    });

    it('returns an explicit unknown state for incomplete or invalid usage', () => {
      expect(overviewUsageMetric(undefined, 100)).toEqual({ state: 'unknown', used: null, max: null, percent: null });
      expect(overviewUsageMetric(10, 0)).toEqual({ state: 'unknown', used: null, max: null, percent: null });
      expect(overviewUsageMetric(-1, 100)).toEqual({ state: 'unknown', used: null, max: null, percent: null });
    });
  });

  describe('overviewHealthState', () => {
    it('prioritizes stale lock information over every other state', () => {
      expect(overviewHealthState({ running: true, busy: true, stale: true })).toBe('stale');
    });

    it('reports busy before the runtime state', () => {
      expect(overviewHealthState({ running: true, busy: true, stale: false })).toBe('busy');
      expect(overviewHealthState({ running: false, busy: true, stale: false })).toBe('busy');
    });

    it('reports known runtime states and preserves an unknown fallback', () => {
      expect(overviewHealthState({ running: true, busy: false, stale: false })).toBe('running');
      expect(overviewHealthState({ running: false, busy: false, stale: false })).toBe('stopped');
      expect(overviewHealthState({ running: null, busy: false, stale: false })).toBe('unknown');
    });
  });

  describe('overviewHealthKey', () => {
    const running = {
      running: true,
      busy: false,
      stale: false,
      networkEnabled: true,
      sshCommand: null,
      ipAddressesLoading: false,
      ipAddressesError: false,
    };

    it('does not report missing access while IP addresses are still loading', () => {
      expect(overviewHealthKey({ ...running, ipAddressesLoading: true })).toBe('access_loading');
    });

    it('reports a failed address lookup separately from a confirmed lack of access', () => {
      expect(overviewHealthKey({ ...running, ipAddressesError: true })).toBe('access_error');
      expect(overviewHealthKey(running)).toBe('running_no_access');
    });

    it('keeps runtime and network state ahead of address lookup state', () => {
      expect(overviewHealthKey({ ...running, networkEnabled: false, ipAddressesLoading: true })).toBe('network_disabled');
      expect(overviewHealthKey({ ...running, running: false, ipAddressesError: true })).toBe('stopped');
    });
  });

  describe('isRemoteConsoleAvailable', () => {
    it('requires a placed VPS and a configured remote console server', () => {
      expect(isRemoteConsoleAvailable({ id: 1, hostname: 'no-node' })).toBe(false);
      expect(isRemoteConsoleAvailable({
        id: 2,
        hostname: 'no-server',
        node: { id: 10, location: { id: 20 } },
      })).toBe(false);
      expect(isRemoteConsoleAvailable({
        id: 3,
        hostname: 'ready',
        node: { id: 10, location: { id: 20, remote_console_server: 'console.example.test' } },
      })).toBe(true);
    });
  });
});
