import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test('@pr-smoke @pr-smoke-mobile admin live network center uses bounded API filters and stops polling', async ({ page }, testInfo) => {
  const monitorRequests: URL[] = [];
  const vpsRequests: URL[] = [];
  let monitorCall = 0;

  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET environments': () => ({ environments: [{ id: 2, label: 'Production' }] }),
      'GET locations': () => ({
        locations: [{ id: 3, label: 'Praha', environment: { id: 2, label: 'Production' } }],
      }),
      'GET nodes': () => ({
        nodes: [{ id: 4, domain_name: 'node4.example', fqdn: 'node4.example' }],
      }),
      'GET users': () => ({
        users: [{ id: 7, login: 'alice', full_name: 'Alice Operator' }],
      }),
      'GET vpses': (ctx) => {
        vpsRequests.push(new URL(ctx.url.href));
        return { vpses: [{ id: 5, hostname: 'noc-vps', user: { id: 7, login: 'alice' } }] };
      },
      'GET network_interfaces': () => ({
        network_interfaces: [{ id: 6, name: 'venet0', vps: { id: 5 } }],
      }),
      'GET network_interface_monitors': (ctx) => {
        monitorCall += 1;
        monitorRequests.push(new URL(ctx.url.href));
        return {
          network_interface_monitors: [
            {
              id: 901,
              bytes_in: 1_048_576 + monitorCall * 1_024,
              bytes_out: 524_288 + monitorCall * 1_024,
              packets_in: 400,
              packets_out: 250,
              delta: 10,
              updated_at: new Date().toISOString(),
              network_interface: {
                id: 6,
                name: 'venet0',
                vps: {
                  id: 5,
                  hostname: 'noc-vps',
                  user: { id: 7, login: 'alice' },
                  node: {
                    id: 4,
                    domain_name: 'node4.example',
                    location: { id: 3, label: 'Praha', environment: { id: 2, label: 'Production' } },
                  },
                },
              },
            },
          ],
        };
      },
    },
  });

  await page.goto('/admin/networking/live?environment=2&location=3&order=-bytes&limit=50');

  await expect(page.getByTestId('admin.network_live.dashboard')).toBeVisible();
  await expect(page).not.toHaveURL(/(?:\?|&)order=/);
  await expect(page.getByTestId('admin.network_live.kpi.in')).toContainText('/s');
  await expect(page.getByTestId('admin.network_live.kpi.out')).toContainText('/s');
  await expect(page.getByTestId('admin.network_live.chart.in')).toBeVisible();
  await expect(page.getByTestId('admin.network_live.chart.out')).toBeVisible();
  await expect(page.getByTestId('admin.network_live.filter.environment')).toHaveValue('2');
  await expect(page.getByTestId('admin.network_live.filter.location')).toHaveValue('3');

  await page.getByTestId('admin.network_live.filter.node').fill('node4');
  await expect(page.getByTestId('admin.network_live.filter.node.opt.4')).toContainText('node4.example');
  await page.getByTestId('admin.network_live.filter.node.opt.4').click();

  await page.getByTestId('admin.network_live.filter.user').fill('ali');
  await expect(page.getByTestId('admin.network_live.filter.user.opt.7')).toContainText('alice');
  await page.getByTestId('admin.network_live.filter.user.opt.7').click();

  await page.getByTestId('admin.network_live.filter.vps').fill('noc');
  await expect(page.getByTestId('admin.network_live.filter.vps.opt.5')).toContainText('noc-vps');
  await page.getByTestId('admin.network_live.filter.vps.opt.5').click();
  await expect.poll(() => vpsRequests.length).toBeGreaterThan(0);
  const vpsRequest = vpsRequests.at(-1)!;
  expect(vpsRequest.searchParams.get('vps[user]')).toBe('7');
  expect(vpsRequest.searchParams.get('vps[hostname_any]')).toBe('noc');

  await page.getByTestId('admin.network_live.filter.interface').selectOption('6');
  await expect(page.getByTestId('admin.network_live.filter.interface')).toHaveValue('6');
  await expect(page.getByTestId('admin.network_live.top.vps.5')).toContainText('noc-vps');
  await expect(page.getByTestId('admin.network_live.top.users.7')).toContainText('alice');
  await expect(page.getByTestId('admin.network_live.row.901')).toContainText('node4.example');

  const isFullyFilteredRequest = (request: URL) => (
    request.searchParams.get('network_interface_monitor[environment]') === '2' &&
    request.searchParams.get('network_interface_monitor[location]') === '3' &&
    request.searchParams.get('network_interface_monitor[node]') === '4' &&
    request.searchParams.get('network_interface_monitor[user]') === '7' &&
    request.searchParams.get('network_interface_monitor[vps]') === '5' &&
    request.searchParams.get('network_interface_monitor[network_interface]') === '6'
  );
  await expect.poll(() => monitorRequests.some(isFullyFilteredRequest)).toBe(true);

  const request = [...monitorRequests].reverse().find(isFullyFilteredRequest);
  expect(request).toBeDefined();
  expect([...request!.searchParams.keys()].some((key) => key.endsWith('[q]'))).toBe(false);
  expect(request!.searchParams.get('network_interface_monitor[environment]')).toBe('2');
  expect(request!.searchParams.get('network_interface_monitor[location]')).toBe('3');
  expect(request!.searchParams.get('network_interface_monitor[node]')).toBe('4');
  expect(request!.searchParams.get('network_interface_monitor[user]')).toBe('7');
  expect(request!.searchParams.get('network_interface_monitor[vps]')).toBe('5');
  expect(request!.searchParams.get('network_interface_monitor[network_interface]')).toBe('6');
  expect(request!.searchParams.get('network_interface_monitor[limit]')).toBe('50');
  expect(request!.searchParams.get('network_interface_monitor[order]')).toBe('-updated_at');

  await page.getByTestId('admin.network_live.toggle').click();
  await expect(page).toHaveURL(/paused=1/);
  const pausedRequestCount = monitorRequests.length;
  await page.waitForTimeout(10_500);
  expect(monitorRequests).toHaveLength(pausedRequestCount);

  await page.getByTestId('admin.network_live.toggle').click();
  await expect(page).not.toHaveURL(/paused=1/);
  await expect.poll(() => monitorRequests.length).toBeGreaterThan(pausedRequestCount);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('admin.network_live.status')).toContainText(/hidden|skryt/i);
  const hiddenRequestCount = monitorRequests.length;
  await page.waitForTimeout(10_500);
  expect(monitorRequests).toHaveLength(hiddenRequestCount);

  const screenshot = process.env.E2E_ADMIN_NETWORK_LIVE_SCREENSHOT?.trim();
  if (screenshot) {
    const suffix = testInfo.project.name === 'mobile-chrome' ? '-mobile' : '-desktop';
    await page.screenshot({ path: screenshot.replace(/\.png$/i, `${suffix}.png`), fullPage: true });
  }
});

test('@pr-smoke admin live network center keeps polling controls available for an empty result', async ({ page }) => {
  let monitorCalls = 0;

  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET environments': () => ({ environments: [] }),
      'GET locations': () => ({ locations: [] }),
      'GET network_interface_monitors': () => {
        monitorCalls += 1;
        return { network_interface_monitors: [] };
      },
    },
  });

  await page.goto('/admin/networking/live?paused=1');

  await expect(page.getByTestId('admin.network_live.dashboard')).toBeVisible();
  await expect(page.getByTestId('admin.network_live.toggle')).toContainText(/resume|pokračovat/i);
  await expect(page.getByTestId('admin.network_live.empty')).toBeVisible();

  const pausedCalls = monitorCalls;
  await page.getByTestId('admin.network_live.toggle').click();
  await expect(page).not.toHaveURL(/paused=1/);
  await expect.poll(() => monitorCalls).toBeGreaterThan(pausedCalls);
});
