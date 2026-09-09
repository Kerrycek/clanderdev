import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { fetchIpAddresses } from '../../lib/api/ipAddresses';
import { IpAddressLookupInput } from './IpAddressLookupInput';

vi.mock('../../lib/api/ipAddresses', () => ({
  fetchIpAddresses: vi.fn(),
}));

function renderLookup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <IpAddressLookupInput
        value={null}
        onChange={vi.fn()}
        userId={48}
        ariaLabel="IP address"
        testId="ip-address"
      />
    </QueryClientProvider>
  );
}

describe('IpAddressLookupInput', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('uses a bounded user scope and filters partial addresses locally', async () => {
    vi.mocked(fetchIpAddresses).mockResolvedValue({
      data: [
        { id: 480, addr: '83.167.228.48', prefix: 32 },
        { id: 481, addr: '192.0.2.1', prefix: 32 },
      ],
      envelope: { status: true, response: {} },
    });
    renderLookup();

    const input = screen.getByRole('textbox', { name: 'IP address' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '228.4' } });

    await waitFor(() => expect(fetchIpAddresses).toHaveBeenCalledWith({ limit: 250, user: 48 }));
    expect(await screen.findByTestId('ip-address.opt.480')).toHaveTextContent('83.167.228.48');
    expect(screen.queryByTestId('ip-address.opt.481')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: '192.0' } });
    expect(await screen.findByTestId('ip-address.opt.481')).toHaveTextContent('192.0.2.1');
    expect(fetchIpAddresses).toHaveBeenCalledTimes(1);
  });
});
