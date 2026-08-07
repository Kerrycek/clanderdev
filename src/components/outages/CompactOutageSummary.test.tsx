import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchOutageEntities, type Outage } from '../../lib/api/public';
import { CompactOutageSummary } from './CompactOutageSummary';

vi.mock('../../app/i18n', () => ({
  useI18n: () => ({
    preferredLanguageCodes: ['cs', 'en'],
    t: (key: string, vars?: Record<string, unknown>) => {
      const values: Record<string, string> = {
        'state.active': 'Aktivní',
        'api.outage.type.unplanned_outage': 'Neplánovaný výpadek',
        'api.outage.impact.system_reset': 'Restart systému',
        'public.outage.field.begins': 'Začátek',
        'public.outage.field.duration': 'Délka',
        'public.outage.field.finished': 'Konec',
        'public.outage.field.systems': 'Systémy',
        'public.outage.duration.minutes': `${vars?.['count']} min`,
        'public.outage.duration.hours': `${vars?.['count']} h`,
        'public.outage.duration.hours_minutes': `${vars?.['hours']} h ${vars?.['minutes']} min`,
        'public.outage.entities.loading': 'Načítám…',
        'public.outage.entities.more': `+${vars?.['count']}`,
        'public.outage.affected': 'Týká se mě',
      };
      return values[key] ?? key;
    },
  }),
}));

vi.mock('../../lib/api/public', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api/public')>();
  return { ...actual, fetchOutageEntities: vi.fn() };
});

function renderSummary(outage: Outage) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CompactOutageSummary outage={outage} to={`/outages/${outage.id}`} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('CompactOutageSummary', () => {
  it('shows the localized reason, duration, type, impact and a compact systems list', async () => {
    vi.mocked(fetchOutageEntities).mockResolvedValue({
      data: [
        { id: 1, name: 'Node', entity_id: 214, label: 'node5.brq' },
        { id: 2, name: 'Node', entity_id: 215, label: 'node6.brq' },
        { id: 3, name: 'Node', entity_id: 216, label: 'node7.brq' },
        { id: 4, name: 'Node', entity_id: 217, label: 'node8.brq' },
      ],
      envelope: { status: true, response: {} },
    });

    renderSummary({
      id: 1431,
      begins_at: '2026-08-07T18:11:00Z',
      duration: 30,
      type: 'unplanned_outage',
      state: 'announced',
      impact: 'system_reset',
      cs_summary: 'Načtení livepatche se nepovedlo',
      en_summary: 'Livepatch load gone wrong',
      affected: true,
    });

    const card = screen.getByTestId('outage.compact-summary');
    expect(within(card).getByRole('link', { name: 'Načtení livepatche se nepovedlo' })).toHaveAttribute(
      'href',
      '/outages/1431',
    );
    expect(card).toHaveTextContent('Aktivní');
    expect(card).toHaveTextContent('Neplánovaný výpadek');
    expect(card).toHaveTextContent('Restart systému');
    expect(card).toHaveTextContent('Délka30 min');
    expect(card).toHaveTextContent('Týká se mě');
    expect(card).not.toHaveTextContent('unplanned_outage');
    expect(card).not.toHaveTextContent('system_reset');

    await waitFor(() => expect(screen.getByTestId('outage.compact-summary.systems')).toHaveTextContent('node5.brq'));
    expect(screen.getByTestId('outage.compact-summary.systems')).toHaveTextContent('node6.brq');
    expect(screen.getByTestId('outage.compact-summary.systems')).toHaveTextContent('+2');
    expect(screen.getByTestId('outage.compact-summary.systems')).not.toHaveTextContent('node7.brq');
    expect(fetchOutageEntities).toHaveBeenCalledWith(1431);
  });

  it('keeps the outage usable when affected systems cannot be loaded', async () => {
    vi.mocked(fetchOutageEntities).mockRejectedValue(new Error('offline'));

    renderSummary({
      id: 9,
      begins_at: '2026-08-07T18:11:00Z',
      state: 'announced',
      cs_summary: 'Výpadek API',
    });

    expect(screen.getByRole('link', { name: 'Výpadek API' })).toBeVisible();
    await waitFor(() => expect(screen.getByTestId('outage.compact-summary.systems')).toHaveTextContent('—'));
  });
});
