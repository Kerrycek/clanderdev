// i18n-ignore-file

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchSecurityAdvisoriesWithCves,
  type SecurityAdvisory,
} from '../../lib/api/securityAdvisories';
import { SecurityAdvisoriesPage } from './SecurityAdvisoriesPage';

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
    fetchSecurityAdvisoriesWithCves: vi.fn(),
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

afterEach(() => {
  vi.clearAllMocks();
});

describe('SecurityAdvisoriesPage', () => {
  it('loads published advisories and renders CVEs', async () => {
    const advisory: SecurityAdvisory = {
      id: 17,
      state: 'published',
      name: 'OpenSSL advisory',
      published_at: '2026-06-01T10:00:00Z',
      en_summary: 'Patch OpenSSL on affected VPS.',
      affected_user_count: 12,
      affected_vps_count: 34,
      affected_node_count: 2,
    };
    vi.mocked(fetchSecurityAdvisoriesWithCves).mockResolvedValue({
      data: [
        {
          ...advisory,
          cves: [{ id: 1, cve_id: 'CVE-2026-0001' }],
        },
      ],
      envelope: { status: true, response: {} },
    });

    renderPage();

    expect(await screen.findByTestId('public.security_advisories.page')).toBeVisible();
    expect(await screen.findByText('OpenSSL advisory')).toBeVisible();
    expect(screen.getByText('CVE-2026-0001')).toBeVisible();
    expect(screen.getByText('Patch OpenSSL on affected VPS.')).toBeVisible();
    expect(fetchSecurityAdvisoriesWithCves).toHaveBeenCalledWith({
      limit: 100,
      state: 'published',
      order: 'newest',
    });
  });
});
