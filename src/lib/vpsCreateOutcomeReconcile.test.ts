import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchVps } from './api/vps';
import { reconcileVpsCreateOutcome } from './vpsCreateOutcomeReconcile';

vi.mock('./api/vps', () => ({ fetchVps: vi.fn() }));

const marker = {
  id: 'marker-1',
  createdAt: 1_000,
  phase: 'uncertain' as const,
  identity: { hostname: 'duplicate.example', ownerId: 42, locationId: 7 },
};

describe('reconcileVpsCreateOutcome', () => {
  beforeEach(() => vi.mocked(fetchVps).mockReset());

  it('never treats a pre-existing same-host VPS as proof without the returned id', async () => {
    await expect(reconcileVpsCreateOutcome(marker)).resolves.toEqual({ status: 'none' });
    expect(fetchVps).not.toHaveBeenCalled();
  });

  it('accepts only the exact returned VPS id with matching immutable target identity', async () => {
    vi.mocked(fetchVps).mockResolvedValue({
      data: {
        id: 123,
        hostname: 'duplicate.example',
        user: { id: 42, login: 'owner', level: 1 },
        node: { id: 5, location: { id: 7 } },
      },
      envelope: { status: true },
    });

    await expect(reconcileVpsCreateOutcome({ ...marker, candidateVpsId: 123 })).resolves.toMatchObject({
      status: 'matched',
      vps: { id: 123 },
    });
    expect(fetchVps).toHaveBeenCalledWith(123, { includes: 'user,node__location' });
  });

  it('fails closed when the exact id resolves to a different owner or location', async () => {
    vi.mocked(fetchVps).mockResolvedValue({
      data: {
        id: 123,
        hostname: 'duplicate.example',
        user: { id: 99, login: 'other', level: 1 },
        node: { id: 5, location: { id: 7 } },
      },
      envelope: { status: true },
    });

    await expect(reconcileVpsCreateOutcome({ ...marker, candidateVpsId: 123 })).resolves.toEqual({
      status: 'mismatch',
    });
  });
});
