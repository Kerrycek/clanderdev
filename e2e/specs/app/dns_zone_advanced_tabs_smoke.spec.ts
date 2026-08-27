import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test('@smoke dns zone advanced tabs render', async ({ page }) => {
  let createdTransfer: any;
  let hostIpLookupParams: URLSearchParams | null = null;
  let tsigRequests = 0;
  await bootstrapVpsAdminWindow(page);
  await installHaveApiMock(page, {
    user: { id: 10, login: 'alice', level: 1 },
    handlers: {
      'GET dns_zones/42': () => ({ dns_zone: { id: 42, name: 'example.test', source: 'internal_source', enabled: true, dnssec_enabled: true, serial: 1234, user: { id: 10, login: 'alice' } } }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'GET dns_zone_transfers': () => ({ dns_zone_transfers: [{ id: 1, dns_zone: { id: 42 }, host_ip_address: { id: 11, ip_address: { ip_addr: '203.0.113.10' } }, peer_type: 'primary_type', dns_tsig_key: { id: 21, name: 'tsig-a' } }] }),
      'GET dns_tsig_keys': () => {
        tsigRequests += 1;
        return { dns_tsig_keys: [{ id: 21, name: 'tsig-a', algorithm: 'hmac-sha256', secret: 'secret', user: { id: 10, login: 'alice' } }] };
      },
      'GET dns_record_logs': () => ({ dns_record_logs: [] }),
      'GET dnssec_records': () => ({ dnssec_records: [{ id: 1, dns_zone: { id: 42 }, keyid: 12345, dnskey_algorithm: 13, dnskey_pubkey: 'ABCDEF', ds_algorithm: 13, ds_digest_type: 2, ds_digest: '012345' }] }),
      'GET dns_server_zones': () => ({ dns_server_zones: [{ id: 1, dns_server: { id: 5, name: 'ns1' }, type: 'primary_type', serial: 1234 }] }),
      'GET dns_servers': () => ({ dns_servers: [{ id: 5, name: 'ns1' }] }),
      'GET host_ip_addresses': ({ searchParams }) => {
        hostIpLookupParams = new URLSearchParams(searchParams);
        return { host_ip_addresses: [{ id: 12, addr: '203.0.113.12' }] };
      },
      'POST dns_zone_transfers': async ({ request }) => {
        createdTransfer = await request.postDataJSON();
        return { dns_zone_transfer: { id: 2 } };
      },
    },
  });

  await page.goto('/app/dns/zones/42/transfers');
  await expect(page.getByTestId('dns.transfers.page')).toBeVisible();
  await expect(page.getByTestId('dns.transfers.row.1')).toBeVisible();
  expect(tsigRequests).toBe(0);
  await page.getByTestId('dns.transfers.create.open').click();
  await expect.poll(() => tsigRequests).toBe(1);
  await expect(page.getByTestId('dns.transfers.create.peer_type')).toHaveCount(0);
  const hostIpInput = page.getByTestId('dns.transfers.create.host_ip');
  await hostIpInput.focus();
  await expect(page.getByTestId('dns.transfers.create.host_ip.opt.12')).toBeVisible();
  await expect(hostIpInput).toHaveAttribute('role', 'combobox');
  await expect(hostIpInput).toHaveAttribute('aria-expanded', 'true');
  expect(hostIpLookupParams?.get('host_ip_address[purpose]')).toBe('vps');
  expect(hostIpLookupParams?.get('host_ip_address[routed]')).toBe('true');
  expect(hostIpLookupParams?.has('host_ip_address[q]')).toBe(false);
  expect(hostIpLookupParams?.has('host_ip_address[assigned]')).toBe(false);
  expect(hostIpLookupParams?.has('host_ip_address[user]')).toBe(false);
  await hostIpInput.fill('#11');
  await hostIpInput.press('Enter');
  await expect(page.getByTestId('dns.transfers.create.host_ip.error')).toBeVisible();
  await expect(page.getByTestId('dns.transfers.create.submit')).toBeDisabled();

  await hostIpInput.fill('');
  await expect(page.getByTestId('dns.transfers.create.host_ip.opt.12')).toBeVisible();
  await hostIpInput.press('ArrowDown');
  await hostIpInput.press('Enter');
  await page.getByTestId('dns.transfers.create.submit').click();
  await expect.poll(() => createdTransfer?.dns_zone_transfer?.peer_type).toBe('secondary_type');
  expect(createdTransfer?.dns_zone_transfer?.host_ip_address).toBe(12);

  await page.goto('/app/dns/zones/42/dnssec');
  await expect(page.getByTestId('dns.dnssec.page')).toBeVisible();
  await expect(page.getByTestId('dns.dnssec.card.1')).toBeVisible();

  await page.goto('/app/dns/zones/42/servers');
  await expect(page.getByTestId('dns.servers.page')).toBeVisible();
  await expect(page.getByTestId('dns.servers.row.1')).toBeVisible();
});

test('@smoke admin transfer host lookup is scoped to the DNS zone owner', async ({ page }) => {
  let hostIpLookupParams: URLSearchParams | null = null;
  await bootstrapVpsAdminWindow(page);
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 90 },
    handlers: {
      'GET dns_zones/42': () => ({
        dns_zone: {
          id: 42,
          name: 'example.test',
          source: 'internal_source',
          enabled: true,
          user: { id: 55, login: 'owner' },
        },
      }),
      'GET dns_zone_transfers': () => ({ dns_zone_transfers: [] }),
      'GET dns_tsig_keys': () => ({ dns_tsig_keys: [] }),
      'GET dns_record_logs': () => ({ dns_record_logs: [] }),
      'GET host_ip_addresses': ({ searchParams }) => {
        hostIpLookupParams = new URLSearchParams(searchParams);
        return { host_ip_addresses: [{ id: 12, addr: '203.0.113.12' }] };
      },
    },
  });

  await page.goto('/admin/dns/zones/42/transfers');
  await expect(page.getByTestId('dns.transfers.page')).toBeVisible();
  await page.getByTestId('dns.transfers.create.open').click();
  await page.getByTestId('dns.transfers.create.host_ip').focus();
  await expect(page.getByTestId('dns.transfers.create.host_ip.opt.12')).toBeVisible();

  expect(hostIpLookupParams?.get('host_ip_address[user]')).toBe('55');
  expect(hostIpLookupParams?.get('host_ip_address[purpose]')).toBe('vps');
  expect(hostIpLookupParams?.get('host_ip_address[routed]')).toBe('true');
  expect(hostIpLookupParams?.has('host_ip_address[q]')).toBe(false);
  expect(hostIpLookupParams?.has('host_ip_address[assigned]')).toBe(false);
});

