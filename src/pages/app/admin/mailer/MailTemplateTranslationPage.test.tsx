// i18n-ignore-file

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteMailTemplateTranslation,
  fetchMailTemplate,
  fetchMailTemplateTranslation,
  updateMailTemplateTranslation,
  type MailTemplateTranslation,
} from '../../../../lib/api/mailer';
import { HaveApiError } from '../../../../lib/api/haveapi';
import { MailTemplateTranslationPage } from './MailTemplateTranslationPage';

vi.mock('../../../../app/appMode', () => ({
  useAppMode: () => ({ mode: 'admin', basePath: '/admin' }),
}));

vi.mock('../../../../app/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../../lib/api/mailer', () => ({
  deleteMailTemplateTranslation: vi.fn(),
  fetchMailTemplate: vi.fn(),
  fetchMailTemplateTranslation: vi.fn(),
  updateMailTemplateTranslation: vi.fn(),
}));

const template = {
  id: 1,
  name: 'welcome',
  label: 'Welcome mail',
};

const originalTranslation: MailTemplateTranslation = {
  id: 101,
  language: { id: 1, code: 'en', label: 'English' },
  from: 'original-from@example.test',
  reply_to: 'original-reply@example.test',
  return_path: 'original-return@example.test',
  subject: 'Original subject',
  text_plain: 'Original plain body',
  text_html: '<p>Original HTML body</p>',
  created_at: '2026-09-01T09:00:00Z',
  updated_at: '2026-09-01T09:00:00Z',
};

const translationShowQueryKey = [
  'mailer',
  'mail_templates',
  'translations',
  'show',
  { tplId: 1, trId: 101 },
] as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderPage(queryClient: QueryClient) {
  const router = createMemoryRouter([
    {
      path: '/admin/mailer/templates/:mailTemplateId/translations/:translationId',
      element: <MailTemplateTranslationPage />,
    },
    {
      path: '/admin/mailer/templates/:mailTemplateId',
      element: <div data-testid="template-detail-destination" />,
    },
  ], { initialEntries: ['/admin/mailer/templates/1/translations/101'] });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
}

async function enableEditing() {
  await screen.findByTestId('admin.mailer.templates.translation.detail.readonly');
  fireEvent.click(screen.getByTestId('admin.mailer.templates.translation.detail.enable_editing'));
  fireEvent.click(await screen.findByTestId('admin.mailer.templates.translation.detail.enable_editing_confirm.confirm'));
  await screen.findByTestId('admin.mailer.templates.translation.detail.from');
}

