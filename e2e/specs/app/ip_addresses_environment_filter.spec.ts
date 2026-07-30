import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test.describe('IP address environment filter', () => {
  test('offers a type-major free-address sample from each active location', async ({ page }, testInfo) => {
    const requestedLocations: string[] = [];
    const requestedAssigned: string[] = [];
    const requestedOwners: Array<string | null> = [];
    const requestedOrders: Array<string | null> = [];
    const itemKind = testInfo.project.name === 'mobile-chrome' ? 'card' : 'row';
    const item = (id: number) => page.getByTestId(`admin.ip_addresses.${itemKind}.${id}`);

    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 42, login: 'admin', level: 100 },
      handlers: {
        'GET locations': () => ({
          locations: [
            { id: 8, label: 'Praha', environment: { id: 3, label: 'Production' } },
            { id: 7, label: 'Brno', environment: { id: 3, label: 'Production' } },
            { id: 9, label: 'Playground', environment: { id: 4, label: 'Staging' } },
          ],
        }),
        'GET ip_addresses': (ctx) => {
          const location = ctx.searchParams.get('ip_address[location]');
          const version = ctx.searchParams.get('ip_address[version]');
          if (location) requestedLocations.push(location);
          requestedAssigned.push(ctx.searchParams.get('ip_address[assigned_to_interface]') ?? '');
          requestedOwners.push(ctx.searchParams.get('ip_address[user]'));
          requestedOrders.push(ctx.searchParams.get('ip_address[order]'));

          const locations = {
            '7': { id: 600, location: { id: 7, label: 'Brno', environment: { id: 3, label: 'Production' } } },
            '8': { id: 500, location: { id: 8, label: 'Praha', environment: { id: 3, label: 'Production' } } },
            '9': { id: 700, location: { id: 9, label: 'Playground', environment: { id: 4, label: 'Staging' } } },
          } as const;
          const selected = locations[location as keyof typeof locations];
          if (!selected) return { ip_addresses: [] };

          const address = (id: number, addr: string, primaryLocation = selected.location) => ({
            id,
            addr,
            prefix: addr.includes(':') ? 128 : 32,
            network: {
              id: id + 100,
              address: addr,
              prefix: addr.includes(':') ? 64 : 24,
              primary_location: primaryLocation,
            },
          });

          return {
            ip_addresses: version === '6'
              ? [1, 2, 3].map((offset) =>
                address(selected.id + 20 + offset, `2a03:3b40:${location}::${offset}`)
              )
              : [
                ...[1, 2, 3].map((offset) =>
                  address(selected.id + offset, `198.51.${location}.${offset}`)
                ),
                ...[1, 2, 3].map((offset) =>
                  address(selected.id + 10 + offset, `10.${location}.0.${offset}`)
                ),
                { ...address(selected.id + 1_000, `198.51.${location}.100`), user: { id: 99, login: 'already-owned' } },
                { ...address(selected.id + 2_000, `198.51.${location}.101`), vps: { id: 77, hostname: 'already-used' } },
              ],
          };
        },
      },
    });

    await page.goto('/admin/ip-addresses');

    await expect(page.getByTestId('admin.ip_addresses.page')).toBeVisible();
    await expect(page.getByTestId('admin.ip_addresses.quick.environment')).toHaveValue('');
    await expect(page.getByTestId('admin.ip_addresses.quick.occupancy.unassigned')).toHaveClass(/bg-surface/);
    await expect(item(501)).toContainText(/PRG|Praha · Production/);
    await expect(item(511)).toContainText(/privátní|private/i);
    await expect(item(601)).toContainText(/BRN|Brno · Production/);
    await expect(item(701)).toContainText(/PG|Playground · Staging/);
    await expect(item(1_500)).toHaveCount(0);
    await expect(item(2_500)).toHaveCount(0);

    const renderedIds = await page
      .locator(`[data-testid^="admin.ip_addresses.${itemKind}."]`)
      .evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute('data-testid')?.split('.').at(-1))));
    expect(renderedIds).toEqual([
      501, 502, 503,
      601, 602, 603,
      701, 702, 703,
      511, 512, 513,
      611, 612, 613,
      711, 712, 713,
      521, 522, 523,
      621, 622, 623,
      721, 722, 723,
    ]);

    expect([...new Set(requestedLocations)].sort()).toEqual(['7', '8', '9']);
    expect(requestedAssigned.every((value) => value === 'false')).toBe(true);
    expect(requestedOwners.every((value) => value === '')).toBe(true);
    expect(requestedOrders.every((value) => value === 'asc')).toBe(true);
  });

  test('shows a deliberately selected legacy subnet', async ({ page }, testInfo) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 42, login: 'admin', level: 100 },
      handlers: {
        'GET locations': () => ({ locations: [{ id: 8, label: 'Praha', environment: { id: 3, label: 'Production' } }] }),
        'GET ip_addresses': () => ({
          ip_addresses: [{
            id: 503,
            addr: '2a01:430:17::10',
            prefix: 128,
            network: { id: 24, address: '2a01:430:17::', prefix: 48 },
          }],
        }),
      },
    });

    await page.goto('/admin/ip-addresses?network=24');

    const itemKind = testInfo.project.name === 'mobile-chrome' ? 'card' : 'row';
    await expect(page.getByTestId(`admin.ip_addresses.${itemKind}.503`)).toBeVisible();
  });
});
