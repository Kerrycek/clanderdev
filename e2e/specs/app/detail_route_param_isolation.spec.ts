import { expect, test, type Page } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

async function navigateWithinApp(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect.poll(() => new URL(page.url()).pathname).toBe(path);
}

function runningAction(id: number) {
  return {
    id,
    label: `Action ${id}`,
    state: 'running',
    can_cancel: true,
    current: 1,
    total: 2,
    finished: false,
    status: true,
  };
}

function monitoredEvent(id: number) {
  return {
    id,
    label: `Monitor ${id}`,
    monitor: `monitor-${id}`,
    state: 'confirmed',
    created_at: '2026-08-30T18:00:00.000Z',
    updated_at: '2026-08-30T18:01:00.000Z',
  };
}

function outage(id: number) {
  return {
    id,
    begins_at: '2026-08-30T18:00:00.000Z',
    duration: 30,
    type: 'planned_outage',
    impact: 'network',
    state: 'staged',
    en_summary: `Outage ${id}`,
    cs_summary: `Výpadek ${id}`,
  };
}

test.describe('@workflow-matrix stateful detail route isolation', () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
  });

  test('drops an action-state cancel confirmation when the route object changes', async ({ page }) => {
    const mutations: string[] = [];
    await installHaveApiMock(page, {
      user: { id: 1, login: 'user', level: 1 },
      handlers: {
        'GET action_states/101': () => ({ action_state: runningAction(101) }),
        'GET action_states/102': () => ({ action_state: runningAction(102) }),
        'POST action_states/101/cancel': () => ({}),
        'POST action_states/102/cancel': () => ({}),
      },
    });
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/action_states/')) mutations.push(request.url());
    });

    await page.goto('/app/action-states/101');
    await page.getByTestId('action_state.detail.cancel').click();
    await expect(page.getByTestId('tasks.cancel_dialog')).toBeVisible();

    await navigateWithinApp(page, '/app/action-states/102');
    await expect(page.getByTestId('action_state.detail.header')).toContainText('Action 102');
    await expect(page.getByTestId('tasks.cancel_dialog')).toHaveCount(0);
    expect(mutations).toEqual([]);
  });

  test('drops both monitoring acknowledgement drafts when the event changes', async ({ page }) => {
    const mutations: string[] = [];
    await installHaveApiMock(page, {
      user: { id: 1, login: 'user', level: 1 },
      handlers: {
        'GET monitored_events/201': () => ({ monitored_event: monitoredEvent(201) }),
        'GET monitored_events/201/logs': () => ({ logs: [] }),
        'GET monitored_events/202': () => ({ monitored_event: monitoredEvent(202) }),
        'GET monitored_events/202/logs': () => ({ logs: [] }),
        'POST monitored_events/201/acknowledge': () => ({}),
        'POST monitored_events/201/ignore': () => ({}),
        'POST monitored_events/202/acknowledge': () => ({}),
        'POST monitored_events/202/ignore': () => ({}),
      },
    });
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/monitored_events/')) mutations.push(request.url());
    });

    await page.goto('/app/monitoring/201');
    await expect(page.getByTestId('monitoring.event.summary')).toContainText('Monitor 201');
    await page.getByTestId('monitoring.event.ack.open').click();
    await expect(page.getByTestId('monitoring.event.ack')).toBeVisible();

    await navigateWithinApp(page, '/app/monitoring/202');
    await expect(page.getByTestId('monitoring.event.summary')).toContainText('Monitor 202');
    await expect(page.getByTestId('monitoring.event.ack')).toHaveCount(0);

    await page.getByTestId('monitoring.event.ignore.open').click();
    await expect(page.getByTestId('monitoring.event.ignore')).toBeVisible();
    await navigateWithinApp(page, '/app/monitoring/201');
    await expect(page.getByTestId('monitoring.event.summary')).toContainText('Monitor 201');
    await expect(page.getByTestId('monitoring.event.ignore')).toHaveCount(0);
    expect(mutations).toEqual([]);
  });

  for (const routePrefix of ['/admin/ip-addresses', '/admin/networking/ip-addresses']) {
    test(`drops a host-IP delete confirmation on ${routePrefix} when the address changes`, async ({ page }) => {
      const mutations: string[] = [];
      await installHaveApiMock(page, {
        user: { id: 1, login: 'admin', level: 100 },
        handlers: {
          'GET ip_addresses/301': () => ({
            ip_address: { id: 301, addr: '203.0.113.31', prefix: 32, routed: false },
          }),
          'GET ip_addresses/302': () => ({
            ip_address: { id: 302, addr: '203.0.113.32', prefix: 32, routed: false },
          }),
          'GET host_ip_addresses': ({ searchParams }) => {
            const selectedIp = [...searchParams.entries()].find(([key]) => key.includes('ip_address'))?.[1];
            const id = selectedIp === '302' ? 702 : 701;
            return {
              host_ip_addresses: [{
                id,
                addr: `203.0.113.${id === 702 ? '42' : '41'}`,
                assigned: false,
                user_created: true,
              }],
            };
          },
          'GET environments': () => ({ environments: [] }),
          'DELETE host_ip_addresses/701': () => ({}),
          'DELETE host_ip_addresses/702': () => ({}),
        },
      });
      page.on('request', (request) => {
        if (request.method() !== 'GET' && /\/api\/v7\.0\/(?:host_)?ip_addresses\//.test(request.url())) {
          mutations.push(request.url());
        }
      });

      await page.goto(`${routePrefix}/301`);
      await page.getByTestId('admin.ip.hosts.row.701.delete').click();
      await expect(page.getByRole('dialog')).toBeVisible();

      await navigateWithinApp(page, `${routePrefix}/302`);
      await expect(page.getByTestId('admin.ip_address.header')).toContainText('203.0.113.32');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(mutations).toEqual([]);
    });
  }

  test('drops outage state and update confirmations when the outage changes', async ({ page }) => {
    const mutations: string[] = [];
    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 100 },
      handlers: {
        'GET outages/401': () => ({ outage: outage(401) }),
        'GET outages/402': () => ({ outage: outage(402) }),
        'GET outages/401/entities': () => ({ entities: [{ id: 1, name: 'Node', entity_id: 10 }] }),
        'GET outages/402/entities': () => ({ entities: [{ id: 2, name: 'Node', entity_id: 11 }] }),
        'GET outages/401/handlers': () => ({ handlers: [{ id: 3, full_name: 'Operator A' }] }),
        'GET outages/402/handlers': () => ({ handlers: [{ id: 4, full_name: 'Operator B' }] }),
        'GET outage_updates': () => ({ outage_updates: [] }),
        'GET user_outages': () => ({ user_outages: [] }),
        'GET vps_outages': () => ({ vps_outages: [] }),
        'GET export_outages': () => ({ export_outages: [] }),
        'GET outage_security_advisories': () => ({ outage_security_advisories: [] }),
        'POST outage_updates': () => ({}),
      },
    });
    page.on('request', (request) => {
      if (request.method() !== 'GET' && /\/api\/v7\.0\/(?:outages|outage_)/.test(request.url())) {
        mutations.push(request.url());
      }
    });

    await page.goto('/admin/outages/401');
    await expect(page.getByTestId('admin.outages.detail.page')).toContainText('Outage 401');
    await page.getByTestId('admin.outages.change_state.cancelled').click();
    await expect(page.getByTestId('admin.outages.change_state.confirm')).toBeVisible();

    await navigateWithinApp(page, '/admin/outages/402');
    await expect(page.getByTestId('admin.outages.detail.page')).toContainText('Outage 402');
    await expect(page.getByTestId('admin.outages.change_state.confirm')).toHaveCount(0);

    await page.getByTestId('admin.outages.detail.post_update').click();
    await page.getByTestId('admin.outages.form.en_summary').fill('Update for outage 402');
    await page.getByTestId('admin.outages.form.cs_summary').fill('Aktualizace výpadku 402');
    await page.getByTestId('admin.outages.update.save').click();
    await expect(page.getByTestId('admin.outages.update.confirm')).toBeVisible();

    await navigateWithinApp(page, '/admin/outages/401');
    await expect(page.getByTestId('admin.outages.detail.page')).toContainText('Outage 401');
    await expect(page.getByTestId('admin.outages.update.confirm')).toHaveCount(0);
    await expect(page.getByTestId('admin.outages.update.modal')).toHaveCount(0);
    expect(mutations).toEqual([]);
  });
});
