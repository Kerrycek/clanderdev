// i18n-ignore-file

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchAllSecurityAdvisories,
  fetchSecurityAdvisoryCves,
  type SecurityAdvisory,
} from '../../lib/api/securityAdvisories';
import { SecurityAdvisoriesPage } from './SecurityAdvisoriesPage';

const { authState } = vi.hoisted(() => ({
  authState: {
    status: 'anonymous',
    user: undefined,
    canUseAdminUi: false,
  } as {
    status: 'anonymous' | 'authenticated';
    user?: { id: number; login: string };
    canUseAdminUi: boolean;
  },
}));

vi.mock('../../app/auth', () => ({
  useAuth: () => authState,
}));

vi.mock('../../app/i18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars?.['id'] !== undefined ? `${key}:${String(vars['id'])}` : key,
    preferredLanguageCodes: ['en', 'cs'],
  }),
}));

vi.mock('../../lib/api/securityAdvisories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api/securityAdvisories')>();
  return {
    ...actual,
    fetchAllSecurityAdvisories: vi.fn(),
    fetchSecurityAdvisoryCves: vi.fn(),
  };
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter basename="/ui-next" initialEntries={['/ui-next/security-advisories']}>
        <Routes>
          <Route path="/security-advisories" element={<SecurityAdvisoriesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function apiResult<T>(data: T) {
  return { data, envelope: { status: true } };
}

function advisoryListResult(data: SecurityAdvisory[]) {
  return apiResult(data);
}

afterEach(() => {
  vi.mocked(fetchAllSecurityAdvisories).mockReset();
  vi.mocked(fetchSecurityAdvisoryCves).mockReset();
  authState.status = 'anonymous';
  authState.user = undefined;
  authState.canUseAdminUi = false;
});

describe('SecurityAdvisoriesPage', () => {
  it('loads published and retracted advisories while excluding drafts', async () => {
    vi.mocked(fetchAllSecurityAdvisories).mockImplementation(async (opts) => advisoryListResult(
      opts?.state === 'retracted'
        ? [
          {
            id: 18,
            state: 'retracted',
            name: 'Retracted advisory',
            published_at: '2026-06-02T10:00:00Z',
            retracted_at: '2026-06-03T10:00:00Z',
          },
        ]
        : [
          {
            id: 17,
            state: 'published',
            name: 'OpenSSL advisory',
            published_at: '2026-06-01T10:00:00Z',
            en_summary: 'Patch OpenSSL on affected VPS.',
            affected_user_count: 12,
            affected_vps_count: 34,
            affected_node_count: 2,
          },
          {
            id: 19,
            state: 'draft',
            name: 'Private draft',
          },
        ],
    ));
    vi.mocked(fetchSecurityAdvisoryCves).mockImplementation(async (opts) => apiResult(
      opts?.securityAdvisoryId === 17 ? [{ id: 1, cve_id: 'CVE-2026-0001' }] : [],
    ));

    renderPage();

    expect(await screen.findByTestId('public.security_advisories.page')).toBeVisible();
    expect(await screen.findByText('OpenSSL advisory')).toBeVisible();
    expect(screen.getByText('Retracted advisory')).toBeVisible();
    expect(screen.queryByText('Private draft')).not.toBeInTheDocument();
    expect(screen.getByText('CVE-2026-0001')).toBeVisible();
    expect(screen.getByText('Patch OpenSSL on affected VPS.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'OpenSSL advisory' })).toHaveAttribute(
      'href',
      '/ui-next/security-advisories/17',
    );
    expect(screen.queryByText('public.security_advisories.affected_users')).not.toBeInTheDocument();
    expect(screen.queryByText('public.security_advisories.affected_vps')).not.toBeInTheDocument();
    expect(screen.queryByText('12')).not.toBeInTheDocument();
    expect(screen.queryByText('34')).not.toBeInTheDocument();
    expect(screen.queryByText('dashboard.section.security.affects_me')).not.toBeInTheDocument();
    expect(fetchAllSecurityAdvisories).toHaveBeenCalledWith({
      limit: 100,
      state: 'published',
      order: 'newest',
    });
    expect(fetchAllSecurityAdvisories).toHaveBeenCalledWith({
      limit: 100,
      state: 'retracted',
      order: 'newest',
    });
    expect(fetchSecurityAdvisoryCves).toHaveBeenCalledTimes(2);
    expect(fetchSecurityAdvisoryCves).not.toHaveBeenCalledWith(
      expect.objectContaining({ securityAdvisoryId: 19 }),
    );
  });

  it('shows only the authenticated user impact and still filters admin drafts', async () => {
    authState.status = 'authenticated';
    authState.user = { id: 42, login: 'member' };
    authState.canUseAdminUi = true;
    vi.mocked(fetchAllSecurityAdvisories).mockImplementation(async (opts) => advisoryListResult(
      opts?.state === 'published'
        ? [
          {
            id: 17,
            state: 'published',
            name: 'Affects this user',
            affected: true,
            affected_user_count: 91,
            affected_vps_count: 123,
            cves: [],
          },
          {
            id: 19,
            state: 'draft',
            name: 'Admin-only draft',
            affected: true,
            cves: [],
          },
        ]
        : [],
    ));
    vi.mocked(fetchSecurityAdvisoryCves).mockResolvedValue(apiResult([]));

    renderPage();

    expect(await screen.findByText('Affects this user')).toBeVisible();
    expect(screen.getByText('dashboard.section.security.affects_me')).toBeVisible();
    expect(screen.queryByText('Admin-only draft')).not.toBeInTheDocument();
    expect(screen.queryByText('91')).not.toBeInTheDocument();
    expect(screen.queryByText('123')).not.toBeInTheDocument();
  });

  it('paginates the complete archive and only loads CVEs for the visible page', async () => {
    const published = Array.from({ length: 25 }, (_, index): SecurityAdvisory => {
      const id = index + 1;
      return {
        id,
        state: 'published',
        name: `Advisory ${id}`,
        published_at: '2026-06-01T10:00:00Z',
      };
    });
    published.push({ id: 999, state: 'draft', name: 'Hidden draft' });

    vi.mocked(fetchAllSecurityAdvisories).mockImplementation(async (opts) => advisoryListResult(
      opts?.state === 'published' ? published : [],
    ));
    vi.mocked(fetchSecurityAdvisoryCves).mockImplementation(async (opts) => apiResult([{
      id: Number(opts?.securityAdvisoryId),
      cve_id: `CVE-2026-${String(opts?.securityAdvisoryId).padStart(4, '0')}`,
    }]));

    renderPage();

    expect(await screen.findByText('Advisory 25')).toBeVisible();
    expect(screen.queryByText('Advisory 5')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden draft')).not.toBeInTheDocument();
    await waitFor(() => expect(fetchSecurityAdvisoryCves).toHaveBeenCalledTimes(20));
    expect(fetchSecurityAdvisoryCves).not.toHaveBeenCalledWith(
      expect.objectContaining({ securityAdvisoryId: 999 }),
    );

    fireEvent.click(screen.getByTestId('public.security_advisories.pagination.page.2'));

    expect(await screen.findByText('Advisory 5')).toBeVisible();
    expect(screen.queryByText('Advisory 25')).not.toBeInTheDocument();
    await waitFor(() => expect(fetchSecurityAdvisoryCves).toHaveBeenCalledTimes(25));
    expect(screen.getByText('pagination.page_of')).toBeVisible();
  });
});