test('@smoke secondary DNS zone defaults to transfers and renders real transfer log facts', async ({ page }) => {
  let recordRequests = 0;
  let createdTransfer: any;
  await bootstrapVpsAdminWindow(page);
  await installHaveApiMock(page, {
    user: { id: 10, login: 'alice', level: 1 },
    handlers: {
      'GET dns_zones/84': () => ({
        dns_zone: {
          id: 84,
          name: 'secondary.example.test.',
          source: 'external_source',
          enabled: true,
          user: { id: 10, login: 'alice' },
        },
      }),
      'GET dns_zone_transfers': () => ({ dns_zone_transfers: [] }),
      'GET dns_tsig_keys': () => ({ dns_tsig_keys: [] }),
      'GET host_ip_addresses': () => ({ host_ip_addresses: [{ id: 12, addr: '192.0.2.12' }] }),
      'GET dns_record_logs': () => ({ dns_record_logs: [] }),
      'GET dns_server_zones': () => ({
        dns_server_zones: [{ id: 31, dns_server: { id: 5, name: 'ns1' }, serial: 2026082701 }],
      }),
      'GET dns_server_zone_transfer_logs': () => ({
        dns_server_zone_transfer_logs: [{
          id: 91,
          dns_server_zone: { id: 31, dns_server: { id: 5, name: 'ns1' } },
          event_at: '2026-08-27T12:34:56Z',
          status: 'failed',
          primary_addr: '192.0.2.53',
          serial: 2026082701,
          reason_code: 'connection_refused',
          reason: 'Connection refused',
        }],
      }),
      'GET dns_records': () => {
        recordRequests += 1;
        return { dns_records: [] };
      },
      'POST dns_zone_transfers': async ({ request }) => {
        createdTransfer = await request.postDataJSON();
        return { dns_zone_transfer: { id: 92 } };
      },
    },
  });

  await page.goto('/app/dns/zones/84');

  await expect(page).toHaveURL(/\/app\/dns\/zones\/84\/transfers(?:\?|$)/);
  await expect(page.getByTestId('dns.transfers.page')).toBeVisible();
  await expect(page.getByTestId('dns.transfers.log.row.91')).toContainText('ns1');
  await expect(page.getByTestId('dns.transfers.log.row.91')).toContainText('192.0.2.53');
  await expect(page.getByTestId('dns.transfers.log.row.91')).toContainText('2026082701');
  await expect(page.getByTestId('dns.transfers.log.row.91')).toContainText('Connection refused');
  await expect(page.getByRole('link', { name: 'Records' })).toHaveCount(0);
  expect(recordRequests).toBe(0);

  await page.getByTestId('dns.transfers.create.open').click();
  await expect(page.getByTestId('dns.transfers.create.peer_type')).toHaveCount(0);
  await page.getByTestId('dns.transfers.create.host_ip').focus();
  await page.getByTestId('dns.transfers.create.host_ip.opt.12').click();
  await page.getByTestId('dns.transfers.create.submit').click();
  await expect.poll(() => createdTransfer?.dns_zone_transfer?.peer_type).toBe('primary_type');
  expect(createdTransfer?.dns_zone_transfer?.host_ip_address).toBe(12);

  const screenshot = process.env.E2E_DNS_SECONDARY_SCREENSHOT?.trim();
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
});
