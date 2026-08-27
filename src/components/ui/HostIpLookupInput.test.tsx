import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { fetchHostIpAddresses } from '../../lib/api/exports';
import { HostIpLookupInput } from './HostIpLookupInput';

vi.mock('../../lib/api/exports', () => ({
  fetchHostIpAddresses: vi.fn(),
}));

function renderLookup(props: Partial<React.ComponentProps<typeof HostIpLookupInput>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onChange = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <HostIpLookupInput
        value={null}
        onChange={onChange}
        ariaLabel="Host IP"
        testId="host-ip"
        {...props}
      />
    </QueryClientProvider>
  );

  return { onChange };
}

describe('HostIpLookupInput', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('exposes a keyboard-operable combobox and selects an eligible result', async () => {
    vi.mocked(fetchHostIpAddresses).mockResolvedValue({
      data: [{ id: 12, addr: '192.0.2.12' }],
      envelope: { status: true, response: {} },
    });
    const { onChange } = renderLookup({ filters: { purpose: 'vps', routed: true } });
    const input = screen.getByRole('combobox', { name: 'Host IP' });

    fireEvent.focus(input);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('option', { name: /192\.0\.2\.12/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(12);
    expect(onChange).not.toHaveBeenCalledWith(null);
    expect(input).toHaveValue('#12');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  test('rejects a manually typed id outside the loaded eligible set', async () => {
    vi.mocked(fetchHostIpAddresses).mockResolvedValue({
      data: [{ id: 12, addr: '192.0.2.12' }],
      envelope: { status: true, response: {} },
    });
    const { onChange } = renderLookup({
      filters: { purpose: 'vps', routed: true },
      invalidSelectionMessage: 'Choose an eligible address.',
    });
    const input = screen.getByRole('combobox', { name: 'Host IP' });

    fireEvent.focus(input);
    await waitFor(() => expect(screen.getByRole('option')).toBeInTheDocument());
    fireEvent.change(input, { target: { value: '#11' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).not.toHaveBeenCalledWith(11);
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an eligible address.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  test('keeps raw id entry for unfiltered lookup call sites', () => {
    const { onChange } = renderLookup();
    const input = screen.getByRole('combobox', { name: 'Host IP' });

    fireEvent.change(input, { target: { value: '#11' } });

    expect(onChange).toHaveBeenCalledWith(11);
  });
});
