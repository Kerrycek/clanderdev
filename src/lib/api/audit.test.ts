import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchObjectHistoryEvents } from './audit';

function installApiFixture() {
  window.vpsAdmin = {
    api: { url: 'https://api.example.test', version: 'v7.0' },
    sessionToken: 'tok_123',
    description: {
      meta: { namespace: '_meta' },
      authentication: { token: { http_header: 'X-Auth-Token' } },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  window.vpsAdmin = undefined;
});

describe('fetchObjectHistoryEvents', () => {
  it('requests an exact count alongside the active audit filters', async () => {
    installApiFixture();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          response: { object_histories: [], _meta: { total_count: 125 } },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await fetchObjectHistoryEvents({
      limit: 25,
      fromId: 101,
      eventType: 'update',
      count: true,
    });

    expect(result.meta).toEqual({ total_count: 125 });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get('object_history[limit]')).toBe('25');
    expect(url.searchParams.get('object_history[from_id]')).toBe('101');
    expect(url.searchParams.get('object_history[event_type]')).toBe('update');
    expect(url.searchParams.get('_meta[count]')).toBe('true');
  });

  it('never forwards unsupported full-text q to HaveAPI', async () => {
    installApiFixture();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: true, response: { object_histories: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const optionsWithUnsupportedQ = { q: 'update', limit: 25 };
    await fetchObjectHistoryEvents(optionsWithUnsupportedQ);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get('object_history[q]')).toBeNull();
  });
});
