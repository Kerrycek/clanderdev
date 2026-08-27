import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test.describe('DNS zones keyset pagination', () => {
  let zoneRequestQueries: string[];

  test.beforeEach(async ({ page }) => {
    zoneRequestQueries = [];
    await bootstrapVpsAdminWindow(page, {
      sessionToken: 'TEST',
    });

    const makeZone = (id: number) => ({
      id,
      name: `zone${id}.example`,
      role: id % 3 === 0 ? 'secondary' : 'primary',
      enabled: id % 2 === 0,
      dnssec_enabled: id % 4 === 0,
      serial: 2026012600 + (300 - id),
      default_ttl: id % 2 === 0 ? 3600 : 600,
    });

    const page1 = Array.from({ length: 50 }, (_, i) => 300 - i).map(makeZone);
    const page2 = Array.from({ length: 50 }, (_, i) => 250 - i).map(makeZone);

    await installHaveApiMock(page, {
      user: { id: 1, login: 'test', level: 1 },
      handlers: {
        'GET dns_zones': ({ searchParams }) => {
          zoneRequestQueries.push(searchParams.toString());
          const fromId = searchParams.get('dns_zone[from_id]');
          return { dns_zones: fromId ? page2 : page1, _meta: { total_count: 100 } };
        },
      },
    });
  });

  test('user search is client-side and strips the admin-only DNSSEC filter', async ({ page }) => {
    await page.goto('/app/dns?q=zone300&dnssec=1');

    await expect(page.getByTestId('dns.zones.row.300')).toBeVisible();
    await expect(page.getByTestId('dns.zones.row.299')).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.has('dnssec')).toBe(false);
    expect(zoneRequestQueries.every((query) => !query.includes('dns_zone%5Bq%5D'))).toBe(true);
    expect(zoneRequestQueries.every((query) => !query.includes('dns_zone%5Bdnssec_enabled%5D'))).toBe(true);
  });

  test('navigates to next and previous pages via from_id', async ({ page }) => {
    await page.goto('/app/dns');

    await expect(page.getByTestId('dns.zones.list')).toBeVisible();
    await expect(page.getByTestId('dns.zones.row.300')).toBeVisible();
    await expect(page.getByTestId('dns.zones.row.300.dot')).toBeVisible();
    await expect(page.getByTestId('dns.zones.row.299')).toHaveAttribute('data-row-variant', 'warn');
    await expect(page.getByTestId('dns.zones.row.299.dot')).toBeVisible();

    await page.getByTestId('dns.zones.pagination.desktop.next').click();
    await expect(page).toHaveURL(/from_id=251/);
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId('dns.zones.row.250')).toBeVisible();

    const prev = page.getByTestId('dns.zones.pagination.desktop.prev');
    await expect(prev).toBeEnabled();
    await prev.click({ force: true });
    await expect(page).not.toHaveURL(/from_id=/, { timeout: 30_000 });
    await expect(page).toHaveURL(/page=1/);
    await expect(page.getByTestId('dns.zones.row.300')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('dns.zones.row.300.dot')).toBeVisible();
    await expect(page.getByTestId('dns.zones.row.299')).toHaveAttribute('data-row-variant', 'warn');
    await expect(page.getByTestId('dns.zones.row.299.dot')).toBeVisible();
  });

  test('canonicalizes zone name when creating a DNS zone', async ({ page }) => {
    let createPayload: any;

    await installHaveApiMock(page, {
      user: { id: 1, login: 'test', level: 1 },
      handlers: {
        'GET dns_zones': () => ({ dns_zones: [], _meta: { total_count: 0 } }),
        'POST dns_zones': async ({ request }) => {
          createPayload = await request.postDataJSON();
          return {
            dns_zone: {
              id: 401,
              name: createPayload?.dns_zone?.name,
              enabled: true,
              default_ttl: 3600,
            },
          };
        },
      },
    });

    await page.goto('/app/dns');
    await page.getByTestId('dns.zones.create.open').click();
    await page.getByTestId('dns.zones.create.name').fill('example.test');
    await page.getByTestId('dns.zones.create.email').fill('hostmaster@example.test');
    await page.getByTestId('dns.zones.create.submit').click();

    await expect.poll(() => createPayload?.dns_zone?.name).toBe('example.test.');
    expect(createPayload?.dns_zone?.email).toBe('hostmaster@example.test');
    expect(createPayload?.dns_zone?.source).toBe('internal_source');
    expect(createPayload?.dns_zone?.default_ttl).toBeUndefined();
    expect(createPayload?.dns_zone?.enabled).toBe(true);
    expect(createPayload?.dns_zone?.dnssec_enabled).toBe(false);
  });

  test('requires SOA email before creating a DNS zone', async ({ page }) => {
    let createCalls = 0;

    await installHaveApiMock(page, {
      user: { id: 1, login: 'test', level: 1 },
      handlers: {
        'GET dns_zones': () => ({ dns_zones: [], _meta: { total_count: 0 } }),
        'POST dns_zones': () => {
          createCalls += 1;
          return { dns_zone: { id: 402, name: 'missing-email.test.' } };
        },
      },
    });

    await page.goto('/app/dns');
    await page.getByTestId('dns.zones.create.open').click();
    await page.getByTestId('dns.zones.create.name').fill('missing-email.test');

    await expect(page.getByText('Enter an SOA email.')).toBeVisible();
    await expect(page.getByTestId('dns.zones.create.submit')).toBeDisabled();
    expect(createCalls).toBe(0);
  });

  test('creates a secondary zone with the upstream external-source payload and lands on transfers', async ({ page }) => {
    let createPayload: any;
    let recordRequests = 0;

    await installHaveApiMock(page, {
      user: { id: 1, login: 'test', level: 1 },
      handlers: {
        'GET dns_zones': () => ({ dns_zones: [], _meta: { total_count: 0 } }),
        'POST dns_zones': async ({ request }) => {
          createPayload = await request.postDataJSON();
          return {
            dns_zone: {
              id: 404,
              name: createPayload?.dns_zone?.name,
              source: 'external_source',
              enabled: true,
              user: { id: 1, login: 'test' },
            },
          };
        },
        'GET dns_zones/404': () => ({
          dns_zone: {
            id: 404,
            name: 'secondary.example.test.',
            source: 'external_source',
            enabled: true,
            user: { id: 1, login: 'test' },
          },
        }),
        'GET dns_zone_transfers': () => ({ dns_zone_transfers: [] }),
        'GET dns_tsig_keys': () => ({ dns_tsig_keys: [] }),
        'GET dns_server_zones': () => ({ dns_server_zones: [] }),
        'GET dns_server_zone_transfer_logs': () => ({ dns_server_zone_transfer_logs: [] }),
        'GET dns_records': () => {
          recordRequests += 1;
          return { dns_records: [] };
        },
      },
    });

    await page.goto('/app/dns');
    await page.getByTestId('dns.zones.create.open').click();
    await page.getByTestId('dns.zones.create.kind.secondary').click();
    await page.getByTestId('dns.zones.create.name').fill('secondary.example.test');

    await expect(page.getByTestId('dns.zones.create.email')).toHaveCount(0);
    await expect(page.getByTestId('dns.zones.create.dnssec')).toHaveCount(0);
    await expect(page.getByTestId('dns.zones.create.submit')).toBeEnabled();
    await page.getByTestId('dns.zones.create.submit').click();

    await expect.poll(() => createPayload?.dns_zone?.name).toBe('secondary.example.test.');
    expect(createPayload?.dns_zone?.source).toBe('external_source');
    expect(createPayload?.dns_zone?.email).toBeUndefined();
    expect(createPayload?.dns_zone?.dnssec_enabled).toBeUndefined();
    expect(createPayload?.dns_zone?.default_ttl).toBeUndefined();
    await expect(page).toHaveURL(/\/app\/dns\/zones\/404\/transfers(?:\?|$)/);
    await expect(page.getByTestId('dns.transfers.page')).toBeVisible();
    expect(recordRequests).toBe(0);
  });

  test('keeps default TTL in admin DNS zone create payload', async ({ page }) => {
    let createPayload: any;

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET dns_zones': () => ({ dns_zones: [], _meta: { total_count: 0 } }),
        'POST dns_zones': async ({ request }) => {
          createPayload = await request.postDataJSON();
          return {
            dns_zone: {
              id: 403,
              name: createPayload?.dns_zone?.name,
              enabled: true,
              default_ttl: createPayload?.dns_zone?.default_ttl,
            },
          };
        },
      },
    });

    await page.goto('/admin/dns');
    await page.getByTestId('dns.zones.create.open').click();
    await page.getByTestId('dns.zones.create.name').fill('admin-zone.test');
    await page.getByTestId('dns.zones.create.email').fill('hostmaster@admin-zone.test');
    await page.getByTestId('dns.zones.create.ttl').selectOption('600');
    await page.getByTestId('dns.zones.create.submit').click();

    await expect.poll(() => createPayload?.dns_zone?.name).toBe('admin-zone.test.');
    expect(createPayload?.dns_zone?.email).toBe('hostmaster@admin-zone.test');
    expect(createPayload?.dns_zone?.default_ttl).toBe(600);
  });
});
