// i18n-ignore-file

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { markSessionExpiredNotice } from '../../lib/auth/sessionExpiredNotice';
import { fetchNews, fetchOutages, fetchPublicNodeStatus, fetchPublicStats } from '../../lib/api/public';
import { OverviewPage } from './OverviewPage';

vi.mock('../../app/config', () => ({
  getRuntimeConfig: () => ({
    apiBaseUrl: '/api',
    publicStatus: {
      ipv4Warn: 100,
      ipv4Critical: 20,
    },
  }),
}));

vi.mock('../../app/i18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars?.['count'] == null ? key : `${key}:${vars['count']}`),
    tc: (key: string, count: number) => `${key}:${count}`,
    preferredLanguageCodes: ['en', 'cs'],
  }),
}));

vi.mock('../../lib/api/public', () => ({
  fetchNews: vi.fn(),
  fetchOutages: vi.fn(),
  fetchPublicNodeStatus: vi.fn(),
  fetchPublicStats: vi.fn(),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location.search">{location.search}</div>;
}

function renderPage(initialEntry = '/?session=expired') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <LocationProbe />
                  <OverviewPage />
                </>
              }
            />
            <Route path="/outages" element={<div data-testid="outages.route" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

function installOverviewMocks() {
  vi.mocked(fetchPublicStats).mockResolvedValue({
    data: {
      user_count: 42,
      vps_count: 13,
      ipv4_left: 1000,
    },
    envelope: { status: true, response: {} },
  });
  vi.mocked(fetchPublicNodeStatus).mockResolvedValue({
    data: [],
    envelope: { status: true, response: {} },
  });
  vi.mocked(fetchOutages).mockResolvedValue({
    data: [],
    envelope: { status: true, response: {} },
  });
  vi.mocked(fetchNews).mockResolvedValue({
    data: [],
    envelope: { status: true, response: {} },
  });
}

afterEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe('OverviewPage session expiry notice', () => {
  it('does not show a stale expired-session URL as an inactivity warning', async () => {
    installOverviewMocks();

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('location.search')).toHaveTextContent('');
    });

    expect(screen.queryByTestId('auth.session-expired.notice')).not.toBeInTheDocument();
  });

  it('keeps a fresh session-expired warning visible under StrictMode', async () => {
    installOverviewMocks();
    markSessionExpiredNotice();

    renderPage();

    expect(await screen.findByTestId('auth.session-expired.notice')).toBeVisible();
    await waitFor(() => {
      expect(screen.getByTestId('location.search')).toHaveTextContent('');
    });
  });
});
