import { expect, test } from '@playwright/test';

import {
  bootstrapVpsAdminWindow,
  installHaveApiMock,
  setUiSettingsLocalStorage,
} from '../../fixtures';

test('@workflow-matrix @smoke user requests: lists and opens only the signed-in owner data', async ({ page, isMobile }) => {
  const indexUrls: URL[] = [];

  await setUiSettingsLocalStorage(page, { language: 'en' });
  await bootstrapVpsAdminWindow(page);
  await installHaveApiMock(page, {
    user: { id: 10, login: 'alice', level: 1 },
    handlers: {
      'GET user_request/registrations': ({ url }) => {
        indexUrls.push(new URL(url));
        return {
          registrations: [{
            id: 54,
            user: { id: '10', login: 'alice' },
            state: 'approved',
            login: 'alice',
            full_name: 'Alice Example',
            created_at: '2026-08-20T10:00:00Z',
            admin: { id: 90, login: 'root' },
            api_ip_addr: '192.0.2.200',
          }],
          _meta: { total_count: 1 },
        };
      },
      'GET user_request/changes': ({ url }) => {
        indexUrls.push(new URL(url));
        return {
          changes: [{
            id: 55,
            user: { id: 10, login: 'alice' },
            state: 'awaiting',
            change_reason: 'Moving home',
            address: 'New street 2',
            created_at: '2026-08-21T10:00:00Z',
            admin: { id: 90, login: 'root' },
            client_ip_addr: '198.51.100.200',
          }],
          _meta: { total_count: 1 },
        };
      },
      'GET user_request/registrations/54': () => ({
        registration: {
          id: 54,
          user: { id: '10', login: 'alice' },
          state: 'approved',
          login: 'alice',
          full_name: 'Alice Example',
          email: 'alice@example.test',
          address: 'Example street 1',
          year_of_birth: 1990,
          os_template: { id: 4, label: 'Debian 12' },
          location: { id: 3, label: 'Prague' },
          currency: 'eur',
          language: { id: 1, label: 'English' },
          time_zone: 'Europe/Prague',
          created_at: '2026-08-20T10:00:00Z',
          updated_at: '2026-08-20T10:01:00Z',
          admin: { id: 90, login: 'UNSAFE ADMIN' },
          api_ip_addr: '192.0.2.210',
          client_ip_addr: '198.51.100.210',
          ip_fraud_score: 99,
          mail_fraud_score: 98,
        },
      }),
      'GET user_request/changes/55': () => ({
        change: {
          id: 55,
          user: { id: 10, login: 'alice' },
          state: 'awaiting',
          change_reason: 'Moving home',
          address: 'New street 2',
          created_at: '2026-08-21T10:00:00Z',
          updated_at: '2026-08-21T10:01:00Z',
          admin_response: 'We are checking the address.',
          admin: { id: 90, login: 'root' },
          api_ip_addr: '192.0.2.201',
        },
      }),
    },
  });

  await page.goto('/app');
  const requestsLink = page.getByTestId('nav.sidebar.requests');
  await expect(requestsLink).toHaveText('My requests');
  await page.goto('/app/requests');
  await expect(page).toHaveURL(/\/app\/requests$/);
  const rowPrefix = isMobile ? 'app.requests.mobile.row' : 'app.requests.row';
  await expect(page.getByTestId(`${rowPrefix}.registration.54`)).toBeVisible();
  await expect(page.getByTestId(`${rowPrefix}.change.55`)).toBeVisible();

  expect(indexUrls).toHaveLength(2);
  for (const url of indexUrls) {
    const keys = [...url.searchParams.keys()];
    expect(keys.some((key) => /\[(?:user|q|admin|api_ip_addr|client_ip_addr|client_ip_ptr)\]/.test(key))).toBe(false);
  }

  await expect(page.getByText('192.0.2.200')).toHaveCount(0);
  await expect(page.getByText('198.51.100.200')).toHaveCount(0);
  await expect(page.getByText('root')).toHaveCount(0);
  await expect(page.getByText('Review actions')).toHaveCount(0);
  await expect(page.getByTestId('admin.requests.list')).toHaveCount(0);

  const listScreenshot = process.env.E2E_USER_REQUESTS_SCREENSHOT?.trim();
  if (listScreenshot) await page.screenshot({ path: listScreenshot, fullPage: true });

  await page.getByTestId(`${rowPrefix}.registration.54`).click();
  await expect(page).toHaveURL(/\/app\/requests\/registration\/54$/);
  const registrationDetail = page.getByTestId('app.requests.detail.registration.54');
  await expect(registrationDetail).toContainText('1990');
  await expect(registrationDetail).toContainText('Debian 12');
  await expect(registrationDetail).toContainText('Prague');
  await expect(registrationDetail).toContainText('EUR');
  await expect(registrationDetail).toContainText('English');
  await expect(registrationDetail).toContainText('Europe/Prague');
  await expect(registrationDetail).not.toContainText('UNSAFE ADMIN');
  await expect(registrationDetail).not.toContainText('192.0.2.210');
  await expect(registrationDetail).not.toContainText('198.51.100.210');
  await expect(registrationDetail.getByText('99', { exact: true })).toHaveCount(0);
  await expect(registrationDetail.getByText('98', { exact: true })).toHaveCount(0);

  await page.goto('/app/requests');

  await page.getByTestId(`${rowPrefix}.change.55`).click();
  await expect(page).toHaveURL(/\/app\/requests\/change\/55$/);
  await expect(page.getByTestId('app.requests.detail.change.55')).toContainText('Moving home');
  await expect(page.getByTestId('app.requests.detail.change.55')).toContainText('New street 2');
  await expect(page.getByTestId('app.requests.detail.response')).toContainText('We are checking the address.');
  await expect(page.getByText('192.0.2.201')).toHaveCount(0);
  await expect(page.getByText('root')).toHaveCount(0);
  await expect(page.getByText('Review actions')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /resolve|approve|deny/i })).toHaveCount(0);
});

