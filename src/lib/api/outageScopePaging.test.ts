import { describe, expect, test, vi } from 'vitest';

import { fetchAllOutageEntities } from './outageScopePaging';

function haveApiResponse(response: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ status: true, response }),
  };
}

describe('outage scope paging', () => {
  test('reads every keyset page of an outage scope', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: 'Node',
      entity_id: index + 1,
    }));
    const fetchMock = vi.fn().mockImplementation(async (input: string) => {
      const url = new URL(input);
      const fromId = url.searchParams.get('entity[from_id]');
      if (fromId === null) {
        return haveApiResponse({ entities: firstPage, _meta: { total_count: 101 } });
      }
      if (fromId === '100') {
        return haveApiResponse({
          entities: [{ id: 101, name: 'Node', entity_id: 101 }],
          _meta: { total_count: 101 },
        });
      }
      throw new Error(`Unexpected cursor ${fromId}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await fetchAllOutageEntities(7);

    expect(result).toHaveLength(101);
    expect(result.at(-1)?.id).toBe(101);
    const entityCalls = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname.endsWith('/outages/7/entities'));
    expect(entityCalls).toHaveLength(2);
    expect(entityCalls[0]?.searchParams.get('entity[limit]')).toBe('100');
    expect(entityCalls[0]?.searchParams.get('entity[from_id]')).toBeNull();
    expect(entityCalls[0]?.searchParams.get('_meta[count]')).toBe('true');
    expect(entityCalls[1]?.searchParams.get('entity[from_id]')).toBe('100');
  });
});
