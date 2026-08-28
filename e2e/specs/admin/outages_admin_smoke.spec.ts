import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, failEnvelope, installHaveApiMock, jsonFulfill } from '../../fixtures';

test.describe('@smoke Admin outage workflow', () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
  });

  test('validates create form and submits initial systems and handlers', async ({ page }) => {
    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET outages': () => ({ outages: [] }),
        'GET environments': () => ({ environments: [{ id: 2, label: 'Production' }] }),
        'GET locations': () => ({ locations: [{ id: 3, label: 'Prague' }] }),
        'GET nodes': () => ({ nodes: [{ id: 12, domain_name: 'node12' }] }),
        'GET components': () => ({ components: [{ id: 4, name: 'webui', label: 'WebUI' }] }),
        'GET users': () => ({ users: [{ id: 42, login: 'operator', full_name: 'Operator' }] }),
        'POST outages': () => ({ outage: { id: 7 } }),
        'GET outages/7/entities': () => ({ entities: [], _meta: { total_count: 0 } }),
        'GET outages/7/handlers': () => ({ handlers: [], _meta: { total_count: 0 } }),
        'POST outages/7/entities': () => ({ entity: { id: 100 } }),
        'POST outages/7/handlers': () => ({ handler: { id: 200 } }),
        'POST outages/7/rebuild_affected_vps': () => ({ outage: { id: 7 } }),
      },
    });
    const posts: Array<{ path: string; body: any }> = [];

    page.on('request', (req) => {
      const url = new URL(req.url());
      if (req.method() === 'POST' && url.pathname.includes('/outages')) {
        posts.push({ path: url.pathname, body: req.postDataJSON() });
      }
    });

    await page.goto('/admin/outages');
    await expect(page.getByTestId('admin.outages.page')).toBeVisible();

    await page.getByTestId('admin.outages.new').click();
    await expect(page.getByTestId('admin.outages.create.modal')).toBeVisible();

    await page.getByTestId('admin.outages.create.save').click();
    await expect(page.getByTestId('admin.outages.create.validation')).toBeVisible();
    expect(posts).toEqual([]);

    await page.getByTestId('admin.outages.form.duration').fill('30');
    await page.getByTestId('admin.outages.form.en_summary').fill('Maintenance');
    await page.getByTestId('admin.outages.form.cs_summary').fill('Udrzba');
    await page.getByTestId('admin.outages.systems.hierarchy.environment').selectOption('2');
    await page.getByTestId('admin.outages.systems.hierarchy.add_environment').click();
    await page.getByTestId('admin.outages.systems.hierarchy.location').selectOption('3');
    await page.getByTestId('admin.outages.systems.hierarchy.node').selectOption('12');
    await page.getByTestId('admin.outages.systems.hierarchy.add_node').click();
    await page.getByTestId('admin.outages.systems.components.select').selectOption('4');
    await page.getByTestId('admin.outages.systems.components.add').click();
    await page.getByTestId('admin.outages.systems.handlers.lookup').fill('op');
    await page.getByTestId('admin.outages.systems.handlers.lookup.opt.42').click();

    await expect(page.getByTestId('admin.outages.systems.scope.Environment.2')).toContainText('Production');
    await expect(page.getByTestId('admin.outages.systems.scope.Node.12')).toContainText('node12');
    await expect(page.getByTestId('admin.outages.systems.scope.vpsAdmin.4')).toContainText('WebUI');

    await page.getByTestId('admin.outages.create.save').click();
    await expect(page.getByTestId('admin.outages.create.confirm')).toBeVisible();
    expect(posts).toEqual([]);
    await page.getByTestId('admin.outages.create.confirm.confirm').click();

    await expect.poll(() => posts.map((p) => p.path)).toEqual([
      '/api/v7.0/outages',
      '/api/v7.0/outages/7/entities',
      '/api/v7.0/outages/7/entities',
      '/api/v7.0/outages/7/entities',
      '/api/v7.0/outages/7/handlers',
      '/api/v7.0/outages/7/rebuild_affected_vps',
    ]);
    expect(posts[0]?.body).toEqual({
      outage: expect.objectContaining({
        duration: 30,
        type: 'planned_outage',
        impact: 'tbd',
        en_summary: 'Maintenance',
        cs_summary: 'Udrzba',
      }),
    });
    expect(posts[1]?.body).toEqual({ entity: { name: 'Environment', entity_id: 2 } });
    expect(posts[2]?.body).toEqual({ entity: { name: 'Node', entity_id: 12 } });
    expect(posts[3]?.body).toEqual({ entity: { name: 'vpsAdmin', entity_id: 4 } });
    expect(posts[4]?.body).toEqual({ handler: { user: 42 } });
  });

  test('groups active, planned and finished outages into readable sections', async ({ page }) => {
    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET outages': () => ({
          outages: [
            { id: 1, state: 'announced', begins_at: '2026-01-01T10:00:00.000Z', en_summary: 'Active outage' },
            { id: 2, state: 'staged', begins_at: '2027-01-01T10:00:00.000Z', en_summary: 'Planned outage' },
            { id: 3, state: 'resolved', begins_at: '2026-01-01T08:00:00.000Z', en_summary: 'Finished outage' },
          ],
        }),
      },
    });

    await page.goto('/admin/outages');
    await expect(page.getByTestId('admin.outages.group.active')).toContainText('Active outage');
    await expect(page.getByTestId('admin.outages.group.active')).toContainText('1 on this page');
    await expect(page.getByTestId('admin.outages.group.planned')).toContainText('Planned outage');
    await expect(page.getByTestId('admin.outages.group.planned')).toContainText('1 on this page');
    await expect(page.getByTestId('admin.outages.group.finished')).toContainText('Finished outage');
    await expect(page.getByTestId('admin.outages.group.finished')).toContainText('1 on this page');
  });

  test('opens the staged report instead of allowing a duplicate retry after initial scope failure', async ({ page }) => {
    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET outages': () => ({ outages: [] }),
        'GET environments': () => ({ environments: [] }),
        'GET components': () => ({ components: [] }),
        'POST outages': () => ({ outage: { id: 9 } }),
        'POST outages/9/entities': () => failEnvelope('Scope rejected'),
        'GET outages/9': () => ({
          outage: {
            id: 9,
            begins_at: '2026-06-02T10:00:00.000Z',
            duration: 30,
            type: 'planned_outage',
            impact: 'tbd',
            state: 'staged',
            en_summary: 'Maintenance',
            cs_summary: 'Udrzba',
          },
        }),
        'GET outages/9/entities': () => ({ entities: [], _meta: { total_count: 0 } }),
        'GET outages/9/handlers': () => ({ handlers: [], _meta: { total_count: 0 } }),
        'POST outages/9/rebuild_affected_vps': () => ({ outage: { id: 9 } }),
        'GET outage_updates': () => ({ outage_updates: [] }),
        'GET user_outages': () => ({ user_outages: [] }),
        'GET vps_outages': () => ({ vps_outages: [] }),
        'GET export_outages': () => ({ export_outages: [] }),
        'GET outage_security_advisories': () => ({ outage_security_advisories: [] }),
      },
    });

    await page.goto('/admin/outages');
    await page.getByTestId('admin.outages.new').click();
    await page.getByTestId('admin.outages.form.duration').fill('30');
    await page.getByTestId('admin.outages.form.en_summary').fill('Maintenance');
    await page.getByTestId('admin.outages.form.cs_summary').fill('Udrzba');
    await page.getByTestId('admin.outages.systems.hierarchy.add_cluster').click();
    await page.getByTestId('admin.outages.create.save').click();
    await page.getByTestId('admin.outages.create.confirm.confirm').click();

    await expect(page).toHaveURL(/\/admin\/outages\/9$/);
    await expect(page.getByTestId('admin.outages.detail.page')).toBeVisible();
    await expect(page.getByText(/Outage #9 was created/i)).toBeVisible();
  });

  test('opens detail directly and covers edit, systems, update, affected lists and state confirmations', async ({ page }, testInfo) => {
    const requests: Array<{ method: string; path: string; body: any }> = [];
    let updateFails = true;

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET outages/7': () => ({
          outage: {
            id: 7,
            begins_at: '2026-06-02T10:00:00.000Z',
            duration: 30,
            type: 'planned_outage',
            impact: 'network',
            state: 'staged',
            auto_resolve: false,
            en_summary: 'Network outage',
            cs_summary: 'Vypadek site',
            affected_user_count: 25,
            affected_direct_vps_count: 1,
            affected_indirect_vps_count: 0,
            affected_export_count: 1,
          },
        }),
        'GET outages/7/entities': () => ({ entities: [{ id: 100, name: 'Node', entity_id: 12, label: 'Node node12' }], _meta: { total_count: 1 } }),
        'GET outages/7/handlers': () => ({ handlers: [{ id: 200, user: { id: 42, login: 'operator', _meta: { type: 'resource' } }, full_name: 'Operator' }], _meta: { total_count: 1 } }),
        'GET outage_updates': () => ({ outage_updates: [] }),
        'GET user_outages': () => ({ user_outages: Array.from({ length: 21 }, (_, index) => ({ id: 300 + index, user: { id: 5 + index, login: index === 0 ? 'alice' : `user-${index}` }, vps_count: 1, export_count: 1 })) }),
        'GET vps_outages': () => ({ vps_outages: [{ id: 301, vps: { id: 55, hostname: 'vps55' }, direct: true }] }),
        'GET export_outages': () => ({ export_outages: [{ id: 302, export: { id: 66, path: '/data' } }] }),
        'GET environments': () => ({ environments: [{ id: 2, label: 'Production' }] }),
        'GET locations': () => ({ locations: [{ id: 3, label: 'Prague' }] }),
        'GET nodes': () => ({ nodes: [{ id: 12, domain_name: 'node12' }, { id: 13, domain_name: 'node13' }] }),
        'GET components': () => ({ components: [{ id: 4, name: 'webui', label: 'WebUI' }] }),
        'GET users': () => ({ users: [{ id: 42, login: 'operator', full_name: 'Operator' }, { id: 43, login: 'responder' }] }),
        'GET outage_security_advisories': () => ({ outage_security_advisories: [{ id: 77, security_advisory: { id: 88, label: 'CVE-2026-0088' } }] }),
        'PUT outages/7': () => ({ outage: { id: 7 } }),
        'POST outages/7/entities': () => ({ entity: { id: 101 } }),
        'DELETE outages/7/entities/100': () => ({}),
        'POST outages/7/handlers': () => ({ handler: { id: 201 } }),
        'DELETE outages/7/handlers/200': () => ({}),
        'POST outages/7/rebuild_affected_vps': () => ({ outage: { id: 7 } }),
        'POST outage_updates': () => {
          if (updateFails) return failEnvelope('Update delivery failed');
          return { outage_update: { id: 400 } };
        },
      },
    });

    page.on('request', (req) => {
      const url = new URL(req.url());
      if (!url.pathname.startsWith('/api/v7.0/')) return;
      if (!['POST', 'PUT', 'DELETE'].includes(req.method())) return;
      requests.push({ method: req.method(), path: url.pathname, body: req.postDataJSON() });
    });

    await page.goto('/admin/outages/7');
    await expect(page.getByTestId('admin.outages.detail.page')).toBeVisible();
    await expect(page.getByText('alice · VPS 1 · exports 1')).toBeVisible();
    await expect(page.getByTestId('admin.outages.affected.users.preview_count')).toContainText('first 20 of 25');
    await expect(page.getByText('#55 vps55')).toBeVisible();
    await expect(page.getByText('#66 /data')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Node node12' })).toHaveAttribute('href', '/admin/nodes/12');
    await expect(page.getByRole('link', { name: 'CVE-2026-0088' })).toHaveAttribute('href', '/admin/security-advisories/88');

    await page.getByTestId('admin.outages.detail.edit_attrs').click();
    await expect(page.getByTestId('admin.outages.edit.modal')).toBeVisible();
    await page.getByTestId('admin.outages.form.duration').fill('45');
    await page.getByTestId('admin.outages.edit.save').click();
    await expect(page.getByTestId('admin.outages.edit.confirm')).toBeVisible();
    await page.getByTestId('admin.outages.edit.confirm.confirm').click();
    await expect.poll(() => requests.some((r) => r.method === 'PUT' && r.path === '/api/v7.0/outages/7')).toBeTruthy();
    expect(requests.find((r) => r.method === 'PUT' && r.path === '/api/v7.0/outages/7')?.body).toEqual({
      outage: expect.objectContaining({ duration: 45, impact: 'network', en_summary: 'Network outage' }),
    });
    await expect(page.getByTestId('admin.outages.edit.modal')).toHaveCount(0);

    await page.getByTestId('admin.outages.detail.edit_systems').click();
    await expect(page.getByTestId('admin.outages.systems.modal')).toBeVisible();
    await page.getByTestId('admin.outages.systems.hierarchy.environment').selectOption('2');
    await page.getByTestId('admin.outages.systems.hierarchy.location').selectOption('3');
    await page.getByTestId('admin.outages.systems.hierarchy.node').selectOption('13');
    await page.getByTestId('admin.outages.systems.hierarchy.add_node').click();
    await page.getByTestId('admin.outages.systems.handlers.lookup').fill('res');
    await page.getByTestId('admin.outages.systems.handlers.lookup.opt.43').click();
    await page.getByTestId('admin.outages.systems.save').click();
    await expect(page.getByTestId('admin.outages.systems.confirm')).toBeVisible();
    await page.getByTestId('admin.outages.systems.confirm.confirm').click();
    await expect.poll(() => requests.some((r) => r.path === '/api/v7.0/outages/7/rebuild_affected_vps')).toBeTruthy();
    expect(requests.some((r) => r.method === 'POST' && r.path === '/api/v7.0/outages/7/entities' && r.body?.entity?.entity_id === 13)).toBeTruthy();
    expect(requests.some((r) => r.method === 'POST' && r.path === '/api/v7.0/outages/7/handlers' && r.body?.handler?.user === 43)).toBeTruthy();
    await expect(page.getByTestId('admin.outages.systems.modal')).toHaveCount(0);

    await page.getByTestId('admin.outages.detail.post_update').click();
    await expect(page.getByTestId('admin.outages.update.modal')).toBeVisible();
    await page.getByTestId('admin.outages.form.en_summary').fill('Still investigating');
    await expect(page.getByTestId('admin.outages.form.en_summary')).toHaveValue('Still investigating');
    await page.getByTestId('admin.outages.form.cs_summary').fill('Proverujeme');
    await expect(page.getByTestId('admin.outages.form.cs_summary')).toHaveValue('Proverujeme');
    await page.getByTestId('admin.outages.update.save').click();
    await expect(page.getByTestId('admin.outages.update.confirm')).toBeVisible();
    await page.getByTestId('admin.outages.update.confirm.confirm').click();
    await expect(page.getByTestId('admin.outages.update.confirm')).toBeVisible();

    updateFails = false;
    await page.getByTestId('admin.outages.update.confirm.confirm').click();
    await expect.poll(() => requests.filter((r) => r.method === 'POST' && r.path === '/api/v7.0/outage_updates').length).toBeGreaterThanOrEqual(2);
    const manualUpdate = requests.filter((r) => r.method === 'POST' && r.path === '/api/v7.0/outage_updates').at(-1);
    expect(manualUpdate?.body).toEqual({
      outage_update: expect.objectContaining({
        outage: 7,
        send_mail: true,
        impact: 'network',
        en_summary: 'Still investigating',
        cs_summary: 'Proverujeme',
      }),
    });
    expect(manualUpdate?.body.outage_update).not.toHaveProperty('state');
    await expect(page.getByTestId('admin.outages.update.modal')).toHaveCount(0);

    await page.getByTestId('admin.outages.change_state.cancelled').click();
    await expect(page.getByTestId('admin.outages.change_state.confirm')).toBeVisible();
    const beforeConfirm = requests.filter((r) => r.method === 'POST' && r.path === '/api/v7.0/outage_updates').length;
    await page.getByTestId('admin.outages.change_state.confirm.cancel').click();
    expect(requests.filter((r) => r.method === 'POST' && r.path === '/api/v7.0/outage_updates')).toHaveLength(beforeConfirm);

    await page.getByTestId('admin.outages.change_state.cancelled').click();
    await page.getByTestId('admin.outages.change_state.confirm.confirm').click();
    await expect.poll(() => requests.filter((r) => r.method === 'POST' && r.path === '/api/v7.0/outage_updates').length).toBeGreaterThan(beforeConfirm);
    expect(requests.filter((r) => r.method === 'POST' && r.path === '/api/v7.0/outage_updates').at(-1)?.body).toEqual({
      outage_update: { outage: 7, state: 'cancelled', send_mail: true },
    });

    const proofScreenshot = process.env.E2E_OUTAGES_PROOF_SCREENSHOT?.trim();
    if (proofScreenshot && !testInfo.project.name.includes('mobile')) {
      await page.screenshot({ path: proofScreenshot, fullPage: true });
    }
  });

  test('keeps the structured scope workflow usable on a narrow viewport', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('mobile'), 'Mobile-specific layout proof');
    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET outages': () => ({ outages: [] }),
        'GET environments': () => ({ environments: [{ id: 2, label: 'Production' }] }),
        'GET locations': () => ({ locations: [{ id: 3, label: 'Prague' }] }),
        'GET nodes': () => ({ nodes: [{ id: 12, domain_name: 'node12.prg' }] }),
        'GET components': () => ({ components: [{ id: 4, name: 'webui', label: 'WebUI' }] }),
      },
    });

    await page.goto('/admin/outages');
    await page.getByTestId('admin.outages.new').click();
    await page.getByTestId('admin.outages.systems.hierarchy.environment').selectOption('2');
    await page.getByTestId('admin.outages.systems.hierarchy.location').selectOption('3');
    await page.getByTestId('admin.outages.systems.hierarchy.node').selectOption('12');
    await page.getByTestId('admin.outages.systems.hierarchy.add_node').click();
    await page.getByTestId('admin.outages.systems.hierarchy.add_node').click();
    await expect(page.getByTestId('admin.outages.systems.scope.Node.12')).toHaveCount(1);
    await page.getByTestId('admin.outages.systems.scope.Node.12.remove').click();
    await expect(page.getByTestId('admin.outages.systems.scope.Node.12')).toHaveCount(0);
    await page.getByTestId('admin.outages.systems.hierarchy.add_node').click();
    await expect(page.getByTestId('admin.outages.systems.scope.Node.12')).toBeVisible();

    const screenshot = process.env.E2E_OUTAGES_MOBILE_PROOF_SCREENSHOT?.trim();
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
  });

  test('keeps outage management read-only for support', async ({ page }) => {
    await installHaveApiMock(page, {
      user: { id: 2, login: 'support', level: 21 },
      handlers: {
        'GET outages': () => ({ outages: [{ id: 7, state: 'staged', begins_at: '2026-06-02T10:00:00.000Z', en_summary: 'Read-only outage' }] }),
        'GET outages/7': () => ({ outage: { id: 7, state: 'staged', begins_at: '2026-06-02T10:00:00.000Z', duration: 30, type: 'planned_outage', impact: 'network', en_summary: 'Read-only outage' } }),
        'GET outages/7/entities': () => ({ entities: [{ id: 100, name: 'Node', entity_id: 12, label: 'node12' }], _meta: { total_count: 1 } }),
        'GET outages/7/handlers': () => ({ handlers: [{ id: 200, full_name: 'Operator', note: 'on call' }], _meta: { total_count: 1 } }),
        'GET outage_updates': () => ({ outage_updates: [] }),
        'GET user_outages': () => ({ user_outages: [] }),
        'GET vps_outages': () => ({ vps_outages: [] }),
        'GET export_outages': () => ({ export_outages: [] }),
        'GET outage_security_advisories': () => ({ outage_security_advisories: [] }),
      },
    });
    const mutations: string[] = [];
    page.on('request', (request) => {
      if (
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) &&
        /\/api\/v7\.0\/(?:outages|outage_)/.test(request.url())
      ) {
        mutations.push(request.url());
      }
    });

    await page.goto('/admin/outages');
    await expect(page.getByText('Read-only outage')).toBeVisible();
    await expect(page.getByTestId('admin.outages.new')).toHaveCount(0);

    await page.goto('/admin/outages/7');
    await expect(page.getByTestId('admin.outages.detail.page')).toBeVisible();
    await expect(page.getByTestId('admin.outages.detail.edit_attrs')).toHaveCount(0);
    await expect(page.getByTestId('admin.outages.detail.edit_systems')).toHaveCount(0);
    await expect(page.getByTestId('admin.outages.detail.post_update')).toHaveCount(0);
    await expect(page.getByTestId('admin.outages.change_state.announced')).toHaveCount(0);
    expect(mutations).toEqual([]);
  });

  test('requires list verification after an indeterminate root create response', async ({ page }) => {
    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET outages': () => ({ outages: [] }),
        'GET environments': () => ({ environments: [] }),
        'GET components': () => ({ components: [] }),
        'POST outages': () => jsonFulfill(failEnvelope('gateway response lost'), 503),
      },
    });

    await page.goto('/admin/outages');
    await page.getByTestId('admin.outages.new').click();
    await page.getByTestId('admin.outages.form.duration').fill('30');
    await page.getByTestId('admin.outages.form.en_summary').fill('Maintenance');
    await page.getByTestId('admin.outages.form.cs_summary').fill('Udrzba');
    await page.getByTestId('admin.outages.create.save').click();
    await page.getByTestId('admin.outages.create.confirm.confirm').click();

    await expect(page.getByTestId('admin.outages.create.indeterminate')).toBeVisible();
    await expect(page.getByTestId('admin.outages.new')).toBeDisabled();
    await page.getByTestId('admin.outages.create.verify').click();
    await expect(page.getByTestId('admin.outages.create.indeterminate')).toHaveCount(0);
    await expect(page.getByTestId('admin.outages.new')).toBeEnabled();
  });
});
