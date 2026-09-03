import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test.describe('Blocking action progress modal', () => {
  test('keeps a non-blocking tracked action in Tasks without opening the progress modal', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'test', level: 1 },
      handlers: {
        'GET action_states/41': () => ({
          action_state: {
            id: 41,
            label: 'Background task',
            status: true,
            finished: false,
            current: 1,
            total: 2,
            created_at: '2026-01-26T12:00:00Z',
            updated_at: '2026-01-26T12:00:01Z',
          },
        }),
      },
    });

    await page.goto('/app/action-states/41');

    await page.getByTestId('action_state.detail.track').click();

    await expect(page.getByTestId('action_state.detail.dismiss')).toBeVisible();
    await expect(page.getByTestId('modal.action_progress')).toBeHidden();

    await page.getByTestId('action_state.detail.open_tasks').click();
    await expect(page.getByTestId('tasks.drawer')).toBeVisible();
    await expect(page.getByTestId('tasks.row.41')).toBeVisible();
    await expect(page.getByTestId('modal.action_progress')).toBeHidden();
  });

  test('opens and closes the blocking progress modal for start VPS', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    let showCalls = 0;

    await installHaveApiMock(page, {
      user: { id: 1, login: 'test', level: 1 },
      handlers: {
        // VPS detail deps
        'GET vpses/1': () => ({
          vps: {
            id: 1,
            hostname: 'vps1.example',
            object_state: 'active',
            is_running: false,
            node: { id: 10, domain_name: 'node1.example', location: { label: 'Prague' } },
            user: { id: 1, login: 'test' },
            memory: 2048,
            diskspace: 20480,
          },
        }),
        'GET vpses/1/statuses': () => [],
        'GET ip_addresses': () => [
          { id: 1, addr: '203.0.113.10', family: 4, network: { role: 'public', purpose: 'public' } },
        ],

        // Action
        'POST vpses/1/start': () => ({ _meta: { action_state_id: 42 } }),

        // Progress polling
        'GET action_states/42': () => {
          showCalls += 1;
          if (showCalls === 1) {
            return {
              action_state: {
                id: 42,
                label: 'Start',
                status: true,
                finished: false,
                current: 1,
                total: 2,
                created_at: '2026-01-26T12:00:00Z',
                updated_at: '2026-01-26T12:00:01Z',
              },
            };
          }

          return {
            action_state: {
              id: 42,
              label: 'Start',
              status: true,
              finished: true,
              current: 2,
              total: 2,
              created_at: '2026-01-26T12:00:00Z',
              updated_at: '2026-01-26T12:00:02Z',
            },
          };
        },
      },
    });

    await page.goto('/app/vps/1');

    // Trigger a blocking action.
    await expect(page.getByTestId('vps.action.start')).toBeVisible();
    await page.getByTestId('vps.action.start').click();

    // Modal should show up while the task is running.
    await expect(page.getByTestId('modal.action_progress')).toBeVisible();

    // The modal can be dismissed to continue in background.
    await expect(page.getByTestId('modal.action_progress.continue')).toBeVisible();

    // It should auto-close once the action finishes.
    await expect(page.getByTestId('modal.action_progress')).toBeHidden();
  });
});
