import { describe, expect, test } from 'vitest';

import {
  addHandlerSelection,
  addScopeSelection,
  classifyOutage,
  desiredOutageSystems,
  groupOutages,
  initOutageSystemsForm,
  fromOutageDateTimeInput,
  toOutageDateTimeInput,
} from './outageAdminModel';

describe('outage admin model', () => {
  test('deduplicates scope and handler selections', () => {
    const node = { kind: 'Node' as const, id: 12, label: 'node12.prg' };
    expect(addScopeSelection(addScopeSelection([], node), node)).toEqual([node]);
    expect(addHandlerSelection(addHandlerSelection([], { id: 42, label: 'Operator' }), { id: 42, label: 'Changed label' }))
      .toEqual([{ id: 42, label: 'Operator' }]);
  });

  test('maps structured selections to the outage API payload', () => {
    expect(desiredOutageSystems({
      scope: [
        { kind: 'Environment', id: 2, label: 'Production' },
        { kind: 'Node', id: 12, label: 'node12.prg' },
        { kind: 'Custom', id: null, label: 'External status page', apiName: 'External status page' },
      ],
      handlers: [{ id: 42, label: 'Operator' }],
    })).toEqual({
      entities: [
        { name: 'Environment', entity_id: 2 },
        { name: 'Node', entity_id: 12 },
        { name: 'External status page' },
      ],
      handlers: [42],
    });
  });

  test('round-trips API timestamps through a datetime-local field without timezone drift', () => {
    const apiTimestamp = '2026-06-02T10:00:00.000Z';
    expect(fromOutageDateTimeInput(toOutageDateTimeInput(apiTimestamp))).toBe(apiTimestamp);
  });

  test('restores existing API entities and handlers as labeled selections', () => {
    expect(initOutageSystemsForm(
      [
        { id: 1, name: 'Node', entity_id: 12, label: 'node12.prg' },
        { id: 2, name: 'External status page', entity_id: null },
      ],
      [{ id: 3, user_id: 42, full_name: 'Operator' }]
    )).toEqual({
      scope: [
        { kind: 'Node', id: 12, label: 'node12.prg', apiName: undefined },
        { kind: 'Custom', id: null, label: 'External status page', apiName: 'External status page' },
      ],
      handlers: [{ id: 42, label: 'Operator' }],
    });
  });

  test('groups active, future/staged and finished outages', () => {
    const now = new Date('2026-08-28T12:00:00.000Z');
    const rows = [
      { id: 1, state: 'announced', begins_at: '2026-08-28T10:00:00.000Z' },
      { id: 2, state: 'announced', begins_at: '2026-08-29T10:00:00.000Z' },
      { id: 3, state: 'staged' },
      { id: 4, state: 'resolved' },
      { id: 5, state: 'cancelled' },
    ];

    expect(classifyOutage(rows[0]!, now)).toBe('active');
    expect(groupOutages(rows, now)).toEqual({
      active: [rows[0]],
      planned: [rows[1], rows[2]],
      finished: [rows[3], rows[4]],
    });
  });
});
