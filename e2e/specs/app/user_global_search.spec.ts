import { expect, test, type Page } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

async function openCommandPalette(page: Page) {
  await expect(page.getByTestId('shell.inline-search.input')).toBeVisible();
  await page.keyboard.press('Control+K');
  await expect(page.getByTestId('palette.modal')).toBeVisible();
}

test.describe('User global search', () => {
  test('finds an owned IP and the VPS assigned to it from the header', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    const searched: string[] = [];
    const ipRequests: Array<{ addr: string | null; q: string | null }> = [];
    const dnsRequests: Array<{ limit: string | null; fromId: string | null; q: string | null }> = [];
    await installHaveApiMock(page, {
      user: { id: 1, login: 'user', level: 1 },
      handlers: {
        'GET vpses': (ctx) => {
          const query = String(ctx.searchParams.get('vps[hostname_any]') ?? '');
          if (query) searched.push(`vps:${query}`);
          return { vpses: [] };
        },
        'GET ip_addresses': (ctx) => {
          const addr = ctx.searchParams.get('ip_address[addr]');
          ipRequests.push({ addr, q: ctx.searchParams.get('ip_address[q]') });
          if (addr) searched.push(`ip:${addr}`);
          if (addr !== '203.0.113.20') return { ip_addresses: [] };
          return {
            ip_addresses: [
              {
                id: 20,
                addr: '203.0.113.20',
                prefix: 32,
                network_interface: {
                  id: 30,
                  vps: { id: 11, hostname: 'mail.example', user: { id: 1, login: 'user' } },
                },
              },
              {
                id: 21,
                addr: '203.0.113.20',
                prefix: 31,
                user: { id: 1, login: 'user' },
              },
              { id: 22, addr: '203.0.113.20', prefix: 30 },
              {
                id: 23,
                addr: '203.0.113.20',
                prefix: 29,
                user: { id: 2, login: 'foreign' },
              },
              {
                id: 24,
                addr: '203.0.113.20',
                prefix: 28,
                network_interface: {
                  id: 34,
                  vps: { id: 12, hostname: 'foreign.example', user: { id: 2, login: 'foreign' } },
                },
              },
              {
                id: 25,
                addr: '203.0.113.20',
                prefix: 27,
                network_interface: { id: 35, vps: { id: 13, hostname: 'ambiguous.example' } },
              },
            ],
          };
        },
        'GET dns_zones': (ctx) => {
          dnsRequests.push({
            limit: ctx.searchParams.get('dns_zone[limit]'),
            fromId: ctx.searchParams.get('dns_zone[from_id]'),
            q: ctx.searchParams.get('dns_zone[q]'),
          });
          return { dns_zones: [{ id: 40, name: 'example.test', user: { id: 1 } }] };
        },
      },
    });

    await page.goto('/app/vps');
    await page.getByTestId('shell.inline-search.input').fill('203.0.113.20');

    await expect(page.getByTestId('shell.inline-search.group.vps')).toBeVisible();
    await expect(page.getByTestId('shell.inline-search.group.ips')).toBeVisible();
    await expect(page.getByTestId('shell.inline-search.result.0')).toContainText('mail.example');
    await expect(page.getByTestId('shell.inline-search.result.1')).toContainText('203.0.113.20/32');
    await expect(page.getByTestId('shell.inline-search.result.2')).toContainText('203.0.113.20/31');
    await expect(page.getByText('203.0.113.20/30', { exact: true })).toHaveCount(0);
    await expect(page.getByText('203.0.113.20/29', { exact: true })).toHaveCount(0);
    await expect(page.getByText('203.0.113.20/28', { exact: true })).toHaveCount(0);
    await expect(page.getByText('203.0.113.20/27', { exact: true })).toHaveCount(0);
    expect(searched).toEqual(expect.arrayContaining([
      'vps:203.0.113.20',
      'ip:203.0.113.20',
    ]));
    expect(ipRequests).toContainEqual({ addr: '203.0.113.20', q: null });
    expect(dnsRequests).toContainEqual({ limit: '100', fromId: null, q: null });

    await page.getByTestId('shell.inline-search.result.0').click();
    await expect(page).toHaveURL(/\/app\/vps\/11$/);
  });

  test('finds a DNS zone in the command palette without searching unrelated resources', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    let unrelatedSearchCalled = false;
    const dnsRequests: Array<{ limit: string | null; fromId: string | null; q: string | null }> = [];
    let addressFilterSearches = 0;
    await installHaveApiMock(page, {
      user: { id: 1, login: 'user', level: 1 },
      handlers: {
        'GET vpses': () => ({ vpses: [] }),
        'GET ip_addresses': (ctx) => {
          if (ctx.searchParams.has('ip_address[addr]')) addressFilterSearches += 1;
          return { ip_addresses: [] };
        },
        'GET dns_zones': (ctx) => {
          const fromId = ctx.searchParams.get('dns_zone[from_id]');
          dnsRequests.push({
            limit: ctx.searchParams.get('dns_zone[limit]'),
            fromId,
            q: ctx.searchParams.get('dns_zone[q]'),
          });
          if (!fromId) {
            return {
              dns_zones: Array.from({ length: 100 }, (_, index) => ({
                id: 200 - index,
                name: `unrelated-${index}.test.`,
                user: { id: 1 },
              })),
            };
          }
          return {
            dns_zones: [
              { id: 40, name: 'example.test.', label: 'Primary zone', user: { id: 1 } },
              { id: 41, name: 'unrelated.test.', label: 'Another zone', user: { id: 1 } },
            ],
          };
        },
        'GET datasets': () => {
          unrelatedSearchCalled = true;
          return { datasets: [] };
        },
        'GET snapshot_downloads': () => {
          unrelatedSearchCalled = true;
          return { snapshot_downloads: [] };
        },
      },
    });

    await page.goto('/app/vps');
    await openCommandPalette(page);
    await page.getByTestId('palette.input').fill('example.test');

    await expect(page.getByTestId('palette.results')).toBeVisible();
    await expect(page.getByText('DNS zones', { exact: true })).toBeVisible();
    await expect(page.getByTestId('palette.result.0')).toContainText('example.test');
    await expect(page.getByTestId('palette.result.1')).toHaveCount(0);
    expect(dnsRequests).toEqual([
      { limit: '100', fromId: null, q: null },
      { limit: '100', fromId: '101', q: null },
    ]);
    expect(addressFilterSearches).toBe(0);
    expect(unrelatedSearchCalled).toBe(false);

    await page.getByTestId('palette.input').fill('dataset:archive');
    await expect(page.getByTestId('palette.no_results')).toBeVisible();
    expect(unrelatedSearchCalled).toBe(false);
  });
});
