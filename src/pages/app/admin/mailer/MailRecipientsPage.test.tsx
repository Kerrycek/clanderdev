// i18n-ignore-file

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchMailRecipient,
  fetchMailRecipients,
  updateMailRecipient,
  type MailRecipient,
} from '../../../../lib/api/mailer';
import { MailRecipientsPage } from './MailRecipientsPage';

vi.mock('../../../../app/appMode', () => ({
  useAppMode: () => ({ mode: 'admin', basePath: '/admin' }),
}));

vi.mock('../../../../app/auth', () => ({
  useAuth: () => ({ user: { id: 42 } }),
}));

vi.mock('../../../../app/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../../app/toasts', () => ({
  useToasts: () => ({ pushToast: vi.fn() }),
}));

vi.mock('../../../../lib/api/mailer', () => ({
  createMailRecipient: vi.fn(),
  fetchMailRecipient: vi.fn(),
  fetchMailRecipients: vi.fn(),
  updateMailRecipient: vi.fn(),
}));

const original: MailRecipient = {
  id: 19,
  label: 'Operations',
  to: 'ops@example.test',
  cc: null,
  bcc: 'audit@example.test',
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter([
    { path: '/admin/mailer/recipients', element: <MailRecipientsPage /> },
  ], { initialEntries: ['/admin/mailer/recipients'] });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('MailRecipientsPage lost-update safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.mocked(fetchMailRecipients).mockResolvedValue({ data: [original], meta: {} } as never);
  });

  it('preserves a stale draft, blocks PUT, and saves only after loading the server version', async () => {
    const latest: MailRecipient = {
      ...original,
      label: 'Operations changed on server',
      to: 'new-ops@example.test',
      cc: 'copy@example.test',
    };
    vi.mocked(fetchMailRecipient).mockResolvedValue({ data: latest, meta: {} } as never);
    vi.mocked(updateMailRecipient).mockResolvedValue({
      data: { ...latest, label: 'Saved after reset' },
      meta: {},
    } as never);

    renderPage();
    const editButtons = await screen.findAllByTestId('admin.mailer.recipients.edit.19');
    fireEvent.click(editButtons[0] as HTMLElement);

    const draft = {
      label: 'Unsaved draft',
      to: 'draft@example.test',
      cc: 'draft-copy@example.test',
      bcc: 'draft-audit@example.test',
    };
    for (const [field, value] of Object.entries(draft)) {
      fireEvent.change(screen.getByTestId(`admin.mailer.recipients.editor.${field}`), {
        target: { value },
      });
    }

    const saveButton = screen.getByTestId('admin.mailer.recipients.editor.save');
    fireEvent.click(saveButton);

    expect(await screen.findByTestId('admin.mailer.recipients.editor.stale')).toBeVisible();
    expect(fetchMailRecipient).toHaveBeenCalledTimes(1);
    expect(fetchMailRecipient).toHaveBeenCalledWith(19);
    expect(updateMailRecipient).not.toHaveBeenCalled();
    expect(saveButton).toBeDisabled();
    for (const [field, value] of Object.entries(draft)) {
      expect(screen.getByTestId(`admin.mailer.recipients.editor.${field}`)).toHaveValue(value);
    }

    fireEvent.click(screen.getByTestId('admin.mailer.recipients.editor.stale.reset'));
    await waitFor(() => {
      expect(screen.queryByTestId('admin.mailer.recipients.editor.stale')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('admin.mailer.recipients.editor.label')).toHaveValue(latest.label);
    expect(screen.getByTestId('admin.mailer.recipients.editor.to')).toHaveValue(latest.to);
    expect(screen.getByTestId('admin.mailer.recipients.editor.cc')).toHaveValue(latest.cc);
    expect(screen.getByTestId('admin.mailer.recipients.editor.bcc')).toHaveValue(latest.bcc);
    expect(saveButton).toBeEnabled();

    fireEvent.change(screen.getByTestId('admin.mailer.recipients.editor.label'), {
      target: { value: 'Saved after reset' },
    });
    fireEvent.click(saveButton);

    await waitFor(() => expect(fetchMailRecipient).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(updateMailRecipient).toHaveBeenCalledWith(19, {
      label: 'Saved after reset',
      to: 'new-ops@example.test',
      cc: 'copy@example.test',
      bcc: 'audit@example.test',
    }));
    expect(vi.mocked(fetchMailRecipient).mock.invocationCallOrder[1]).toBeLessThan(
      vi.mocked(updateMailRecipient).mock.invocationCallOrder[0] as number,
    );
  });
});
