import { describe, expect, it, vi } from 'vitest';

import {
  executeLifecycleMutation,
  prepareLifecycleMutationVariables,
} from './VpsLifecycleMutationSnapshot';

vi.mock('./vpsPreflight', () => ({
  preflightVpsNotBusy: vi.fn().mockResolvedValue(undefined),
}));

function snapshotInput() {
  return {
    vpsId: 101,
    lockRef: { kind: 'Vps' as const, id: 101 },
    basePath: '/admin',
    objectLabel: 'source-vps',
    canMutateVps: true,
    knownBusy: false,
    permissionError: 'forbidden',
    busyError: 'busy',
    refreshVps: vi.fn(),
    refreshChains: vi.fn(),
  };
}

describe('VPS lifecycle mutation snapshots', () => {
  it('copies and freezes the target and prepared request payload', async () => {
    const payload = { force: true };
    const variables = prepareLifecycleMutationVariables(snapshotInput(), () => payload);

    payload.force = false;

    expect(Object.isFrozen(variables)).toBe(true);
    expect(Object.isFrozen(variables.lockRef)).toBe(true);
    expect(Object.isFrozen(variables.preparedPayload)).toBe(true);
    expect(variables.preparedPayload).toEqual({ ok: true, value: { force: true } });
    if (variables.preparedPayload.ok) {
      expect(Object.isFrozen(variables.preparedPayload.value)).toBe(true);
    }

    const request = vi.fn().mockResolvedValue('done');
    await expect(executeLifecycleMutation(variables, request)).resolves.toBe('done');
    expect(request).toHaveBeenCalledWith(101, { force: true });
  });

  it('defers captured payload validation errors until the mutation executes', async () => {
    const validationError = new Error('invalid-id');
    const variables = prepareLifecycleMutationVariables(snapshotInput(), () => {
      throw validationError;
    });
    const request = vi.fn();

    await expect(executeLifecycleMutation(variables, request)).rejects.toBe(validationError);
    expect(request).not.toHaveBeenCalled();
  });
});
