// i18n-ignore-file
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { CopyButton } from './CopyButton';

const clipboard = vi.hoisted(() => ({ copy: vi.fn() }));

vi.mock('../../app/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../lib/clipboard', () => ({
  copyTextToClipboard: clipboard.copy,
}));

describe('CopyButton', () => {
  it('keeps compact copy actions accessible and confirms success', async () => {
    clipboard.copy.mockResolvedValueOnce(true);

    render(<CopyButton text="node5.example" iconOnly testId="copy-node" />);

    const button = screen.getByTestId('copy-node');
    expect(button).toHaveAccessibleName('common.copy');
    expect(button).toHaveAttribute('title', 'common.copy');

    fireEvent.click(button);

    await waitFor(() => expect(clipboard.copy).toHaveBeenCalledWith('node5.example'));
    await waitFor(() => expect(button).toHaveAccessibleName('common.copied'));
    expect(screen.getByRole('status')).toHaveTextContent('common.copied');
  });
});
