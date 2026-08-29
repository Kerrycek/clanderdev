import { describe, expect, test, vi } from 'vitest';

import {
  applyOutageSystems,
  createOutage,
  createOutageWithSystems,
  createOutageEntity,
  createOutageHandler,
  createOutageUpdate,
  deleteOutageEntity,
  deleteOutageHandler,
  fetchAdminOutages,
  fetchOutageComponents,
  OutageCreateIndeterminateError,
  OutageCreateWithSystemsError,
  OutageScopeReadError,
  OutageSystemsApplyError,
  outageStateTransitionPayload,
  rebuildOutageAffectedVps,
  updateOutage,
} from './outages';
import { addNetworkAddresses } from './networks';

function mockFetchOk(response: unknown): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, response }) }) as unknown as typeof globalThis.fetch;
}

function mockFetchOkSequence(responses: any[]) {
  const queue = [...responses];
  return vi.fn().mockImplementation(async () => {
    const response = queue.shift() ?? {};
    return { ok: true, json: async () => ({ status: true, response }) };
  });
}

function lastFetchCall() {
  const calls = (globalThis.fetch as any).mock.calls;
  return calls[calls.length - 1] as [string, RequestInit?];
}

function haveApiResponse(response: unknown, status = true, message?: string) {
  return {
    ok: true,
    status: 200,
    json: async () => status
      ? ({ status: true, response })
      : ({ status: false, message: message ?? 'Request failed', response: null }),
  };
}

function scopeResponse(key: 'entities' | 'handlers', rows: unknown[], total = rows.length) {
  return { [key]: rows, _meta: { total_count: total } };
}