test('@workflow-matrix user requests: foreign or ownerless API data fails closed without leaking fields', async ({ page }) => {
  await setUiSettingsLocalStorage(page, { language: 'cs' });
  await bootstrapVpsAdminWindow(page);
  await installHaveApiMock(page, {
    user: { id: 10, login: 'alice', level: 1 },
    handlers: {
      'GET user_request/registrations': () => ({ registrations: [] }),
      'GET user_request/changes': () => ({
        changes: [{
          id: 66,
          user: { id: 99, login: 'mallory' },
          state: 'awaiting',
          change_reason: 'FOREIGN SECRET REASON',
          address: 'FOREIGN SECRET ADDRESS',
        }],
      }),
      'GET user_request/changes/66': () => ({
        change: {
          id: 66,
          state: 'awaiting',
          change_reason: 'OWNERLESS SECRET REASON',
          address: 'OWNERLESS SECRET ADDRESS',
        },
      }),
    },
  });

  await page.goto('/app/requests');
  await expect(page.getByRole('heading', { name: 'Moje žádosti' })).toBeVisible();
  await expect(page.getByTestId('app.requests.error')).toBeVisible();
  await expect(page.getByText('FOREIGN SECRET REASON')).toHaveCount(0);
  await expect(page.getByText('FOREIGN SECRET ADDRESS')).toHaveCount(0);
  await expect(page.getByText('mallory')).toHaveCount(0);

  await page.goto('/app/requests/change/66');
  await expect(page.getByTestId('app.requests.detail.error')).toBeVisible();
  await expect(page.getByText('OWNERLESS SECRET REASON')).toHaveCount(0);
  await expect(page.getByText('OWNERLESS SECRET ADDRESS')).toHaveCount(0);
  await expect(page.getByText('Tuto žádost nelze otevřít')).toBeVisible();
});

