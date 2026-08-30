import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchContextualHelpBoxes } from './helpBoxes';
import { fetchNews, fetchOutages, fetchPublicStats } from './public';

function makeOkResponse(response: unknown) {
  return new Response(JSON.stringify({ status: true, response }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFetch() {
  const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
    const [url] = args;
    const href = String(url);

    if (href.endsWith('/cluster/public_stats')) {
      return makeOkResponse({ public_stats: { user_count: 1, vps_count: 2, ipv4_left: 3 } });
    }

    if (href.includes('/outages?')) {
      return makeOkResponse({ outages: [] });
    }

    if (href.includes('/news_logs?')) {
      return makeOkResponse({ news_logs: [] });
    }

    if (href.includes('/help_boxes?')) {
      return makeOkResponse({ help_boxes: [] });
    }

    throw new Error(`unexpected fetch ${href}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.vpsAdmin = undefined;
});

describe('public API helpers', () => {
  it('loads public data without downloading the HaveAPI description', async () => {
    window.vpsAdmin = {
      api: { url: 'https://api.example.test', version: 'v7.0' },
      sessionToken: 'must-not-leak-to-public-help',
    };
    const fetchMock = installFetch();

    await fetchPublicStats();
    await fetchOutages({ limit: 25 });
    await fetchNews({ limit: 5 });
    await fetchContextualHelpBoxes('public', 'index', 'public');

    expect(fetchMock).toHaveBeenCalledTimes(4);

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual([
      'https://api.example.test/v7.0/cluster/public_stats',
      'https://api.example.test/v7.0/outages?outage%5Blimit%5D=25',
      'https://api.example.test/v7.0/news_logs?news_log%5Blimit%5D=5',
      'https://api.example.test/v7.0/help_boxes?help_box%5Bpage%5D=public&help_box%5Baction%5D=index&help_box%5Bview%5D=true',
    ]);

    expect(urls.some((url) => url === 'https://api.example.test/v7.0' || url === 'https://api.example.test/v7.0/')).toBe(false);
    expect(urls.some((url) => url === 'https://api.example.test' || url === 'https://api.example.test/')).toBe(false);

    for (const [, init] of fetchMock.mock.calls) {
      const headers = new Headers(init?.headers);
      expect(headers.get('X-HaveAPI-Auth-Token')).toBeNull();
      expect(headers.get('Authorization')).toBeNull();
    }
  });

  it('loads contextual help through the authenticated client with the configured exact header', async () => {
    window.vpsAdmin = {
      api: { url: 'https://api.example.test', version: 'v7.0' },
      sessionToken: 'exact-session-token',
      webuiNext: {
        haveApi: {
          authHeader: 'X-Configured-Auth-Header',
          metaNamespace: '_meta',
        },
      },
    };
    const fetchMock = installFetch();

    await fetchContextualHelpBoxes('vps', 'show', 'authenticated');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://api.example.test/v7.0/help_boxes?help_box%5Bpage%5D=vps&help_box%5Baction%5D=show&help_box%5Bview%5D=true'
    );
    const headers = new Headers(init?.headers);
    expect(headers.get('X-Configured-Auth-Header')).toBe('exact-session-token');
    expect(headers.get('X-HaveAPI-Auth-Token')).toBeNull();
  });
});
