// i18n-ignore-file

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchAllSecurityAdvisoryUpdates,
  fetchSecurityAdvisory,
  fetchSecurityAdvisoryAffectedVps,
  fetchSecurityAdvisoryCves,
  fetchSecurityAdvisoryNodeStatuses,
  fetchSecurityAdvisoryOutageLinks,
} from '../../lib/api/securityAdvisories';
import { SecurityAdvisoryDetailPage } from './SecurityAdvisoryDetailPage';

const { authState } = vi.hoisted(() => ({
  authState: {
    status: 'anonymous',
    user: undefined,
    role: 'unknown',
    canUseAdminUi: false,
  } as {
    status: 'anonymous' | 'authenticated';
    user?: { id: number; login: string };
    role: 'unknown' | 'user' | 'support' | 'admin';
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
    fetchAllSecurityAdvisoryUpdates: vi.fn(),
    fetchSecurityAdvisory: vi.fn(),
    fetchSecurityAdvisoryAffectedVps: vi.fn(),
    fetchSecurityAdvisoryCves: vi.fn(),
    fetchSecurityAdvisoryNodeStatuses: vi.fn(),
    fetchSecurityAdvisoryOutageLinks: vi.fn(),
  };
});

function renderPage(path = '/ui-next/security-advisories/17') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter basename="/ui-next" initialEntries={[path]}>
        <Routes>
          <Route
            path="/security-advisories/:advisoryId"
            element={<SecurityAdvisoryDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function apiResult<T>(data: T) {
  return { data, envelope: { status: true } };
}

function mockEmptyPublicRelations() {
  vi.mocked(fetchSecurityAdvisoryCves).mockResolvedValue(apiResult([]));
  vi.mocked(fetchSecurityAdvisoryNodeStatuses).mockResolvedValue(apiResult([]));
  vi.mocked(fetchAllSecurityAdvisoryUpdates).mockResolvedValue(apiResult([]));
  vi.mocked(fetchSecurityAdvisoryOutageLinks).mockResolvedValue(apiResult([]));
}

afterEach(() => {
  vi.clearAllMocks();
  authState.status = 'anonymous';
  authState.user = undefined;
  authState.role = 'unknown';
  authState.canUseAdminUi = false;
});

describe('SecurityAdvisoryDetailPage', () => {
  it('renders only public advisory content and its public relations', async () => {
    vi.mocked(fetchSecurityAdvisory).mockResolvedValue(apiResult({
        id: 17,
        state: 'published',
        name: 'OpenSSL advisory',
        published_at: '2026-06-01T10:00:00Z',
        en_summary: 'Patch OpenSSL on affected systems.',
        en_description: 'A vulnerability affects selected hosts.',
        en_response: 'Affected hosts have been updated.',
        affected_user_count: 91,
        affected_vps_count: 123,
      }));
    vi.mocked(fetchSecurityAdvisoryCves).mockResolvedValue(apiResult([
        {
          id: 3,
          cve_id: 'CVE-2026-0001',
          url: 'https://example.test/CVE-2026-0001',
        },
      ]));
    vi.mocked(fetchSecurityAdvisoryNodeStatuses).mockResolvedValue(apiResult([
        {
          id: 9,
          node: { id: 4, name: 'node4.prg' },
          state: 'mitigated',
          mitigated_since: '2026-06-02T12:00:00Z',
          note: 'Internal operator note must not be public.',
        },
      ]));
    vi.mocked(fetchAllSecurityAdvisoryUpdates).mockResolvedValue(apiResult([
        {
          id: 11,
          state: 'published',
          published_at: '2026-06-01T12:30:00Z',
          en_summary: 'Initial notice',
          en_message: 'Investigation is in progress.',
        },
        {
          id: 12,
          state: 'published',
          published_at: '2026-06-02T12:30:00Z',
          en_summary: 'Mitigation completed',
          en_message: 'All affected public nodes have been patched.',
          reporter_name: 'Internal operator',
        },
      ]));
    vi.mocked(fetchSecurityAdvisoryOutageLinks).mockResolvedValue(apiResult([
        {
          id: 8,
          outage: {
            id: 42,
            en_summary: 'Security maintenance',
          },
        },
      ]));

    renderPage();

    expect(await screen.findByTestId('public.security_advisory_detail.page')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'OpenSSL advisory' })).toBeVisible();
    expect(screen.getByText('Patch OpenSSL on affected systems.')).toBeVisible();
    expect(screen.getByText('A vulnerability affects selected hosts.')).toBeVisible();
    expect(screen.getByText('Affected hosts have been updated.')).toBeVisible();
    expect(await screen.findByRole('link', { name: /CVE-2026-0001/ })).toHaveAttribute(
      'href',
      'https://example.test/CVE-2026-0001',
    );
    expect(await screen.findByText('node4.prg')).toBeVisible();
    expect(await screen.findByText('Mitigation completed')).toBeVisible();
    expect(screen.getByText('All affected public nodes have been patched.')).toBeVisible();
    const newestUpdate = screen.getByText('Mitigation completed');
    const oldestUpdate = screen.getByText('Initial notice');
    expect(
      newestUpdate.compareDocumentPosition(oldestUpdate) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(await screen.findByRole('link', { name: /Security maintenance/ })).toHaveAttribute(
      'href',
      '/ui-next/outages/42',
    );

    expect(screen.queryByText('Internal operator note must not be public.')).not.toBeInTheDocument();
    expect(screen.queryByText('Internal operator')).not.toBeInTheDocument();
    expect(screen.queryByText('91')).not.toBeInTheDocument();
    expect(screen.queryByText('123')).not.toBeInTheDocument();

    expect(fetchSecurityAdvisory).toHaveBeenCalledWith(17);
    expect(fetchSecurityAdvisoryCves).toHaveBeenCalledWith({
      securityAdvisoryId: 17,
      limit: 100,
    });
    expect(fetchSecurityAdvisoryNodeStatuses).toHaveBeenCalledWith(17, {
      limit: 100,
      includes: 'node',
    });
    expect(fetchAllSecurityAdvisoryUpdates).toHaveBeenCalledWith({
      securityAdvisoryId: 17,
      limit: 100,
    });
    expect(fetchSecurityAdvisoryOutageLinks).toHaveBeenCalledWith({
      securityAdvisoryId: 17,
      limit: 100,
      includes: 'outage',
    });
  });

  it('shows an authenticated user only their own affected VPS', async () => {
    authState.status = 'authenticated';
    authState.user = { id: 42, login: 'member' };
    authState.role = 'user';
    vi.mocked(fetchSecurityAdvisory).mockResolvedValue(apiResult({
        id: 17,
        state: 'published',
        name: 'Personal impact advisory',
        affected: true,
        affected_user_count: 91,
        affected_vps_count: 123,
      }));
    mockEmptyPublicRelations();
    vi.mocked(fetchSecurityAdvisoryAffectedVps).mockResolvedValue(apiResult([
        {
          id: 27,
          vps: { id: 7, label: 'mine-vps' },
          user: { id: 42, label: 'Private account metadata' },
          node: { id: 4, domain_name: 'node4.prg' },
          node_state: 'mitigated',
          mitigated_since: '2026-06-02T12:00:00Z',
        },
      ]));

    renderPage();

    expect(await screen.findByTestId('public.security_advisory_detail.own_affected_vps')).toBeVisible();
    expect(screen.getAllByText('dashboard.section.security.affects_me')).toHaveLength(2);
    expect(await screen.findByRole('link', { name: 'mine-vps' })).toHaveAttribute(
      'href',
      '/ui-next/app/vps/7',
    );
    expect(screen.getByText(/node4\.prg/)).toBeVisible();
    expect(screen.queryByText('Private account metadata')).not.toBeInTheDocument();
    expect(screen.queryByText('91')).not.toBeInTheDocument();
    expect(screen.queryByText('123')).not.toBeInTheDocument();
    expect(fetchSecurityAdvisoryAffectedVps).toHaveBeenCalledWith({
      securityAdvisoryId: 17,
      userId: undefined,
      limit: 100,
      fromId: undefined,
      includes: 'vps,node',
    });
  });

  it('explicitly scopes an admin personal-impact request to the signed-in user', async () => {
    authState.status = 'authenticated';
    authState.user = { id: 42, login: 'admin' };
    authState.role = 'admin';
    authState.canUseAdminUi = true;
    vi.mocked(fetchSecurityAdvisory).mockResolvedValue(apiResult({
        id: 17,
        state: 'published',
        name: 'Admin personal impact advisory',
        affected: false,
      }));
    mockEmptyPublicRelations();
    vi.mocked(fetchSecurityAdvisoryAffectedVps).mockResolvedValue(apiResult([]));

    renderPage();

    expect(await screen.findByTestId('public.security_advisory_detail.own_affected_vps')).toBeVisible();
    expect(fetchSecurityAdvisoryAffectedVps).toHaveBeenCalledWith(
      expect.objectContaining({
        securityAdvisoryId: 17,
        userId: 42,
      }),
    );
    expect(screen.getAllByText('dashboard.section.security.not_affected').length).toBeGreaterThan(0);
  });

  it('explicitly scopes a support personal-impact request to the signed-in user', async () => {
    authState.status = 'authenticated';
    authState.user = { id: 42, login: 'support' };
    authState.role = 'support';
    authState.canUseAdminUi = true;
    vi.mocked(fetchSecurityAdvisory).mockResolvedValue(apiResult({
        id: 17,
        state: 'published',
        name: 'Support personal impact advisory',
        affected: false,
      }));
    mockEmptyPublicRelations();
    vi.mocked(fetchSecurityAdvisoryAffectedVps).mockResolvedValue(apiResult([]));

    renderPage();

    expect(await screen.findByTestId('public.security_advisory_detail.own_affected_vps')).toBeVisible();
    await waitFor(() => {
      expect(fetchSecurityAdvisoryAffectedVps).toHaveBeenCalledWith(
        expect.objectContaining({
          securityAdvisoryId: 17,
          userId: 42,
        }),
      );
    });
  });

  it('does not load or expose relations for a draft advisory', async () => {
    vi.mocked(fetchSecurityAdvisory).mockResolvedValue(apiResult({
        id: 17,
        state: 'draft',
        name: 'Private draft title',
        en_summary: 'Private draft body',
      }));

    renderPage();

    expect(await screen.findByText('public.security_advisory_detail.not_found')).toBeVisible();
    expect(screen.queryByText('Private draft title')).not.toBeInTheDocument();
    expect(screen.queryByText('Private draft body')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchSecurityAdvisoryCves).not.toHaveBeenCalled();
      expect(fetchSecurityAdvisoryNodeStatuses).not.toHaveBeenCalled();
      expect(fetchAllSecurityAdvisoryUpdates).not.toHaveBeenCalled();
      expect(fetchSecurityAdvisoryAffectedVps).not.toHaveBeenCalled();
      expect(fetchSecurityAdvisoryOutageLinks).not.toHaveBeenCalled();
    });
  });

  it('rejects an invalid advisory id without calling the API', () => {
    renderPage('/ui-next/security-advisories/not-a-number');

    expect(screen.getByText('public.security_advisory_detail.invalid_id.title')).toBeVisible();
    expect(fetchSecurityAdvisory).not.toHaveBeenCalled();
  });
});
