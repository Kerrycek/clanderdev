import { expect, test } from '../../fixtures/vpsadmin-window';
import { bootstrapVpsAdminWindow } from '../../fixtures/bootstrap';
import { installHaveApiMock } from '../../fixtures/haveapi';

async function expectNoDocumentHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          testId: element.dataset.testid ?? null,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      })
      .filter((element) => element.right > document.documentElement.clientWidth + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 10),
  }));

  expect(overflow.documentWidth, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(overflow.viewportWidth);
}

async function expectTableScrollContained(page: import('@playwright/test').Page, testId: string) {
  const metrics = await page.getByTestId(testId).evaluate((card) => {
    const scroller = card.firstElementChild as HTMLElement | null;
    const rect = card.getBoundingClientRect();
    return {
      cardRight: Math.round(rect.right),
      viewportWidth: document.documentElement.clientWidth,
      scrollerClientWidth: scroller?.clientWidth ?? 0,
      scrollerScrollWidth: scroller?.scrollWidth ?? 0,
      scrollerOverflowX: scroller ? getComputedStyle(scroller).overflowX : '',
    };
  });

  expect(metrics.cardRight).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.scrollerOverflowX).toBe('auto');
  expect(metrics.scrollerScrollWidth).toBeGreaterThan(metrics.scrollerClientWidth);
}

test.describe('Admin / Networking surfaces (smoke)', () => {
  test('host IP list and assignment audit render', async ({ page }) => {
    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET host_ip_addresses': () => ({
          host_ip_addresses: [
            {
              id: 501,
              addr: '203.0.113.10',
              assigned: true,
              reverse_record_value: 'ptr.example.com.',
              ip_address: {
                id: 301,
                ip_addr: '192.0.2.10',
                user: { id: 7, login: 'alice' },
                network_interface: { id: 99, name: 'eth0', vps: { id: 42, hostname: 'vps-42' } },
              },
            },
            { id: 502, addr: '83.167.228.5', assigned: false, user_created: true, ip_address: { id: 302, ip_addr: '83.167.228.5' } },
            { id: 503, addr: '2a01:430:17::10', assigned: false, ip_address: { id: 303, ip_addr: '2a01:430:17::10' } },
          ],
        }),
        'GET ip_address_assignments': () => ({
          ip_address_assignments: [
            {
              id: 801,
              ip_addr: '192.0.2.10',
              ip_prefix: 32,
              user: { id: 7, login: 'alice' },
              vps: { id: 42, hostname: 'vps-42' },
              from_date: '2026-03-01T10:00:00Z',
              to_date: null,
              reconstructed: false,
            },
          ],
        }),
      },
    });

    await bootstrapVpsAdminWindow(page, { sessionToken: 'test-admin-session' });

    await page.goto('/admin/networking/host-ip-addresses');
    await expect(page.getByTestId('admin.host_ip_addresses.row.501')).toBeVisible();
    await expect(page.getByTestId('admin.host_ip_addresses.row.501.ptr')).toHaveAttribute('aria-label', 'PTR');
    await expect(page.getByTestId('admin.host_ip_addresses.row.501.free')).toHaveAttribute('aria-label', 'Remove');
    await expect(page.getByTestId('admin.host_ip_addresses.row.501.assign')).toHaveCount(0);
    await expect(page.getByTestId('admin.host_ip_addresses.row.501.ptr')).toHaveText('');
    await expect(page.getByTestId('admin.host_ip_addresses.row.502')).toHaveCount(0);
    await expect(page.getByTestId('admin.host_ip_addresses.row.503')).toHaveCount(0);
    await page.goto('/admin/networking/host-ip-addresses?q=83.167.228.5');
    await expect(page.getByTestId('admin.host_ip_addresses.row.502')).toBeVisible();
    await expect(page.getByTestId('admin.host_ip_addresses.row.502.assign')).toHaveAttribute('aria-label', 'Assign');
    await expect(page.getByTestId('admin.host_ip_addresses.row.502.delete')).toHaveAttribute('aria-label', 'Delete');
    await expect(page.getByTestId('admin.host_ip_addresses.row.502.free')).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoDocumentHorizontalOverflow(page);
    await expectTableScrollContained(page, 'admin.host_ip_addresses.table');

    const proofScreenshot = process.env.E2E_HOST_IP_ACTIONS_PROOF_SCREENSHOT?.trim();
    if (proofScreenshot) await page.screenshot({ path: proofScreenshot, fullPage: true });

    await page.goto('/admin/networking/ip-address-assignments');
    await expect(page.getByTestId('admin.ip_assignments.row.801')).toBeVisible();
  });

  test('live monitor and traffic users render', async ({ page }) => {
    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET network_interface_monitors': () => ({
          network_interface_monitors: [
            {
              id: 901,
              network_interface: {
                id: 10,
                name: 'eth0',
                vps: { id: 42, hostname: 'vps-42', user: { id: 7, login: 'alice' }, node: { id: 5, domain_name: 'node5.example' } },
              },
              bytes_in: 1048576,
              bytes_out: 524288,
              packets_in: 400,
              packets_out: 250,
              delta: 10,
              updated_at: '2026-03-02T12:00:00Z',
            },
          ],
        }),
        'GET network_interface_accountings/user_top': () => ({
          network_interface_accountings: [
            { user: { id: 7, login: 'alice' }, bytes: 1572864, bytes_in: 1048576, bytes_out: 524288, packets: 650, packets_in: 400, packets_out: 250, year: 2026, month: 3 },
          ],
        }),
      },
    });

    await bootstrapVpsAdminWindow(page, { sessionToken: 'test-admin-session' });

    await page.goto('/admin/networking/live');
    await expect(page.getByTestId('admin.network_live.row.901')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoDocumentHorizontalOverflow(page);
    await expectTableScrollContained(page, 'admin.network_live.table');

    await page.goto('/admin/networking/traffic-users');
    await expect(page.getByTestId('admin.network_traffic_users.row.7')).toBeVisible();
  });
});
