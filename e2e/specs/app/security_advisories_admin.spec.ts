import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

const languages = [
  { id: 1, code: 'en', label: 'English' },
  { id: 2, code: 'cs', label: 'Čeština' },
];

test.describe('@smoke Security advisory admin management', () => {
  test('creates a localized draft together with normalized CVE references', async ({ page }) => {
    let advisoryPayload: any;
    const cvePayloads: any[] = [];
    let createdAdvisory: Record<string, unknown> | null = null;
    const createdCves: Array<Record<string, unknown>> = [];

    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 1, login: 'security-admin', level: 90 },
      handlers: {
        'GET languages': () => ({ languages }),
        'GET security_advisories': () => ({ security_advisories: [] }),
        'POST security_advisories': ({ reqJson }) => {
          advisoryPayload = reqJson;
          createdAdvisory = {
            id: 77,
            state: 'draft',
            created_at: '2026-07-27T10:00:00.000Z',
            ...(advisoryPayload?.security_advisory ?? {}),
          };
          return { security_advisory: createdAdvisory };
        },
        'POST security_advisory_cves': ({ reqJson }) => {
          cvePayloads.push(reqJson);
          const cve = {
            id: 900 + cvePayloads.length,
            security_advisory_id: 77,
            ...(reqJson as any)?.security_advisory_cve,
          };
          createdCves.push(cve);
          return { security_advisory_cve: cve };
        },

        // The successful create navigates straight to the detail. Keep that
        // route deterministic as well so the assertion cannot race a failed
        // background query.
        'GET security_advisories/77': () => ({ security_advisory: createdAdvisory }),
        'GET security_advisory_cves': () => ({ security_advisory_cves: createdCves }),
        'GET nodes': () => ({ nodes: [] }),
        'GET security_advisories/77/node_statuses': () => ({ node_statuses: [] }),
        'GET security_advisory_updates': () => ({ security_advisory_updates: [] }),
        'GET outage_security_advisories': () => ({ outage_security_advisories: [] }),
      },
    });

    await page.goto('/admin/security-advisories');
    await expect(page.getByTestId('admin.security_advisories.page')).toBeVisible();
    await page.getByTestId('admin.security_advisories.create').click();
    await expect(page.getByTestId('admin.security_advisories.editor')).toBeVisible();

    await page
      .getByTestId('admin.security_advisories.editor.cves')
      .fill('cve-2026-12345; CVE-2026-23456');
    await page.getByTestId('admin.security_advisories.editor.name').fill('Linux kernel advisory');
    await page.getByTestId('admin.security_advisories.editor.published_at').fill('2026-07-27T12:30');

    await page.getByTestId('admin.security_advisories.editor.en.summary').fill('Kernel vulnerability');
    await page
      .getByTestId('admin.security_advisories.editor.en.description')
      .fill('Affects supported compute nodes.');
    await page
      .getByTestId('admin.security_advisories.editor.en.response')
      .fill('Apply the fixed kernel and reboot.');

    await page.getByTestId('admin.security_advisories.editor.language.cs').click();
    await page.getByTestId('admin.security_advisories.editor.cs.summary').fill('Zranitelnost kernelu');
    await page
      .getByTestId('admin.security_advisories.editor.cs.description')
      .fill('Týká se podporovaných výpočetních nodů.');
    await page
      .getByTestId('admin.security_advisories.editor.cs.response')
      .fill('Nasaď opravený kernel a restartuj.');

    await page.getByTestId('admin.security_advisories.editor.save').click();

    await expect(page).toHaveURL(/\/admin\/security-advisories\/77$/);
    await expect.poll(() => cvePayloads.length).toBe(2);
    expect(advisoryPayload).toEqual({
      security_advisory: expect.objectContaining({
        name: 'Linux kernel advisory',
        published_at: expect.any(String),
        en_summary: 'Kernel vulnerability',
        en_description: 'Affects supported compute nodes.',
        en_response: 'Apply the fixed kernel and reboot.',
        cs_summary: 'Zranitelnost kernelu',
        cs_description: 'Týká se podporovaných výpočetních nodů.',
        cs_response: 'Nasaď opravený kernel a restartuj.',
      }),
    });
    expect(cvePayloads).toEqual([
      { security_advisory_cve: { security_advisory: 77, cve_id: 'CVE-2026-12345' } },
      { security_advisory_cve: { security_advisory: 77, cve_id: 'CVE-2026-23456' } },
    ]);
  });

  test('gates publishing, manages node assessments, retracts through an update and links an outage', async ({
    page,
  }) => {
    const mutations: Array<{ method: string; path: string; body: any }> = [];
    let advisory = {
      id: 77,
      state: 'draft',
      name: 'Linux kernel advisory',
      published_at: null as string | null,
      created_at: '2026-07-27T10:00:00.000Z',
      en_summary: 'Kernel vulnerability',
      en_description: 'Affects supported compute nodes.',
      en_response: 'Apply the fixed kernel and reboot.',
      cs_summary: 'Zranitelnost kernelu',
      cs_description: 'Týká se podporovaných výpočetních nodů.',
      cs_response: 'Nasaď opravený kernel a restartuj.',
      affected_node_count: 2,
      affected_user_count: 4,
      affected_vps_count: 8,
    };
    const cves = [
      { id: 901, security_advisory_id: 77, cve_id: 'CVE-2026-12345' },
    ];
    const nodes = [
      { id: 10, active: true, type: 'node', domain_name: 'node10.prg' },
      { id: 20, active: true, type: 'storage', domain_name: 'storage20.prg' },
      { id: 30, active: false, type: 'node', domain_name: 'retired30.prg' },
    ];
    let statuses = [
      {
        id: 501,
        security_advisory_id: 77,
        node_id: 10,
        node: nodes[0],
        state: 'unknown',
        vulnerable_until: null,
        mitigated_since: null,
        note: null,
      },
      {
        id: 502,
        security_advisory_id: 77,
        node_id: 20,
        node: nodes[1],
        state: 'not_affected',
        vulnerable_until: null,
        mitigated_since: null,
        note: 'Storage is not affected',
      },
    ];
    let updates: Array<Record<string, unknown>> = [];
    let outageLinks: Array<Record<string, unknown>> = [];

    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 1, login: 'security-admin', level: 90 },
      handlers: {
        'GET languages': () => ({ languages }),
        'GET security_advisories/77': () => ({ security_advisory: advisory }),
        'GET security_advisory_cves': () => ({ security_advisory_cves: cves }),
        'GET nodes': () => ({ nodes }),
        'GET security_advisories/77/node_statuses': () => ({ node_statuses: statuses }),
        'GET security_advisory_updates': () => ({ security_advisory_updates: updates }),
        'GET outage_security_advisories': () => ({ outage_security_advisories: outageLinks }),

        'PUT security_advisories/77/node_statuses/501': ({ reqJson }) => {
          const attrs = (reqJson as any)?.node_status ?? {};
          statuses = statuses.map((status) =>
            status.id === 501 ? { ...status, ...attrs, node_id: 10, node: nodes[0] } : status,
          );
          return { node_status: statuses.find((status) => status.id === 501) };
        },
        'PUT security_advisories/77/node_statuses/502': ({ reqJson }) => {
          const attrs = (reqJson as any)?.node_status ?? {};
          statuses = statuses.map((status) =>
            status.id === 502 ? { ...status, ...attrs, node_id: 20, node: nodes[1] } : status,
          );
          return { node_status: statuses.find((status) => status.id === 502) };
        },
        'POST security_advisories/77/publish': ({ reqJson }) => {
          const attrs = (reqJson as any)?.security_advisory ?? {};
          advisory = { ...advisory, ...attrs, state: 'published' };
          return { security_advisory: advisory };
        },
        'POST security_advisory_updates': ({ reqJson }) => {
          const attrs = (reqJson as any)?.security_advisory_update ?? {};
          const update = {
            id: 701,
            created_at: '2026-07-27T13:00:00.000Z',
            reporter_name: 'security-admin',
            ...attrs,
          };
          updates = [update, ...updates];
          if (attrs.state === 'retracted') advisory = { ...advisory, state: 'retracted' };
          return { security_advisory_update: update };
        },
        'POST outage_security_advisories': ({ reqJson }) => {
          const attrs = (reqJson as any)?.outage_security_advisory ?? {};
          const link = {
            id: 801,
            security_advisory_id: 77,
            outage_id: attrs.outage,
            outage: {
              id: attrs.outage,
              begins_at: '2026-07-27T14:00:00.000Z',
              en_summary: 'Emergency kernel maintenance',
              cs_summary: 'Nouzová údržba kernelu',
            },
          };
          outageLinks = [link];
          return { outage_security_advisory: link };
        },
      },
    });

    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/v7.0/')) return;
      if (!['POST', 'PUT', 'DELETE'].includes(request.method())) return;
      mutations.push({ method: request.method(), path: url.pathname, body: request.postDataJSON() });
    });

    await page.goto('/admin/security-advisories/77');
    await expect(page.getByTestId('admin.security_advisory.detail')).toBeVisible();
    await expect(page.getByTestId('admin.security_advisory.readiness')).toBeVisible();
    await expect(page.getByTestId('admin.security_advisory.publish')).toBeDisabled();
    await expect(page.getByTestId('admin.security_advisory.edit')).toBeVisible();
    await expect(page.getByTestId('admin.security_advisory.post_update')).toHaveCount(0);
    await page.getByTestId('admin.security_advisory.tab.updates').click();
    await expect(page.getByTestId('admin.security_advisory.updates.post_update')).toHaveCount(0);
    await expect(page.getByText('Publish this draft before posting follow-up updates.')).toBeVisible();

    // Resolve an individual assessment first, including the date validation
    // required for a mitigated node.
    await page.getByTestId('admin.security_advisory.tab.nodes').click();
    await expect(page.getByTestId('admin.security_advisories.nodes.row.10')).toBeVisible();
    await page.getByTestId('admin.security_advisories.nodes.row.10.edit').click();
    await page.getByTestId('admin.security_advisories.nodes.editor.state').selectOption('mitigated');
    await page
      .getByTestId('admin.security_advisories.nodes.editor.vulnerable_until')
      .fill('2026-07-27T11:00');
    await page
      .getByTestId('admin.security_advisories.nodes.editor.mitigated_since')
      .fill('2026-07-27T12:00');
    await page.getByTestId('admin.security_advisories.nodes.editor.note').fill('Fixed kernel installed');
    await page.getByTestId('admin.security_advisories.nodes.editor.save').click();
    await expect(page.getByTestId('admin.security_advisories.nodes.editor')).toHaveCount(0);
    await expect
      .poll(() =>
        mutations.some(
          (mutation) =>
            mutation.method === 'PUT' &&
            mutation.path === '/api/v7.0/security_advisories/77/node_statuses/501' &&
            mutation.body?.node_status?.state === 'mitigated',
        ),
      )
      .toBeTruthy();

    // Bulk assessment applies the same explicit result to every active compute
    // and storage node, but skips the inactive node.
    await page.getByTestId('admin.security_advisories.nodes.bulk.open').click();
    await page.getByTestId('admin.security_advisories.nodes.bulk.state').selectOption('not_affected');
    await page.getByTestId('admin.security_advisories.nodes.bulk.apply').click();
    await expect(page.getByTestId('admin.security_advisories.nodes.bulk.confirm')).toBeVisible();
    await page.getByTestId('admin.security_advisories.nodes.bulk.confirm.confirm').click();
    await expect(page.getByTestId('admin.security_advisories.nodes.bulk')).toHaveCount(0);
    await expect.poll(() => statuses.map((status) => status.state)).toEqual(['not_affected', 'not_affected']);
    expect(mutations.some((mutation) => mutation.path.endsWith('/node_statuses/502'))).toBeTruthy();
    expect(mutations.some((mutation) => mutation.path.endsWith('/node_statuses/503'))).toBeFalsy();

    // Readiness now has a CVE and a resolved status for every relevant node.
    await page.getByTestId('admin.security_advisory.tab.overview').click();
    await expect(page.getByTestId('admin.security_advisory.publish')).toBeEnabled();
    await page.getByTestId('admin.security_advisory.publish').click();
    await expect(page.getByTestId('admin.security_advisory.publish_dialog')).toBeVisible();
    await page.getByTestId('admin.security_advisory.publish_dialog.send_mail').check();
    await page.getByTestId('admin.security_advisory.publish_dialog.confirm').click();
    await expect(page.getByTestId('admin.security_advisory.publish_dialog')).toHaveCount(0);
    await expect(page.getByTestId('admin.security_advisory.post_update')).toBeVisible();
    await expect(page.getByTestId('admin.security_advisory.edit')).toHaveCount(0);
    expect(
      mutations.find(
        (mutation) =>
          mutation.method === 'POST' &&
          mutation.path === '/api/v7.0/security_advisories/77/publish',
      )?.body,
    ).toEqual({
      security_advisory: expect.objectContaining({ send_mail: true, published_at: expect.any(String) }),
    });

    // Retraction is represented by a localized advisory update and requires a
    // second explicit confirmation before the API mutation is sent.
    await page.getByTestId('admin.security_advisory.post_update').click();
    await page.getByTestId('admin.security_advisories.update.editor.state').selectOption('retracted');
    await page
      .getByTestId('admin.security_advisories.update.editor.en.summary')
      .fill('Advisory retracted');
    await page
      .getByTestId('admin.security_advisories.update.editor.en.message')
      .fill('The report was based on incorrect package metadata.');
    await page.getByTestId('admin.security_advisories.update.editor.language.cs').click();
    await page
      .getByTestId('admin.security_advisories.update.editor.cs.summary')
      .fill('Upozornění staženo');
    await page
      .getByTestId('admin.security_advisories.update.editor.cs.message')
      .fill('Hlašení vycházelo z chybných metadat balíčku.');
    await page.getByTestId('admin.security_advisories.update.editor.save').click();
    await expect(page.getByTestId('admin.security_advisory.update.confirm')).toBeVisible();
    await page.getByTestId('admin.security_advisory.update.confirm.confirm').click();
    await expect(page.getByTestId('admin.security_advisories.update.editor')).toHaveCount(0);
    await expect.poll(() => advisory.state).toBe('retracted');
    await expect(page.getByTestId('admin.security_advisory.post_update')).toHaveCount(0);
    await page.getByTestId('admin.security_advisory.tab.updates').click();
    await expect(page.getByTestId('admin.security_advisory.updates.post_update')).toHaveCount(0);
    await expect(page.getByText(/This advisory is retracted/)).toBeVisible();
    const postedUpdate = page.getByTestId('admin.security_advisory.update.701');
    await expect(postedUpdate).toBeVisible();
    await expect(postedUpdate.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await expect(postedUpdate.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    expect(
      mutations.find(
        (mutation) =>
          mutation.method === 'POST' &&
          mutation.path === '/api/v7.0/security_advisory_updates',
      )?.body,
    ).toEqual({
      security_advisory_update: expect.objectContaining({
        security_advisory: 77,
        state: 'retracted',
        send_mail: false,
        en_summary: 'Advisory retracted',
        cs_summary: 'Upozornění staženo',
      }),
    });

    // Link a related outage from the dedicated tab and verify the nested API
    // payload as well as the refreshed row.
    await page.getByTestId('admin.security_advisory.tab.outages').click();
    const outageInput = page.getByTestId('admin.security_advisory.outages.id');
    await outageInput.fill('321');
    await outageInput.locator('xpath=..').getByRole('button').click();
    await expect(page.getByRole('link', { name: '#321' })).toBeVisible();
    expect(
      mutations.find(
        (mutation) =>
          mutation.method === 'POST' &&
          mutation.path === '/api/v7.0/outage_security_advisories',
      )?.body,
    ).toEqual({ outage_security_advisory: { outage: 321, security_advisory: 77 } });
  });

  test('rejects a normal user before any advisory administration is rendered', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 2, login: 'member', level: 1 },
      handlers: {
        'GET security_advisories': () => ({ security_advisories: [] }),
      },
    });

    await page.goto('/admin/security-advisories/77');

    await expect(page.getByTestId('auth.admin-required')).toBeVisible();
    await expect(page.getByTestId('admin.security_advisory.detail')).toHaveCount(0);
    await expect(page.getByTestId('admin.security_advisories.page')).toHaveCount(0);
  });

  test('hides advisory management from support and rejects direct route access', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 3, login: 'support-agent', level: 21 },
      handlers: {
        'GET security_advisories': () => ({ security_advisories: [] }),
      },
    });

    await page.goto('/admin');
    await expect(page.getByTestId('nav.sidebar.security-advisories')).toHaveCount(0);
    await expect(page.getByTestId('nav.drawer.security-advisories')).toHaveCount(0);

    await page.goto('/admin/security-advisories/77');

    await expect(page).toHaveURL(/\/admin\/?$/);
    await expect(page.getByTestId('admin.security_advisory.detail')).toHaveCount(0);
    await expect(page.getByTestId('admin.security_advisories.page')).toHaveCount(0);
  });
});
