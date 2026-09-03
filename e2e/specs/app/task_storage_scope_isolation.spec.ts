import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

function runningAction(id: number, label: string) {
  return {
    id,
    label,
    status: true,
    finished: false,
    current: 1,
    total: 2,
    created_at: '2026-08-30T20:00:00.000Z',
    updated_at: '2026-08-30T20:00:01.000Z',
  };
}

function runningChain(id: number, label: string) {
  return { id, label, state: 'running', progress: 1, size: 2 };
}

test('Tasks persistence never crosses authenticated user scope after a new document login', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

  let currentUser = { id: 101, login: 'account-a', level: 1 };
  await installHaveApiMock(page, {
    handlers: {
      'GET users/current': () => ({ user: currentUser }),
      'GET vpses': () => ({ vpses: [] }),
      'GET action_states/1101': () => ({ action_state: runningAction(1101, 'Account A tracked task') }),
      'GET action_states/1102': () => ({ action_state: runningAction(1102, 'Account A pinned task') }),
      'GET transaction_chains/1103': () => ({ transaction_chain: runningChain(1103, 'Account A chain') }),
      'GET action_states/2201': () => ({ action_state: runningAction(2201, 'Account B tracked task') }),
      'GET action_states/2202': () => ({ action_state: runningAction(2202, 'Account B pinned task') }),
      'GET transaction_chains/2203': () => ({ transaction_chain: runningChain(2203, 'Account B chain') }),
      'GET action_states/9991': () => ({ action_state: runningAction(9991, 'Legacy account secret') }),
      'GET action_states/9992': () => ({ action_state: runningAction(9992, 'Legacy account lock') }),
      'GET transaction_chains/9993': () => ({ transaction_chain: runningChain(9993, 'Legacy account chain') }),
    },
  });

  await page.goto('/app/vps');
  await page.evaluate(() => {
    const tracked = (id: number, objectLabel: string) => [{
      id,
      addedAt: Date.now(),
      actionLabel: `Task ${id}`,
      objectLabel,
      object: { kind: 'Vps', id },
    }];

    sessionStorage.setItem('webui-next.tracked_action_states.user-101', JSON.stringify(tracked(1101, 'private-a.example')));
    localStorage.setItem('webui-next.pinned_action_states.user-101', JSON.stringify([1102]));
    localStorage.setItem('webui-next.pinned_transaction_chains.user-101', JSON.stringify([1103]));

    sessionStorage.setItem('webui-next.tracked_action_states.user-202', JSON.stringify(tracked(2201, 'private-b.example')));
    localStorage.setItem('webui-next.pinned_action_states.user-202', JSON.stringify([2202]));
    localStorage.setItem('webui-next.pinned_transaction_chains.user-202', JSON.stringify([2203]));
  });

  await page.reload();
  await page.getByTestId('tasks.open-button').click();
  await expect(page.getByTestId('tasks.row.1101')).toBeVisible();
  await expect(page.getByTestId('tasks.row.1102')).toBeVisible();
  await expect(page.getByTestId('tasks.chain.row.1103')).toBeVisible();

  // Values written by an older build are deliberately not attributable to
  // whichever account signs in next.
  await page.evaluate(() => {
    sessionStorage.setItem('webui-next.tracked_action_states', JSON.stringify([{
      id: 9991,
      addedAt: Date.now(),
      objectLabel: 'legacy-private.example',
      object: { kind: 'Vps', id: 9991 },
    }]));
    localStorage.setItem('webui-next.pinned_action_states', JSON.stringify([9991]));
    localStorage.setItem('webui-next.pinned_transaction_chains', JSON.stringify([9993]));
    sessionStorage.setItem('webui-next.local_locks', JSON.stringify([{
      key: 'Vps:9992',
      kind: 'Vps',
      id: 9992,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + 60 * 60 * 1000,
      actionStateId: 9992,
    }]));
  });

  // Real logout/login performs a hard navigation. about:blank first proves no
  // requests can be attributed to the old live document during the B audit.
  await page.goto('about:blank');
  currentUser = { id: 202, login: 'account-b', level: 1 };
  const accountBRequests: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/\/(?:action_states|transaction_chains)\/(?:110[123]|999[123])$/.test(pathname)) {
      accountBRequests.push(pathname);
    }
  });

  await page.goto('/app/vps');
  await page.getByTestId('tasks.open-button').click();

  await expect(page.getByTestId('tasks.row.2201')).toBeVisible();
  await expect(page.getByTestId('tasks.row.2202')).toBeVisible();
  await expect(page.getByTestId('tasks.chain.row.2203')).toBeVisible();
  await expect(page.getByTestId('tasks.row.1101')).toHaveCount(0);
  await expect(page.getByTestId('tasks.row.1102')).toHaveCount(0);
  await expect(page.getByTestId('tasks.chain.row.1103')).toHaveCount(0);
  await expect(page.getByText('private-a.example')).toHaveCount(0);
  await expect(page.getByText('legacy-private.example')).toHaveCount(0);
  expect(accountBRequests).toEqual([]);

  expect(await page.evaluate(() => ({
    tracked: sessionStorage.getItem('webui-next.tracked_action_states'),
    actions: localStorage.getItem('webui-next.pinned_action_states'),
    chains: localStorage.getItem('webui-next.pinned_transaction_chains'),
    localLocks: sessionStorage.getItem('webui-next.local_locks'),
  }))).toEqual({ tracked: null, actions: null, chains: null, localLocks: null });
});
