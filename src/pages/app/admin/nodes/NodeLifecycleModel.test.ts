import { describe, expect, it } from 'vitest';

import {
  buildNodeCreateInput,
  buildNodeUpdateInput,
  emptyNodeCreateDraft,
  hasNodeUpdateChanges,
  nodeEditDraft,
  validateIpv4,
} from './NodeLifecycleModel';
import { nodeCreateCapacityRequirements, nodeUpdateNullability } from '../../../../lib/api/nodes';

describe('NodeLifecycleModel', () => {
  it('builds a create payload compatible with the current dev API', () => {
    const deployedRequirements = nodeCreateCapacityRequirements({
      input: {
        parameters: {
          cpus: { required: true },
          total_memory: { required: true },
          total_swap: { required: true },
        },
      },
    });
    expect(
      buildNodeCreateInput({
        ...emptyNodeCreateDraft(),
        name: 'node42',
        locationId: '7',
        ipAddress: '192.0.2.42',
        cpus: '16',
        totalMemory: '32768',
        totalSwap: '4096',
        maxVps: '120',
        maxTx: '10000',
        maxRx: '10000',
      }, deployedRequirements)
    ).toEqual({
      name: 'node42',
      type: 'node',
      location: 7,
      ip_addr: '192.0.2.42',
      hypervisor_type: 'vpsadminos',
      max_tx: 10000,
      max_rx: 10000,
      max_vps: 120,
      cpus: 16,
      total_memory: 32768,
      total_swap: 4096,
      maintenance: true,
    });
  });

  it('omits unknown capacity for the current optional upstream contract', () => {
    const payload = buildNodeCreateInput({
      ...emptyNodeCreateDraft(),
      name: 'storage42',
      role: 'storage',
      locationId: '7',
      ipAddress: '192.0.2.43',
    });

    expect(payload).not.toHaveProperty('cpus');
    expect(payload).not.toHaveProperty('total_memory');
    expect(payload).not.toHaveProperty('total_swap');
  });

  it('accepts zero as an explicit maximum VPS value during creation', () => {
    expect(buildNodeCreateInput({
      ...emptyNodeCreateDraft(),
      name: 'node-zero',
      locationId: '7',
      ipAddress: '192.0.2.44',
      maxVps: '0',
    })).toMatchObject({ max_vps: 0 });
  });

  it('requires only capacity fields marked required by the deployed OPTIONS contract', () => {
    const draft = {
      ...emptyNodeCreateDraft(),
      name: 'storage42',
      role: 'storage' as const,
      locationId: '7',
      ipAddress: '192.0.2.43',
    };
    const requirements = nodeCreateCapacityRequirements({
      input: { parameters: { cpus: { required: true }, total_memory: {}, total_swap: {} } },
    });

    expect(() => buildNodeCreateInput(draft, requirements)).toThrow('cpus');
    expect(buildNodeCreateInput({ ...draft, cpus: '8' }, requirements)).toMatchObject({ cpus: 8 });
  });

  it('only emits mutable changed fields for update', () => {
    const node = {
      id: 12,
      active: true,
      name: 'node12',
      type: 'node',
      location: { id: 4, label: 'Prague' },
      ip_addr: '192.0.2.12',
      max_tx: 1000,
      max_rx: 1000,
      max_vps: 100,
      cpus: 24,
      total_memory: 64000,
      total_swap: 8000,
    };
    const draft = nodeEditDraft(node);
    draft.name = 'node12-new';
    draft.maxVps = '150';

    const payload = buildNodeUpdateInput(node, draft);
    expect(payload).toEqual({ name: 'node12-new', max_vps: 150 });
    expect(payload).not.toHaveProperty('location');
    expect(payload).not.toHaveProperty('type');
    expect(payload).not.toHaveProperty('cpus');
    expect(payload).not.toHaveProperty('total_memory');
    expect(payload).not.toHaveProperty('total_swap');
  });

  it('accepts zero as an explicit maximum VPS value during update', () => {
    const node = { id: 12, active: true, name: 'node12', type: 'node', ip_addr: '192.0.2.12', max_vps: 100 };
    const draft = nodeEditDraft(node);
    draft.maxVps = '0';

    expect(buildNodeUpdateInput(node, draft)).toEqual({ max_vps: 0 });
  });

  it('rejects a false clear when the deployed update contract is not nullable', () => {
    const node = {
      id: 12,
      active: true,
      name: 'node12',
      type: 'node',
      ip_addr: '192.0.2.12',
      max_tx: 1000,
      max_rx: 2000,
      max_vps: 100,
    };
    const draft = nodeEditDraft(node);
    draft.maxVps = '';

    expect(() => buildNodeUpdateInput(node, draft)).toThrow('max_vps');
  });

  it('sends null only when OPTIONS explicitly marks a limit nullable', () => {
    const node = { id: 12, active: true, name: 'node12', type: 'node', ip_addr: '192.0.2.12', max_vps: 100 };
    const draft = nodeEditDraft(node);
    draft.maxVps = '';
    const nullability = nodeUpdateNullability({
      input: { parameters: { max_vps: { nullable: true }, max_tx: {}, max_rx: {} } },
    });

    expect(nullability).toEqual({ max_tx: false, max_rx: false, max_vps: true });
    expect(buildNodeUpdateInput(node, draft, nullability)).toEqual({ max_vps: null });
  });

  it('recognizes an unchanged draft', () => {
    const node = { id: 3, active: true, name: 'mailer1', type: 'mailer', ip_addr: '192.0.2.3' };
    expect(hasNodeUpdateChanges(buildNodeUpdateInput(node, nodeEditDraft(node)))).toBe(false);
  });

  it('validates IPv4 octets', () => {
    expect(validateIpv4('192.0.2.1')).toBe(true);
    expect(validateIpv4('192.0.2.999')).toBe(false);
    expect(validateIpv4('2001:db8::1')).toBe(false);
  });
});
