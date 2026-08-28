import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock, setUiSettingsLocalStorage } from '../../fixtures';

async function captureProof(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  if (process.env.E2E_CAPTURE_SCREENSHOTS !== '1') return;
  const dir = process.env.E2E_SCREENSHOT_DIR?.trim() || 'docs/e2e-screenshots';
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: path.join(dir, `${name}-${testInfo.project.name}.png`),
    fullPage: true,
  });
}

async function prepare(page: Page, handlers: Record<string, (ctx: any) => unknown>, level = 100) {
  await setUiSettingsLocalStorage(page, { language: 'en' });
  await bootstrapVpsAdminWindow(page, { sessionToken: 'NODE_LIFECYCLE' });
  await installHaveApiMock(page, {
    user: { id: 1, login: level >= 90 ? 'admin' : 'support', level },
    handlers: {
      'GET nodes/public_status': () => [],
      'GET nodes': () => ({ nodes: [] }),
      ...handlers,
    },
  });
}

test.describe('Admin node create and edit lifecycle', () => {
  test('@smoke creates a node through lookup, review and tracked single submit', async ({ page }, testInfo) => {
    let createCalls = 0;
    let requestBody: any = null;
    await prepare(page, {
      'OPTIONS nodes': () => ({
        input: {
          parameters: {
            name: { required: true },
            location: { required: true },
            cpus: { required: true },
            total_memory: { required: true },
            total_swap: { required: true },
          },
        },
      }),
      'GET locations': () => ({
        locations: [
          { id: 3, label: 'Prague DC1', environment: { id: 8, label: 'Production' } },
          { id: 9, label: 'Brno lab', environment: { id: 10, label: 'Playground' } },
        ],
      }),
      'POST nodes': async (ctx) => {
        createCalls += 1;
        requestBody = ctx.reqJson;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          node: { id: 42, name: 'node42', type: 'node', ip_addr: '192.0.2.42' },
          _meta: { action_state_id: 7001 },
        };
      },
    });

    await page.goto('/admin/nodes');
    await page.getByTestId('admin.nodes.create').click();
    await expect(page.getByTestId('admin.node.editor.modal')).toBeVisible();
    await page.getByTestId('admin.node.editor.name').fill('node42');
    await page.getByTestId('admin.node.editor.location').selectOption('3');
    await page.getByTestId('admin.node.editor.ip').fill('192.0.2.42');
    await page.getByTestId('admin.node.editor.max_vps').fill('120');
    await page.getByTestId('admin.node.editor.cpus').fill('16');
    await page.getByTestId('admin.node.editor.memory').fill('32768');
    await page.getByTestId('admin.node.editor.swap').fill('4096');

    await page.getByTestId('admin.node.editor.continue').click();
    await expect(page.getByTestId('admin.node.editor.review')).toContainText('Production · Prague DC1');
    await expect(page.getByTestId('admin.node.editor.review')).toContainText('Hypervisor node');
    await expect(page.getByTestId('admin.node.editor.review')).toContainText('Yes');
    await expect(page.getByTestId('admin.node.editor.review')).not.toContainText('#3');
    await expect(page.getByTestId('admin.node.editor.review')).not.toContainText('vpsadminos');
    await captureProof(page, testInfo, 'admin-node-create-review');

    await page.getByTestId('admin.node.editor.submit').dblclick();
    await expect(page).toHaveURL(/\/admin\/nodes\/42$/);
    expect(createCalls).toBe(1);
    expect(requestBody?.node).toMatchObject({
      name: 'node42',
      type: 'node',
      location: 3,
      ip_addr: '192.0.2.42',
      cpus: 16,
      total_memory: 32768,
      total_swap: 4096,
      max_vps: 120,
      maintenance: true,
    });
  });

  test('does not invent capacity values when the current upstream contract makes them optional', async ({ page }) => {
    let requestBody: any = null;
    await prepare(page, {
      'OPTIONS nodes': () => ({
        input: {
          parameters: {
            name: { required: true },
            location: { required: true },
            cpus: {},
            total_memory: {},
            total_swap: {},
          },
        },
      }),
      'GET locations': () => ({
        locations: [{ id: 3, label: 'Prague DC1', environment: { id: 8, label: 'Production' } }],
      }),
      'POST nodes': (ctx) => {
        requestBody = ctx.reqJson;
        return { node: { id: 43, name: 'storage43', type: 'storage', ip_addr: '192.0.2.43' } };
      },
    });

    await page.goto('/admin/nodes');
    await page.getByTestId('admin.nodes.create').click();
    await expect(page.getByTestId('admin.node.editor.bootstrap.description')).toContainText(/does not require|nevyžaduje/i);
    await page.getByTestId('admin.node.editor.name').fill('storage43');
    await page.getByTestId('admin.node.editor.role').selectOption('storage');
    await page.getByTestId('admin.node.editor.location').selectOption('3');
    await page.getByTestId('admin.node.editor.ip').fill('192.0.2.43');
    await page.getByTestId('admin.node.editor.continue').click();
    await page.getByTestId('admin.node.editor.submit').click();
    await expect(page).toHaveURL(/\/admin\/nodes\/43$/);

    expect(requestBody?.node).not.toHaveProperty('cpus');
    expect(requestBody?.node).not.toHaveProperty('total_memory');
    expect(requestBody?.node).not.toHaveProperty('total_swap');
  });

  test('edits only mutable fields and keeps the modal open on a 403', async ({ page }, testInfo) => {
    let requestBody: any = null;
    const node = {
      id: 5,
      active: true,
      name: 'node5',
      domain_name: 'node5.prg',
      type: 'node',
      location: { id: 3, label: 'Prague DC1' },
      ip_addr: '192.0.2.5',
      max_vps: 100,
      cpus: 24,
      total_memory: 65536,
      total_swap: 8192,
    };
    await prepare(page, {
      'GET nodes/5': () => ({ node }),
      'GET nodes/public_status': () => [{ id: 5, status: true }],
      'GET nodes/5/statuses': () => ({ statuses: [] }),
      'GET transactions': () => ({ transactions: [] }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'OPTIONS nodes/5': () => ({ input: { parameters: { name: {}, ip_addr: {} } } }),
      'PUT nodes/5': (ctx) => {
        requestBody = ctx.reqJson;
        return {
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ status: false, message: 'forbidden', response: null }),
        };
      },
    });

    await page.goto('/admin/nodes/5');
    await page.getByTestId('admin.node.edit').click();
    await page.getByTestId('admin.node.editor.name').fill('node5-renamed');
    await page.getByTestId('admin.node.editor.continue').click();
    await expect(page.getByTestId('admin.node.editor.review')).toContainText('node5-renamed');
    await captureProof(page, testInfo, 'admin-node-edit-review');
    await page.getByTestId('admin.node.editor.submit').click();

    await expect(page.getByTestId('admin.node.editor.submit_error')).toContainText('forbidden');
    await expect(page.getByTestId('admin.node.editor.modal')).toBeVisible();
    expect(requestBody?.node).toEqual({ name: 'node5-renamed' });
    expect(requestBody?.node).not.toHaveProperty('type');
    expect(requestBody?.node).not.toHaveProperty('location');
    expect(requestBody?.node).not.toHaveProperty('cpus');
    expect(requestBody?.node).not.toHaveProperty('total_memory');
    expect(requestBody?.node).not.toHaveProperty('total_swap');
    await page.getByTestId('admin.node.editor.cancel').click();
    await expect(page.getByTestId('admin.node.editor.modal')).toHaveCount(0);
  });

  test('preserves a dirty edit draft when polling refreshes the same node', async ({ page }, testInfo) => {
    let nodeCalls = 0;
    const baseNode = {
      id: 5,
      active: true,
      name: 'node5',
      domain_name: 'node5.prg',
      type: 'node',
      location: { id: 3, label: 'Prague DC1' },
      ip_addr: '192.0.2.5',
      max_vps: 100,
    };
    await prepare(page, {
      'GET nodes/5': () => {
        nodeCalls += 1;
        return { node: { ...baseNode, name: nodeCalls > 1 ? 'node5-from-poll' : baseNode.name } };
      },
      'GET nodes/public_status': () => [{ id: 5, status: true }],
      'GET nodes/5/statuses': () => ({ statuses: [] }),
      'GET transactions': () => ({ transactions: [] }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'OPTIONS nodes/5': () => ({ input: { parameters: { name: {}, ip_addr: {}, max_vps: {} } } }),
    });

    await page.goto('/admin/nodes/5');
    await page.getByTestId('admin.node.edit').click();
    await page.getByTestId('admin.node.editor.name').fill('my-dirty-node-name');
    // Wait for the real Tier B detail polling interval. Clicking the refresh
    // button through the modal backdrop would exercise an impossible UI path
    // instead of the regression that previously erased dirty form state.
    await expect.poll(() => nodeCalls, { timeout: 25_000 }).toBeGreaterThan(1);
    await expect(page.getByTestId('admin.node.editor.name')).toHaveValue('my-dirty-node-name');
    await captureProof(page, testInfo, 'admin-node-edit-dirty-refresh');
  });

  test('submits max_vps zero as a real edit instead of treating it as empty', async ({ page }) => {
    let requestBody: any = null;
    const node = {
      id: 5,
      active: true,
      name: 'node5',
      domain_name: 'node5.prg',
      type: 'node',
      location: { id: 3, label: 'Prague DC1' },
      ip_addr: '192.0.2.5',
      max_vps: 100,
    };
    await prepare(page, {
      'GET nodes/5': () => ({ node }),
      'GET nodes/public_status': () => [{ id: 5, status: true }],
      'GET nodes/5/statuses': () => ({ statuses: [] }),
      'GET transactions': () => ({ transactions: [] }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'OPTIONS nodes/5': () => ({ input: { parameters: { name: {}, ip_addr: {}, max_vps: {} } } }),
      'PUT nodes/5': (ctx) => {
        requestBody = ctx.reqJson;
        return {};
      },
    });

    await page.goto('/admin/nodes/5');
    await page.getByTestId('admin.node.edit').click();
    await page.getByTestId('admin.node.editor.max_vps').fill('0');
    await page.getByTestId('admin.node.editor.continue').click();
    await page.getByTestId('admin.node.editor.submit').click();
    await expect(page.getByTestId('admin.node.editor.modal')).toHaveCount(0);
    expect(requestBody?.node).toEqual({ max_vps: 0 });
  });

  test('rejects clearing an existing non-nullable node limit instead of reporting a false save', async ({ page }) => {
    let updateCalls = 0;
    const node = {
      id: 5,
      active: true,
      name: 'node5',
      domain_name: 'node5.prg',
      type: 'node',
      location: { id: 3, label: 'Prague DC1' },
      ip_addr: '192.0.2.5',
      max_vps: 100,
    };
    await prepare(page, {
      'GET nodes/5': () => ({ node }),
      'GET nodes/public_status': () => [{ id: 5, status: true }],
      'GET nodes/5/statuses': () => ({ statuses: [] }),
      'GET transactions': () => ({ transactions: [] }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'OPTIONS nodes/5': () => ({ input: { parameters: { name: {}, ip_addr: {}, max_vps: {} } } }),
      'PUT nodes/5': () => {
        updateCalls += 1;
        return {};
      },
    });

    await page.goto('/admin/nodes/5');
    await page.getByTestId('admin.node.edit').click();
    await page.getByTestId('admin.node.editor.max_vps').fill('');
    await page.getByTestId('admin.node.editor.continue').click();
    await expect(page.getByTestId('admin.node.editor.validation_error')).toContainText('Maximum VPS');
    await expect(page.getByTestId('admin.node.editor.review')).toHaveCount(0);
    expect(updateCalls).toBe(0);
  });

  test('reconciles an indeterminate create beyond the visible page and prevents a duplicate POST', async ({ page }, testInfo) => {
    let createCalls = 0;
    let reconcileCalls = 0;
    await prepare(page, {
      'OPTIONS nodes': () => ({ input: { parameters: { name: { required: true }, location: { required: true } } } }),
      'GET locations': () => ({
        locations: [{ id: 3, label: 'Prague DC1', environment: { id: 8, label: 'Production' } }],
      }),
      'GET nodes': (ctx) => {
        if (ctx.searchParams.get('node[state]') === 'all') {
          reconcileCalls += 1;
          return reconcileCalls === 1
            ? { nodes: [{ id: 10, name: 'node10', ip_addr: '192.0.2.10', active: true }] }
            : { nodes: [{ id: 42, name: 'node42', ip_addr: '192.0.2.42', active: true }] };
        }
        return { nodes: [{ id: 5, name: 'visible-node', ip_addr: '192.0.2.5', active: true }] };
      },
      'POST nodes': () => {
        createCalls += 1;
        return {
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ status: false, message: 'response lost', response: null }),
        };
      },
    });

    await page.goto('/admin/nodes');
    await page.getByTestId('admin.nodes.create').click();
    await page.getByTestId('admin.node.editor.name').fill('node42');
    await page.getByTestId('admin.node.editor.location').selectOption('3');
    await page.getByTestId('admin.node.editor.ip').fill('192.0.2.42');
    await page.getByTestId('admin.node.editor.max_vps').fill('0');
    await page.getByTestId('admin.node.editor.continue').click();
    await page.getByTestId('admin.node.editor.submit').click();

    await expect(page.getByTestId('admin.node.editor.modal')).toHaveCount(0);
    await expect(page.getByTestId('admin.nodes.create.indeterminate')).toBeVisible();
    await expect(page.getByTestId('admin.nodes.create')).toBeDisabled();
    await expect(page.getByTestId('admin.nodes.create.indeterminate.fingerprint')).toContainText('node42');
    expect(createCalls).toBe(1);

    await page.getByTestId('admin.nodes.create.verify').click();
    await expect(page.getByTestId('admin.nodes.create')).toBeDisabled();
    await expect(page.getByTestId('admin.nodes.create.found')).toBeVisible();
    await expect(page.getByTestId('admin.nodes.create')).toBeDisabled();
    expect(reconcileCalls).toBe(2);
    expect(createCalls).toBe(1);
    await captureProof(page, testInfo, 'admin-node-create-indeterminate-found');

    await page.getByTestId('admin.nodes.create.open_found').click();
    await expect(page).toHaveURL(/\/admin\/nodes\/42$/);
  });

  test('keeps create blocked after repeated negative reconciliation scans', async ({ page }) => {
    let createCalls = 0;
    let reconcileCalls = 0;
    await prepare(page, {
      'OPTIONS nodes': () => ({ input: { parameters: { name: { required: true }, location: { required: true } } } }),
      'GET locations': () => ({
        locations: [{ id: 3, label: 'Prague DC1', environment: { id: 8, label: 'Production' } }],
      }),
      'GET nodes': (ctx) => {
        if (ctx.searchParams.get('node[state]') === 'all') {
          reconcileCalls += 1;
          return { nodes: [{ id: 10, name: 'other-node', ip_addr: '192.0.2.10', active: true }] };
        }
        return { nodes: [{ id: 5, name: 'visible-node', ip_addr: '192.0.2.5', active: true }] };
      },
      'POST nodes': () => {
        createCalls += 1;
        return {
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ status: false, message: 'response lost', response: null }),
        };
      },
    });

    await page.goto('/admin/nodes');
    await page.getByTestId('admin.nodes.create').click();
    await page.getByTestId('admin.node.editor.name').fill('node42');
    await page.getByTestId('admin.node.editor.location').selectOption('3');
    await page.getByTestId('admin.node.editor.ip').fill('192.0.2.42');
    await page.getByTestId('admin.node.editor.max_vps').fill('0');
    await page.getByTestId('admin.node.editor.continue').click();
    await page.getByTestId('admin.node.editor.submit').click();

    await expect(page.getByTestId('admin.nodes.create')).toBeDisabled();
    await page.getByTestId('admin.nodes.create.verify').click();
    await expect(page.getByTestId('admin.nodes.create.unresolved')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('admin.nodes.create')).toBeDisabled();
    expect(reconcileCalls).toBe(4);
    expect(createCalls).toBe(1);
  });

  test('fails closed when the capability probe is denied', async ({ page }) => {
    await prepare(page, {
      'OPTIONS nodes': () => ({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ status: false, message: 'forbidden', response: null }),
      }),
    });
    await page.goto('/admin/nodes');
    await expect(page.getByTestId('admin.nodes.create')).toBeDisabled();
  });

  test('does not expose write controls to support users', async ({ page }) => {
    let optionCalls = 0;
    await prepare(
      page,
      {
        'OPTIONS nodes': () => {
          optionCalls += 1;
          return {};
        },
      },
      21,
    );
    await page.goto('/admin/nodes');
    await expect(page.getByTestId('admin.nodes.create')).toHaveCount(0);
    expect(optionCalls).toBe(0);
  });
});
