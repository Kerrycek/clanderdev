// i18n-ignore-file
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { VpsNetworkHostAddressesCard } from './VpsNetworkHostAddressesCard';
import {
  createHostAddressesSequentially,
  HostAddressBatchCreateError,
  hostAddressBatchSettlementError,
  parseHostAddressLines,
  VpsHostAddressCreateModal,
} from './VpsHostAddressCreateModal';
import { VpsNetworkIpRoutesCard } from './VpsNetworkIpRoutesCard';

vi.mock('../../../app/i18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) => vars
      ? `${key}:${Object.values(vars).join(':')}`
      : key,
  }),
}));

describe('VPS network legacy parity', () => {
  it('normalizes multiline custom host addresses', () => {
    expect(parseHostAddressLines(' 192.0.2.10\n\n2001:db8::10\n192.0.2.10 ')).toEqual([
      '192.0.2.10',
      '2001:db8::10',
    ]);
  });

  it('preserves successful writes and returns only failed/unattempted addresses for retry', async () => {
    const createOne = vi.fn(async (address: string) => {
      if (address === '192.0.2.11') throw new Error('duplicate');
    });

    await expect(createHostAddressesSequentially(
      ['192.0.2.10', '192.0.2.11', '192.0.2.12'],
      createOne,
    )).rejects.toMatchObject({
      createdAddresses: ['192.0.2.10'],
      failedAddress: '192.0.2.11',
      retryAddresses: ['192.0.2.11', '192.0.2.12'],
      cause: expect.objectContaining({ message: 'duplicate' }),
    } satisfies Partial<HostAddressBatchCreateError>);
    expect(createOne).toHaveBeenCalledTimes(2);
  });

  it('preserves an ambiguous failed write for durable lock settlement', async () => {
    const transportError = new TypeError('connection lost');

    try {
      await createHostAddressesSequentially(['192.0.2.10'], async () => {
        throw transportError;
      });
      throw new Error('expected batch creation to fail');
    } catch (error) {
      expect(hostAddressBatchSettlementError(error)).toBe(transportError);
    }
  });

  it('submits every valid custom host address in the selected route', () => {
    const onSubmit = vi.fn();
    render(
      <VpsHostAddressCreateModal
        route={{ id: 4, addr: '192.0.2.0', prefix: 24 }}
        saving={false}
        value={'192.0.2.10\n192.0.2.11'}
        onClose={vi.fn()}
        onValueChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    const submit = screen.getByTestId('vps.network.host_addresses.create.submit');
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith(['192.0.2.10', '192.0.2.11']);
  });

  it('reads the effective route-via host address back on the VPS route card', () => {
    render(
      <VpsNetworkIpRoutesCard
        canAdmin={false}
        canMutate={false}
        adminBasePath="/admin"
        gate={{ allowed: true }}
        isLoading={false}
        errorMessage={null}
        netifs={[{ id: 3, name: 'eth0' }]}
        ipByNetif={new Map([[3, [{
          id: 4,
          addr: '198.51.100.0',
          prefix: 24,
          network_interface: { id: 3 },
          route_via: { id: 9, addr: '192.0.2.1' },
        }]]])}
        unassignedIps={[]}
        freeRoutePending={false}
        onAddRoute={vi.fn()}
        onRefresh={vi.fn()}
        onEditOwner={vi.fn()}
        onFreeRoute={vi.fn()}
        onAssignRoute={vi.fn()}
        onAddHostAddresses={vi.fn()}
      />,
    );

    expect(screen.getByText('vps.network.routing.via:192.0.2.1')).toBeTruthy();
  });

  it('offers the existing PTR editor for an unassigned host address', () => {
    const onEditPtr = vi.fn();
    render(
      <VpsNetworkHostAddressesCard
        canMutate
        gate={{ allowed: true }}
        isLoading={false}
        errorMessage={null}
        actionErrorMessage={null}
        rows={[{ id: 9, addr: '192.0.2.9', assigned: false, reverse_record_value: null }]}
        updatePtrPending={false}
        assignHostPending={false}
        freeHostPending={false}
        deleteHostPending={false}
        onRefresh={vi.fn()}
        onEditPtr={onEditPtr}
        onAssign={vi.fn()}
        onFree={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('vps.network.host_addresses.row.9.ptr'));
    expect(onEditPtr).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
  });
});