describe('MailTemplateTranslationPage mutation races', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchMailTemplate).mockResolvedValue({ data: template, meta: {} } as never);
    vi.mocked(fetchMailTemplateTranslation).mockResolvedValue({
      data: originalTranslation,
      meta: {},
    } as never);
  });

  it('blocks a stale draft after a background update and saves only after resetting to the latest version', async () => {
    const pendingSave = deferred<Awaited<ReturnType<typeof updateMailTemplateTranslation>>>();
    vi.mocked(updateMailTemplateTranslation).mockReturnValue(pendingSave.promise);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    renderPage(queryClient);
    await enableEditing();

    const draft = {
      from: 'draft-from@example.test',
      reply_to: 'draft-reply@example.test',
      return_path: 'draft-return@example.test',
      subject: 'Unsaved draft subject',
      text_plain: 'Unsaved plain body',
      text_html: '<p>Unsaved HTML body</p>',
    };
    for (const [field, value] of Object.entries(draft)) {
      fireEvent.change(
        screen.getByTestId(`admin.mailer.templates.translation.detail.${field}`),
        { target: { value } },
      );
    }

    const backgroundTranslation: MailTemplateTranslation = {
      ...originalTranslation,
      from: 'background-from@example.test',
      reply_to: 'background-reply@example.test',
      return_path: 'background-return@example.test',
      subject: 'Background subject',
      text_plain: 'Background plain body',
      text_html: '<p>Background HTML body</p>',
      updated_at: '2026-09-02T09:00:00Z',
    };
    await act(async () => {
      queryClient.setQueryData(translationShowQueryKey, backgroundTranslation);
    });

    for (const [field, value] of Object.entries(draft)) {
      expect(screen.getByTestId(`admin.mailer.templates.translation.detail.${field}`)).toHaveValue(value);
    }
    expect(await screen.findByTestId('admin.mailer.templates.translation.detail.stale')).toBeVisible();

    const saveButton = screen.getByTestId('admin.mailer.templates.translation.detail.save');
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(fetchMailTemplateTranslation).toHaveBeenCalledTimes(1);
    expect(updateMailTemplateTranslation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('admin.mailer.templates.translation.detail.stale.reset'));
    await waitFor(() => {
      expect(screen.queryByTestId('admin.mailer.templates.translation.detail.stale')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('admin.mailer.templates.translation.detail.from')).toHaveValue(backgroundTranslation.from);
    expect(screen.getByTestId('admin.mailer.templates.translation.detail.subject')).toHaveValue(backgroundTranslation.subject);

    const postResetDraft = {
      from: 'saved-from@example.test',
      reply_to: 'saved-reply@example.test',
      return_path: 'saved-return@example.test',
      subject: 'Saved after reset',
      text_plain: 'Saved plain body',
      text_html: '<p>Saved HTML body</p>',
    };
    for (const [field, value] of Object.entries(postResetDraft)) {
      fireEvent.change(
        screen.getByTestId(`admin.mailer.templates.translation.detail.${field}`),
        { target: { value } },
      );
    }

    vi.mocked(fetchMailTemplateTranslation).mockResolvedValue({
      data: backgroundTranslation,
      meta: {},
    } as never);

    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);
    await waitFor(() => expect(fetchMailTemplateTranslation).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(updateMailTemplateTranslation).toHaveBeenCalledWith(1, 101, postResetDraft));
    expect(vi.mocked(fetchMailTemplateTranslation).mock.invocationCallOrder[1]).toBeLessThan(
      vi.mocked(updateMailTemplateTranslation).mock.invocationCallOrder[0] as number,
    );

    for (const field of Object.keys(postResetDraft)) {
      expect(screen.getByTestId(`admin.mailer.templates.translation.detail.${field}`)).toBeDisabled();
    }

    const savedTranslation: MailTemplateTranslation = {
      ...backgroundTranslation,
      ...postResetDraft,
      updated_at: '2026-09-03T09:00:00Z',
    };
    vi.mocked(fetchMailTemplateTranslation).mockResolvedValue({ data: savedTranslation, meta: {} } as never);
    await act(async () => {
      pendingSave.resolve({
        data: savedTranslation,
        meta: {},
      } as Awaited<ReturnType<typeof updateMailTemplateTranslation>>);
      await pendingSave.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId('admin.mailer.templates.translation.detail.from')).toBeEnabled();
    });
    for (const [field, value] of Object.entries(postResetDraft)) {
      expect(screen.getByTestId(`admin.mailer.templates.translation.detail.${field}`)).toHaveValue(value);
    }
  });

  it('removes the exact deleted show cache, navigates away and invalidates only translation lists', async () => {
    vi.mocked(deleteMailTemplateTranslation).mockResolvedValue({ data: undefined, meta: {} } as never);
    vi.mocked(fetchMailTemplateTranslation)
      .mockResolvedValueOnce({ data: originalTranslation, meta: {} } as never)
      .mockRejectedValue(new HaveApiError(
        { status: false, message: 'Translation not found' },
        'Translation not found',
        404,
      ));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const translationListQueryKey = [
      'mailer',
      'mail_templates',
      'translations',
      'index',
      { id: 1, limit: 500 },
    ] as const;
    queryClient.setQueryData(translationListQueryKey, [originalTranslation]);
    renderPage(queryClient);
    await enableEditing();

    expect(fetchMailTemplateTranslation).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('admin.mailer.templates.translation.detail.delete'));
    fireEvent.click(await screen.findByTestId('admin.mailer.templates.translation.detail.delete_confirm.confirm'));

    expect(await screen.findByTestId('template-detail-destination')).toBeVisible();
    await waitFor(() => expect(deleteMailTemplateTranslation).toHaveBeenCalledTimes(1));
    expect(deleteMailTemplateTranslation).toHaveBeenCalledWith(1, 101);
    // Removing an actively observed show query can start one final, cancelled
    // observer read before navigation unmounts this page.
    expect(fetchMailTemplateTranslation).toHaveBeenCalledTimes(2);
    expect(fetchMailTemplate).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(translationShowQueryKey)).toBeUndefined();
    expect(queryClient.getQueryState(translationListQueryKey)?.isInvalidated).toBe(true);
  });

  it('reconciles an ambiguous 503 delete with a 404 readback without retrying DELETE', async () => {
    vi.mocked(deleteMailTemplateTranslation).mockRejectedValue(new HaveApiError(
      { status: false, message: 'Service unavailable' },
      'Service unavailable',
      503,
    ));
    vi.mocked(fetchMailTemplateTranslation)
      .mockResolvedValueOnce({ data: originalTranslation, meta: {} } as never)
      .mockRejectedValue(new HaveApiError(
        { status: false, message: 'Translation not found' },
        'Translation not found',
        404,
      ));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    renderPage(queryClient);
    await enableEditing();

    fireEvent.click(screen.getByTestId('admin.mailer.templates.translation.detail.delete'));
    fireEvent.click(await screen.findByTestId('admin.mailer.templates.translation.detail.delete_confirm.confirm'));

    expect(await screen.findByTestId('template-detail-destination')).toBeVisible();
    expect(deleteMailTemplateTranslation).toHaveBeenCalledTimes(1);
    expect(deleteMailTemplateTranslation).toHaveBeenCalledWith(1, 101);
    // Call 2 is the authoritative reconciliation read. Removing the observed
    // query before navigation can start one final, cancelled observer read.
    expect(fetchMailTemplateTranslation).toHaveBeenCalledTimes(3);
    expect(fetchMailTemplateTranslation).toHaveBeenNthCalledWith(2, 1, 101);
    expect(queryClient.getQueryData(translationShowQueryKey)).toBeUndefined();
  });

  it('does not treat a malformed null readback as proof of an ambiguous deletion', async () => {
    vi.mocked(deleteMailTemplateTranslation).mockRejectedValue(new HaveApiError(
      { status: false, message: 'Service unavailable' },
      'Service unavailable',
      503,
    ));
    vi.mocked(fetchMailTemplateTranslation)
      .mockResolvedValueOnce({ data: originalTranslation, meta: {} } as never)
      .mockResolvedValueOnce({ data: null, meta: {} } as never);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    renderPage(queryClient);
    await enableEditing();

    fireEvent.click(screen.getByTestId('admin.mailer.templates.translation.detail.delete'));
    fireEvent.click(await screen.findByTestId('admin.mailer.templates.translation.detail.delete_confirm.confirm'));

    expect(await screen.findByTestId('admin.mailer.templates.translation.detail.delete_error')).toBeVisible();
    expect(screen.getByTestId('admin.mailer.templates.translation.detail.delete_confirm')).toBeVisible();
    expect(screen.queryByTestId('template-detail-destination')).not.toBeInTheDocument();
    expect(deleteMailTemplateTranslation).toHaveBeenCalledTimes(1);
    expect(fetchMailTemplateTranslation).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(translationShowQueryKey)).toEqual(originalTranslation);
  });

  it('keeps an authoritative 403 delete failure in the confirmation dialog', async () => {
    vi.mocked(deleteMailTemplateTranslation).mockRejectedValue(new HaveApiError(
      { status: false, message: 'Forbidden' },
      'Forbidden',
      403,
    ));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    renderPage(queryClient);
    await enableEditing();

    fireEvent.click(screen.getByTestId('admin.mailer.templates.translation.detail.delete'));
    fireEvent.click(await screen.findByTestId('admin.mailer.templates.translation.detail.delete_confirm.confirm'));

    expect(await screen.findByTestId('admin.mailer.templates.translation.detail.delete_error')).toBeVisible();
    expect(screen.getByTestId('admin.mailer.templates.translation.detail.delete_confirm')).toBeVisible();
    expect(screen.queryByTestId('template-detail-destination')).not.toBeInTheDocument();
    expect(deleteMailTemplateTranslation).toHaveBeenCalledTimes(1);
    expect(fetchMailTemplateTranslation).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(translationShowQueryKey)).toEqual(originalTranslation);
  });
});