test('user requests: independent ID spaces paginate the complete merged history without skips', async ({ page, isMobile }) => {
  const indexUrls: URL[] = [];
  await setUiSettingsLocalStorage(page, { language: 'en' });
  await bootstrapVpsAdminWindow(page);
  await installHaveApiMock(page, {
    user: { id: '10', login: 'alice', level: 1 } as any,
    handlers: {
      'GET user_request/registrations': ({ url }) => {
        const requestUrl = new URL(url);
        indexUrls.push(requestUrl);
        const fromId = Number(requestUrl.searchParams.get('registration[from_id]')) || null;
        const limit = Number(requestUrl.searchParams.get('registration[limit]')) || 25;
        const all = Array.from({ length: 30 }, (_, index) => {
          const id = 130 - index;
          return {
            id,
            user: { id: 10 },
            state: 'awaiting',
            login: `registration-${id}`,
            created_at: new Date(Date.UTC(2026, 7, 1, 0, id - 100)).toISOString(),
          };
        });
        return {
          registrations: all
            .filter((request) => fromId === null || request.id < fromId)
            .slice(0, limit),
          _meta: { total_count: all.length },
        };
      },
      'GET user_request/changes': ({ url }) => {
        const requestUrl = new URL(url);
        indexUrls.push(requestUrl);
        const fromId = Number(requestUrl.searchParams.get('change[from_id]')) || null;
        const limit = Number(requestUrl.searchParams.get('change[limit]')) || 25;
        const all = [
          {
            id: 2,
            user: { id: '10' },
            state: 'awaiting',
            change_reason: 'newest change',
            created_at: '2026-08-01T00:31:00.000Z',
          },
          {
            id: 1,
            user: { id: '10' },
            state: 'awaiting',
            change_reason: 'oldest change',
            created_at: '2026-08-01T00:00:00.000Z',
          },
        ];
        return {
          changes: all
            .filter((request) => fromId === null || request.id < fromId)
            .slice(0, limit),
          _meta: { total_count: all.length },
        };
      },
    },
  });

  await page.goto('/app/requests');
  const rowPrefix = isMobile ? 'app.requests.mobile.row' : 'app.requests.row';
  const paginationPrefix = isMobile ? 'app.requests.pagination.mobile' : 'app.requests.pagination.desktop';
  await expect(page.getByTestId(`${rowPrefix}.change.2`)).toBeVisible();
  await expect(page.getByTestId(`${rowPrefix}.registration.130`)).toBeVisible();
  await expect(page.getByTestId(`${rowPrefix}.registration.107`)).toBeVisible();
  await expect(page.getByTestId(`${rowPrefix}.registration.106`)).toHaveCount(0);
  await expect(page.getByTestId(paginationPrefix)).toContainText('Page 1');
  await expect(page.getByTestId(`${paginationPrefix}.page.2`)).toBeVisible();

  await page.getByTestId(`${paginationPrefix}.next`).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/registration_from_id=107/);
  await expect(page).toHaveURL(/change_from_id=2/);
  await expect(page.getByTestId(`${rowPrefix}.registration.106`)).toBeVisible();
  await expect(page.getByTestId(`${rowPrefix}.registration.101`)).toBeVisible();
  await expect(page.getByTestId(`${rowPrefix}.change.1`)).toBeVisible();
  await expect(page.getByTestId(`${rowPrefix}.change.2`)).toHaveCount(0);
  await expect(page.getByTestId(`${paginationPrefix}.prev`)).toBeEnabled();

  expect(indexUrls).toHaveLength(4);
  const registrationUrls = indexUrls.filter((url) => url.pathname.endsWith('/user_request/registrations'));
  const changeUrls = indexUrls.filter((url) => url.pathname.endsWith('/user_request/changes'));
  expect(registrationUrls).toHaveLength(2);
  expect(changeUrls).toHaveLength(2);
  expect(registrationUrls[0]?.searchParams.has('registration[from_id]')).toBe(false);
  expect(changeUrls[0]?.searchParams.has('change[from_id]')).toBe(false);
  expect(registrationUrls[1]?.searchParams.get('registration[from_id]')).toBe('107');
  expect(changeUrls[1]?.searchParams.get('change[from_id]')).toBe('2');
  expect(indexUrls.every((url) => url.searchParams.get('_meta[count]') === 'true')).toBe(true);
});
