// i18n-ignore-file
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { VpsNetworkHostAddressesCard } from './VpsNetworkHostAddressesCard';
import { parseHostAddressLines, VpsHostAddressCreateModal } from './VpsHostAddressCreateModal';

vi.mock('../../../app/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

describe('VPS network legacy parity', () => {
  it('normalizes multiline custom host addresses', () => {
    expect(parseHostAddressLines(' 192.0.2.10\n\n2001:db8::10 ')).toEqual(['192.0.2.10', '2001:db8::10']);
  });

  it('submits every valid custom host address in the selected route', () => {
    const onSubmit = vi.fn();
    render(
      <VpsHostAddressCreateModal
        route={{ id: 4, addr: '192.0.2.0', prefix: 24 }}
        saving={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByTestId('vps.network.host_addresses.create.addresses'), {
      target: { value: '192.0.2.10\n192.0.2.11' },
    });
    fireEvent.click(screen.getByTestId('vps.network.host_addresses.create.submit'));
    expect(onSubmit).toHaveBeenCalledWith(['192.0.2.10', '192.0.2.11']);
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
