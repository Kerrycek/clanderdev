import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test.describe('DNS zone records keyset pagination', () => {
  let recordRequestQueries: string[];

  test.beforeEach(async ({ page }) => {
    recordRequestQueries = [];
    await bootstrapVpsAdminWindow(page, {
      sessionToken: 'TEST',
    });

    const zone = {
      id: 10,
      name: 'zone10.example',
      role: 'primary',
      enabled: true,
      dnssec_enabled: false,
      serial: 2026012601,
      default_ttl: 3600,
    };

    const makeRecord = (id: number) => ({
      id,
      dns_zone: 10,
      name: `host${id}`,
      ttl: 3600,
      type: id % 3 === 0 ? 'A' : id % 3 === 1 ? 'AAAA' : 'TXT',
      content:
        id % 3 === 2 ? `\"hello-${id}\"` : id % 3 === 1 ? `2001:db8::${id}` : `192.0.2.${id % 255}`,
      priority: null,
      enabled: id % 2 === 0,
      dynamic: id % 5 === 0,
      comment: id % 7 === 0 ? 'note' : null,
      dynamic_update_url: null,
    });

    const page1 = Array.from({ length: 50 }, (_, i) => 300 - i).map(makeRecord);
    const page2 = Array.from({ length: 50 }, (_, i) => 250 - i).map(makeRecord);

    await installHaveApiMock(page, {
      user: { id: 1, login: 'test', level: 1 },
      handlers: {
        'GET dns_zones/10': () => zone,
        // Zone card uses this endpoint with a small limit.
        'GET dns_record_logs': () => ({ dns_record_logs: [], _meta: { total_count: 0 } }),
        'GET dns_records': ({ searchParams }) => {
          recordRequestQueries.push(searchParams.toString());
          const fromId = searchParams.get('dns_record[from_id]');
          const zoneId = searchParams.get('dns_record[dns_zone]');
          if (zoneId !== '10') return { dns_records: [], _meta: { total_count: 0 } };
          return { dns_records: fromId ? page2 : page1, _meta: { total_count: 100 } };
        },
      },
    });
  });

  test('next/prev updates URL and rows', async ({ page }) => {
    await page.goto('/app/dns/zones/10');

    await expect(page.getByTestId('dns.records.list')).toBeVisible();
    await expect(page.getByTestId('dns.record.row.300')).toBeVisible();
    await expect(page.getByTestId('dns.record.row.300.dot')).toBeVisible();
    await expect(page.getByTestId('dns.record.row.299')).toHaveAttribute('data-row-variant', 'warn');

    await page.getByTestId('dns.records.pagination.desktop.next').click();
    await expect(page).toHaveURL(/from_id=251/);
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId('dns.record.row.250')).toBeVisible();

    await page.getByTestId('dns.records.pagination.desktop.prev').click();
    await expect(page).toHaveURL(/page=1/);
    await expect(page).not.toHaveURL(/from_id=/);
    await expect(page.getByTestId('dns.record.row.300')).toBeVisible();
  });

  test('search filters the loaded page without sending unsupported q', async ({ page }) => {
    await page.goto('/app/dns/zones/10');

    await page.getByTestId('dns.records.search.input').fill('host300');
    await expect(page).toHaveURL(/q=host300/);
    await expect(page.getByTestId('dns.record.row.300')).toBeVisible();
    await expect(page.getByTestId('dns.record.row.299')).toHaveCount(0);
    expect(recordRequestQueries.every((query) => !query.includes('dns_record%5Bq%5D'))).toBe(true);
  });
});
