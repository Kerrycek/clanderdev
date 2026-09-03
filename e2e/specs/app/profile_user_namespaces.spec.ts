import { test, expect } from '@playwright/test';

import { installHaveApiMock } from '../../fixtures/haveapi';

type EntryKind = 'uid' | 'gid';

test('profile: user namespaces - create map and edit entries', async ({ page }) => {
  const namespaces = [{ id: 101, size: 65536 }];
  let maps: any[] = [];
  let entries: any[] = [];
  let nextMapId = 501;
  let nextEntryId = 1001;
  let namespacesListCalls = 0;
  let mapListCalls = 0;

  await installHaveApiMock({
    page,
    authorizeUser: {
      user: {
        id: 1,
        login: 'testuser',
        level: 1,
      },
    },
    handlers: {
      'GET user_namespaces': async (ctx) => {
        namespacesListCalls += 1;
        expect(ctx.searchParams.get('user_namespace[user]')).toBe('1');
        return { user_namespaces: namespaces };
      },

      'GET user_namespace_maps': async (ctx) => {
        mapListCalls += 1;
        expect(ctx.searchParams.get('user_namespace_map[user]')).toBe('1');
        return { user_namespace_maps: maps };
      },

      'POST user_namespace_maps': async (ctx) => {
        const b = await ctx.request.postDataJSON();
        expect(b.user_namespace_map.label).toBeTruthy();
        // For profile create, user_namespace is selected by dropdown/autoselect
        expect(b.user_namespace_map.user_namespace).toBe(101);

        const m = {
          id: nextMapId++,
          label: b.user_namespace_map.label,
          user_namespace: namespaces[0],
        };
        maps = [m, ...maps];
        return { user_namespace_map: m };
      },

      'GET user_namespace_maps/501': async () => ({ user_namespace_map: maps.find((m) => m.id === 501) }),

      'PUT user_namespace_maps/501': async (ctx) => {
        const b = await ctx.request.postDataJSON();
        const m = maps.find((x) => x.id === 501);
        m.label = b.user_namespace_map.label;
        return { user_namespace_map: m };
      },

      'GET user_namespace_maps/501/entries': async () => ({ entries }),

      'POST user_namespace_maps/501/entries': async (ctx) => {
        const b = await ctx.request.postDataJSON();
        const kind: EntryKind = b.entry.kind;
        const e = {
          id: nextEntryId++,
          kind,
          vps_id: b.entry.vps_id,
          ns_id: b.entry.ns_id,
          count: b.entry.count,
        };
        entries = [...entries, e];
        return { entry: e };
      },

      'PUT user_namespace_maps/501/entries/1001': async (ctx) => {
        const b = await ctx.request.postDataJSON();
        const e = entries.find((x) => x.id === 1001);
        e.vps_id = b.entry.vps_id;
        e.ns_id = b.entry.ns_id;
        e.count = b.entry.count;
        return { entry: e };
      },

      'DELETE user_namespace_maps/501/entries/1002': async () => {
        entries = entries.filter((e) => e.id !== 1002);
        return { ok: true };
      },

      // Used-by-VPS chip
      'GET vpses': async () => ({ vpses: [], _meta: { total_count: 0 } }),
    },
  });

  // Landing should redirect to maps when the user has exactly one namespace
  await page.goto('/app/profile/user-namespaces');
  await expect(page.getByTestId('profile.userns.maps.create')).toBeVisible({ timeout: 30_000 });
  expect(namespacesListCalls).toBeGreaterThan(0);
  expect(mapListCalls).toBeGreaterThan(0);

  // Create a new map
  await page.getByTestId('profile.userns.maps.create').click();
  await page.getByTestId('profile.userns.maps.create.label').fill('My map');
  await page.getByTestId('profile.userns.maps.create.submit').click();

  // Should navigate to map detail
  await expect(page).toHaveURL(/\/app\/profile\/user-namespaces\/maps\/501/);

  // Add a "both" entry (creates UID + GID)
  await page.getByTestId('profile.userns.map.add.kind').selectOption('both');
  await page.getByTestId('profile.userns.map.add.vps_id').fill('201');
  await page.getByTestId('profile.userns.map.add.ns_id').fill('1000');
  await page.getByTestId('profile.userns.map.add.count').fill('100');
  await page.getByTestId('profile.userns.map.add.submit').click();

  // Entries should show two rows
  await expect(page.getByTestId('profile.userns.map.entry.row.1001')).toContainText(/uid/i);
  await expect(page.getByTestId('profile.userns.map.entry.row.1002')).toContainText(/gid/i);

  // Edit count for first row and save
  await page.getByTestId('profile.userns.map.entry.1001.count').fill('200');
  await page.getByTestId('profile.userns.map.entries.save').click();

  // Delete second row
  await page.getByTestId('profile.userns.map.entry.1002.delete').click();
  await page.getByTestId('profile.userns.map.delete_entry.confirm.confirm').click();
  await expect(page.getByTestId('profile.userns.map.entry.row.1002')).toHaveCount(0);

  // Rename the map
  await page.getByTestId('profile.userns.map.rename.input').fill('Renamed map');
  await page.getByTestId('profile.userns.map.rename.save').click();
  await expect(page.getByTestId('profile.userns.map.subtitle')).toContainText('Renamed map');
});

test('profile: changing the map route drops stale edits and delete confirmation', async ({ page }) => {
  const map = (id: number) => ({
    id,
    label: `Map ${id}`,
    user_namespace: { id: 101, size: 65536 },
  });
  await installHaveApiMock({
    page,
    authorizeUser: { user: { id: 1, login: 'testuser', level: 1 } },
    handlers: {
      'GET user_namespace_maps/501': () => ({ user_namespace_map: map(501) }),
      'GET user_namespace_maps/502': () => ({ user_namespace_map: map(502) }),
      'GET user_namespace_maps/501/entries': () => ({ entries: [] }),
      'GET user_namespace_maps/502/entries': () => ({ entries: [] }),
      'GET vpses': () => ({ vpses: [], _meta: { total_count: 0 } }),
      'PUT user_namespace_maps/501': () => ({ user_namespace_map: map(501) }),
      'PUT user_namespace_maps/502': () => ({ user_namespace_map: map(502) }),
      'DELETE user_namespace_maps/501': () => ({}),
      'DELETE user_namespace_maps/502': () => ({}),
    },
  });
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
      && request.url().includes('/api/v7.0/user_namespace_maps')
    ) {
      mutations.push(request.url());
    }
  });

  await page.goto('/app/profile/user-namespaces/maps/501');
  await expect(page.getByTestId('profile.userns.map.rename.input')).toHaveValue('Map 501');
  await page.getByTestId('profile.userns.map.rename.input').fill('Stale map 501 rename');
  await page.getByTestId('profile.userns.map.add.vps_id').fill('201');
  await page.getByTestId('profile.userns.map.delete').click();
  await expect(page.getByTestId('profile.userns.map.delete_map.confirm')).toBeVisible();

  await page.evaluate(() => {
    window.history.pushState({}, '', '/app/profile/user-namespaces/maps/502');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  await expect(page.getByTestId('profile.userns.map.rename.input')).toHaveValue('Map 502');
  await expect(page.getByTestId('profile.userns.map.add.vps_id')).toHaveValue('');
  await expect(page.getByTestId('profile.userns.map.delete_map.confirm')).toHaveCount(0);
  expect(mutations).toEqual([]);
});
