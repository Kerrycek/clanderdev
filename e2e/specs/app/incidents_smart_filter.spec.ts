import { test, expect } from '../../fixtures/bootstrap';
import { setupHaveApiMock } from '../../fixtures/haveapi';
import { withAppUrl } from '../../fixtures/url';

test.describe('Incident reports - Smart Filter Input', () => {
  test.beforeEach(async ({ page }) => {
    await setupHaveApiMock(page, {
      user: { level: 100 },
      handlers: {
        'GET mailboxes': async () => {
          return {
            mailboxes: [
              {
                id: 1,
                label: 'main',
                user: { id: 999, login: 'mailer' },
              },
            ],
          };
        },
        'GET incident_reports': async ({ request }) => {
          const limit = Number(request.searchParams.get('incident_report[limit]') ?? '25') || 25;
          const fromIdRaw = request.searchParams.get('incident_report[from_id]');
          const fromId = fromIdRaw ? Number(fromIdRaw) : 0;

          const codename = request.searchParams.get('incident_report[codename]') ?? 'default';

          const start = fromId > 0 ? fromId - 1 : 125;
          const count = Math.min(limit, 25);

          const incident_reports = Array.from({ length: count }, (_, i) => {
            const id = start - i;
            return {
              id,
              detected_at: '2025-01-01T00:00:00Z',
              vps_action: 'suspend',
              subject: `Incident ${id}`,
              codename,
              vps: { id: 1000 + id, hostname: `vps${id}.example.test` },
              user: { id: 2000 + id, login: `user${id}` },
              ip_address_assignment: { id: 3000 + id, ip_addr: `192.0.2.${id % 255}` },
              filed_by: { id: 4000 + id, login: `admin${id}` },
              mailbox: { id: 1, label: 'main', user: { id: 999, login: 'mailer' } },
            };
          });

          return { incident_reports, _meta: { total_count: 125 } };
        },
      },
    });
  });

  test('applies codename: filter and keeps it on next page', async ({ page }) => {
    await page.goto(withAppUrl('/admin/incidents?limit=25'));

    // Initial page
    await expect(page.getByTestId('incidents.list.row.125')).toBeVisible();
    await expect(page.getByTestId('incidents.list.row.125')).toHaveAttribute('data-row-variant', 'warn');
    await expect(page.getByTestId('incidents.list.row.125.dot')).toBeVisible();
    await expect(page.getByTestId('incidents.list.row.125')).toContainText('default');
    await expect(page.getByTestId('incidents.list.row.125').locator('td')).toHaveCount(9);

    // Apply SFI codename filter
    const input = page.getByTestId('incidents.smart_filter.input');
    await input.fill('codename:abuse');
    await input.press('Enter');

    await expect(page.getByTestId('incidents.list.row.125')).toBeVisible();
    await expect(page.getByTestId('incidents.list.row.125')).toContainText('abuse');

    // Keyset pagination should use from_id and keep filters
    await page.getByTestId('incidents.list.pagination.next').click();
    await expect(page.getByTestId('incidents.list.row.100')).toBeVisible();
    await expect(page.getByTestId('incidents.list.row.100')).toContainText('abuse');
  });
});