describe('outage admin API wrappers', () => {
  test('fetchAdminOutages forwards supported filters through the outage namespace', async () => {
    globalThis.fetch = mockFetchOk({ outages: [{ id: 7 }] }) as any;

    await fetchAdminOutages({ state: 'announced', type: 'planned_outage', handledBy: 42, vps: 101, limit: 25, fromId: 900 });

    const [url] = lastFetchCall();
    const u = new URL(url);
    expect(u.pathname).toBe('/v7.0/outages');
    expect(u.searchParams.get('outage[state]')).toBe('announced');
    expect(u.searchParams.get('outage[type]')).toBe('planned_outage');
    expect(u.searchParams.get('outage[handled_by]')).toBe('42');
    expect(u.searchParams.get('outage[vps]')).toBe('101');
    expect(u.searchParams.get('outage[limit]')).toBe('25');
    expect(u.searchParams.get('outage[from_id]')).toBe('900');
  });

  test('create and update outage use the outage namespace payload', async () => {
    globalThis.fetch = mockFetchOk({ outage: { id: 7 } }) as any;

    await createOutage({
      begins_at: '2026-05-28T10:00:00.000Z',
      duration: 30,
      type: 'planned_outage',
      impact: 'network',
      auto_resolve: true,
      en_summary: 'Maintenance',
    });

    let [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/outages');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      outage: {
        begins_at: '2026-05-28T10:00:00.000Z',
        duration: 30,
        type: 'planned_outage',
        impact: 'network',
        auto_resolve: true,
        en_summary: 'Maintenance',
      },
    });

    await updateOutage(7, { finished_at: '2026-05-28T11:00:00.000Z', auto_resolve: false });
    [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/outages/7');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      outage: {
        finished_at: '2026-05-28T11:00:00.000Z',
        auto_resolve: false,
      },
    });
  });

  test('component lookup uses the public component contract', async () => {
    globalThis.fetch = mockFetchOk({ components: [{ id: 4, name: 'webui', label: 'WebUI' }] });

    const result = await fetchOutageComponents({ limit: 250 });

    const [url] = lastFetchCall();
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/v7.0/components');
    expect(parsed.searchParams.get('component[limit]')).toBe('250');
    expect(result.data).toEqual([{ id: 4, name: 'webui', label: 'WebUI' }]);
  });

  test('entity and handler wrappers match nested outage contracts', async () => {
    globalThis.fetch = mockFetchOk({ entity: { id: 3 }, handler: { id: 4 } }) as any;

    await createOutageEntity(7, { name: 'Node', entity_id: 12 });
    let [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/outages/7/entities');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ entity: { name: 'Node', entity_id: 12 } });

    await deleteOutageEntity(7, 3);
    [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/outages/7/entities/3');
    expect(init?.method).toBe('DELETE');

    await createOutageHandler(7, { user: 42 });
    [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/outages/7/handlers');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ handler: { user: 42 } });

    await deleteOutageHandler(7, 4);
    [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/outages/7/handlers/4');
    expect(init?.method).toBe('DELETE');
  });

  test('outage updates and rebuild use legacy endpoints', async () => {
    globalThis.fetch = mockFetchOk({ outage_update: { id: 8 }, outage: { id: 7 } }) as any;

    await createOutageUpdate({ outage: 7, state: 'resolved', send_mail: true, en_summary: 'Resolved' });
    let [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/outage_updates');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      outage_update: {
        outage: 7,
        state: 'resolved',
        send_mail: true,
        en_summary: 'Resolved',
      },
    });

    await rebuildOutageAffectedVps(7);
    [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/outages/7/rebuild_affected_vps');
    expect(init?.method).toBe('POST');
  });

  test('state transitions send only the fields accepted by the transition contract', async () => {
    globalThis.fetch = mockFetchOk({ outage_update: { id: 8 } });

    await createOutageUpdate(outageStateTransitionPayload(7, 'cancelled'));

    const [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/outage_updates');
    expect(JSON.parse(String(init?.body))).toEqual({
      outage_update: {
        outage: 7,
        state: 'cancelled',
        send_mail: true,
      },
    });
  });

  test('createOutageWithSystems creates the report, applies initial entities and handlers, and rebuilds', async () => {
    globalThis.fetch = mockFetchOkSequence([
      { outage: { id: 7 } },
      scopeResponse('entities', []),
      scopeResponse('handlers', []),
      { entity: { id: 3 } },
      { entity: { id: 4 } },
      { handler: { id: 5 } },
      { outage: { id: 7 } },
    ]) as any;

    await createOutageWithSystems(
      {
        begins_at: '2026-05-28T10:00:00.000Z',
        duration: 30,
        type: 'planned_outage',
        impact: 'network',
        en_summary: 'Maintenance',
        cs_summary: 'Udrzba',
      },
      {
        entities: [
          { name: 'Environment', entity_id: 2 },
          { name: 'Node', entity_id: 12 },
        ],
        handlers: [42],
      }
    );

    const calls = (globalThis.fetch as any).mock.calls as Array<[string, RequestInit?]>;
    expect(calls.map(([url]) => new URL(url).pathname)).toEqual([
      '/v7.0/outages',
      '/v7.0/outages/7/entities',
      '/v7.0/outages/7/handlers',
      '/v7.0/outages/7/entities',
      '/v7.0/outages/7/entities',
      '/v7.0/outages/7/handlers',
      '/v7.0/outages/7/rebuild_affected_vps',
    ]);
    expect(JSON.parse(String(calls[3]?.[1]?.body))).toEqual({ entity: { name: 'Environment', entity_id: 2 } });
    expect(JSON.parse(String(calls[4]?.[1]?.body))).toEqual({ entity: { name: 'Node', entity_id: 12 } });
    expect(JSON.parse(String(calls[5]?.[1]?.body))).toEqual({ handler: { user: 42 } });
  });

  test('applyOutageSystems diffs current systems and handlers before rebuild', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      const path = new URL(input).pathname;
      const method = init?.method ?? 'GET';
      if (method === 'GET' && path.endsWith('/entities')) {
        return haveApiResponse(scopeResponse('entities', [
          { id: 1, name: 'Environment', entity_id: 2 },
          { id: 2, name: 'Node', entity_id: 10 },
        ]));
      }
      if (method === 'GET' && path.endsWith('/handlers')) {
        return haveApiResponse(scopeResponse('handlers', [
          { id: 4, user: { id: 42 } },
          { id: 5, user: { id: 99 } },
        ]));
      }
      if (method === 'POST' && path.endsWith('/entities')) return haveApiResponse({ entity: { id: 9 } });
      if (method === 'POST' && path.endsWith('/handlers')) return haveApiResponse({ handler: { id: 8 } });
      if (method === 'DELETE') return haveApiResponse(null);
      if (method === 'POST' && path.endsWith('/rebuild_affected_vps')) return haveApiResponse({ outage: { id: 7 } });
      throw new Error(`Unexpected request: ${method} ${path}`);
    }) as unknown as typeof globalThis.fetch;

    await applyOutageSystems(
      7,
      {
        entities: [
          { name: 'Environment', entity_id: 2 },
          { name: 'Node', entity_id: 12 },
        ],
        handlers: [42, 100],
      }
    );

    const calls = (globalThis.fetch as any).mock.calls as Array<[string, RequestInit?]>;
    expect(calls.map(([url]) => new URL(url).pathname)).toEqual([
      '/v7.0/outages/7/entities',
      '/v7.0/outages/7/handlers',
      '/v7.0/outages/7/entities',
      '/v7.0/outages/7/handlers',
      '/v7.0/outages/7/entities/2',
      '/v7.0/outages/7/handlers/5',
      '/v7.0/outages/7/rebuild_affected_vps',
    ]);
    expect(JSON.parse(String(calls[2]?.[1]?.body))).toEqual({ entity: { name: 'Node', entity_id: 12 } });
    expect(JSON.parse(String(calls[3]?.[1]?.body))).toEqual({ handler: { user: 100 } });
    expect(calls[4]?.[1]?.method).toBe('DELETE');
    expect(calls[5]?.[1]?.method).toBe('DELETE');
  });

  test('applyOutageSystems restores the exact original scope after an ambiguous partial failure', async () => {
    let entities: any[] = [
      { id: 1, name: 'Environment', entity_id: 2 },
      { id: 2, name: 'Node', entity_id: 10 },
    ];
    let handlers: any[] = [
      { id: 4, user: { id: 42 } },
      { id: 5, user_id: 99 },
    ];
    let nextEntityId = 9;
    let nextHandlerId = 8;
    let failWantedHandler = true;

    globalThis.fetch = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      const path = new URL(input).pathname;
      const method = init?.method ?? 'GET';
      if (method === 'GET' && path === '/v7.0/outages/7/entities') {
        return haveApiResponse(scopeResponse('entities', structuredClone(entities)));
      }
      if (method === 'GET' && path === '/v7.0/outages/7/handlers') {
        return haveApiResponse(scopeResponse('handlers', structuredClone(handlers)));
      }
      if (method === 'POST' && path === '/v7.0/outages/7/entities') {
        const body = JSON.parse(String(init?.body));
        const entity = { id: nextEntityId++, ...body.entity };
        entities.push(entity);
        return haveApiResponse({ entity });
      }
      if (method === 'POST' && path === '/v7.0/outages/7/handlers') {
        const body = JSON.parse(String(init?.body));
        const handler = { id: nextHandlerId++, user_id: body.handler.user };
        handlers.push(handler);
        if (failWantedHandler && body.handler.user === 100) {
          failWantedHandler = false;
          // The server committed the handler but the client received a failure.
          return haveApiResponse(null, false, 'response lost after commit');
        }
        return haveApiResponse({ handler });
      }
      if (method === 'DELETE' && path.startsWith('/v7.0/outages/7/entities/')) {
        const id = Number(path.split('/').at(-1));
        entities = entities.filter((entity) => entity.id !== id);
        return haveApiResponse(null);
      }
      if (method === 'DELETE' && path.startsWith('/v7.0/outages/7/handlers/')) {
        const id = Number(path.split('/').at(-1));
        handlers = handlers.filter((handler) => handler.id !== id);
        return haveApiResponse(null);
      }
      if (method === 'POST' && path === '/v7.0/outages/7/rebuild_affected_vps') {
        return haveApiResponse({ outage: { id: 7 } });
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    }) as unknown as typeof globalThis.fetch;

    const result = applyOutageSystems(
      7,
      {
        entities: [
          { name: 'Environment', entity_id: 2 },
          { name: 'Node', entity_id: 12 },
        ],
        handlers: [42, 100],
      }
    );

    await expect(result).rejects.toMatchObject({
      name: 'OutageSystemsApplyError',
      outageId: 7,
      rollbackSucceeded: true,
    } satisfies Partial<OutageSystemsApplyError>);
    expect(entities).toEqual([
      { id: 1, name: 'Environment', entity_id: 2 },
      { id: 2, name: 'Node', entity_id: 10 },
    ]);
    expect(handlers).toEqual([
      { id: 4, user: { id: 42 } },
      { id: 5, user_id: 99 },
    ]);
  });

  test('applyOutageSystems reports a partial state when compensation also fails', async () => {
    const currentEntities = [{ id: 1, name: 'Node', entity_id: 10 }];
    let entities: any[] = structuredClone(currentEntities);
    let handlerCommitted = false;

    globalThis.fetch = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      const path = new URL(input).pathname;
      const method = init?.method ?? 'GET';
      if (method === 'POST' && path === '/v7.0/outages/7/entities') {
        entities.push({ id: 9, name: 'Node', entity_id: 12 });
        return haveApiResponse({ entity: entities.at(-1) });
      }
      if (method === 'POST' && path === '/v7.0/outages/7/handlers') {
        handlerCommitted = true;
        return haveApiResponse(null, false, 'handler failed');
      }
      if (method === 'GET' && path === '/v7.0/outages/7/entities') {
        return haveApiResponse(scopeResponse('entities', structuredClone(entities)));
      }
      if (method === 'GET' && path === '/v7.0/outages/7/handlers') {
        return haveApiResponse(scopeResponse('handlers', handlerCommitted ? [{ id: 8, user: { id: 100 } }] : []));
      }
      if (method === 'DELETE') return haveApiResponse(null, false, 'rollback delete failed');
      throw new Error(`Unexpected request: ${method} ${path}`);
    }) as unknown as typeof globalThis.fetch;

    await expect(applyOutageSystems(
      7,
      { entities: [{ name: 'Node', entity_id: 12 }], handlers: [100] }
    )).rejects.toMatchObject({
      name: 'OutageSystemsApplyError',
      outageId: 7,
      rollbackSucceeded: false,
    } satisfies Partial<OutageSystemsApplyError>);
  });

  test('createOutageWithSystems exposes the staged outage id when initial scope setup fails', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      const path = new URL(input).pathname;
      const method = init?.method ?? 'GET';
      if (method === 'POST' && path === '/v7.0/outages') {
        return haveApiResponse({ outage: { id: 7 } });
      }
      if (method === 'POST' && path === '/v7.0/outages/7/entities') {
        return haveApiResponse(null, false, 'scope rejected');
      }
      if (method === 'GET' && path === '/v7.0/outages/7/entities') {
        return haveApiResponse(scopeResponse('entities', []));
      }
      if (method === 'GET' && path === '/v7.0/outages/7/handlers') {
        return haveApiResponse(scopeResponse('handlers', []));
      }
      if (method === 'POST' && path === '/v7.0/outages/7/rebuild_affected_vps') {
        return haveApiResponse({ outage: { id: 7 } });
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    }) as unknown as typeof globalThis.fetch;

    await expect(createOutageWithSystems(
      {
        begins_at: '2026-05-28T10:00:00.000Z',
        duration: 30,
        type: 'planned_outage',
        impact: 'network',
        en_summary: 'Maintenance',
        cs_summary: 'Udrzba',
      },
      { entities: [{ name: 'Node', entity_id: 12 }], handlers: [] }
    )).rejects.toMatchObject({
      name: 'OutageCreateWithSystemsError',
      outageId: 7,
      rollbackSucceeded: true,
    } satisfies Partial<OutageCreateWithSystemsError>);
  });

  test('fails closed before mutation when complete scope pagination stalls', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const path = url.pathname;
      const method = init?.method ?? 'GET';
      if (method === 'GET' && path.endsWith('/entities')) {
        return haveApiResponse(scopeResponse('entities', [{ id: 1, name: 'Node', entity_id: 1 }], 2));
      }
      if (method === 'GET' && path.endsWith('/handlers')) return haveApiResponse(scopeResponse('handlers', []));
      throw new Error(`Mutation must not run: ${method} ${path}`);
    }) as unknown as typeof globalThis.fetch;

    await expect(applyOutageSystems(7, { entities: [], handlers: [] })).rejects.toBeInstanceOf(OutageScopeReadError);
    const methods = (globalThis.fetch as any).mock.calls.map((call: [string, RequestInit?]) => call[1]?.method ?? 'GET');
    expect(methods.every((method: string) => method === 'GET')).toBe(true);
  });

  test('marks a transport/server create failure as indeterminate and does not retry it', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ status: false, message: 'gateway response lost', response: null }),
    }) as unknown as typeof globalThis.fetch;

    await expect(createOutageWithSystems(
      { type: 'planned_outage', impact: 'network', en_summary: 'Maintenance' },
      { entities: [], handlers: [] }
    )).rejects.toBeInstanceOf(OutageCreateIndeterminateError);
    expect((globalThis.fetch as any).mock.calls).toHaveLength(1);
  });
});

describe('network add addresses API wrapper', () => {
  test('addNetworkAddresses posts network#add_addresses payload', async () => {
    globalThis.fetch = mockFetchOk({ network: { count: 4 } }) as any;

    await addNetworkAddresses({ id: 22, count: 4, user: 7, environment: 2 });

    const [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/networks/22/add_addresses');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      network: {
        count: 4,
        user: 7,
        environment: 2,
      },
    });
  });
});
