import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, failEnvelope, installHaveApiMock, jsonFulfill } from '../../fixtures';

/**
 * Public status landing smoke.
 *
 * This spec is part of the PR smoke suite.
 * Keep it fast and deterministic.
 */
test('@pr-smoke @pr-smoke-mobile @smoke @smoke-mobile public overview shows key status surfaces', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, {
    apiUrl: '/api',
    apiVersion: '7.0',
    sessionToken: 'TEST',
  });

  await installHaveApiMock(page, {
    user: { id: 1, login: 'test', level: 1 },
    handlers: {
      'GET cluster/public_stats': () => ({
        public_stats: { user_count: 123, vps_count: 456, ipv4_left: 200 },
      }),
      'GET nodes/public_status': () => ({
        nodes: [
          {
            name: 'node-prg',
            status: true,
            location: { label: 'Praha' },
            last_report: '2025-01-01T00:00:00Z',
            vps_count: 100,
            vps_free: 10,
            cpu_idle: 50,
          },
          {
            name: 'node-brq',
            status: true,
            location: { label: 'Brno' },
            last_report: '2025-01-01T00:00:00Z',
            vps_count: 120,
            vps_free: 5,
            cpu_idle: 60,
          },
        ],
      }),
      'GET outages': () => ({ outages: [] }),
      'GET news_logs': () => ({ news_logs: [] }),
      'GET help_boxes': () => ({ help_boxes: [] }),
      'GET users/current': () => jsonFulfill(failEnvelope('Unauthorized'), 401),
    },
  });

  await page.goto('/');

  // Page shell
  await expect(page.getByTestId('public.overview.page')).toBeVisible();
  await expect(page.getByTestId('public.summary-grid')).toBeVisible();

  // Primary stats
  await expect(page.getByTestId('public.stats.members')).toBeVisible();
  await expect(page.getByTestId('public.stats.nodes')).toBeVisible();
  await expect(page.getByTestId('public.stats.vps')).toBeVisible();

  // Supporting sections. Empty outages are intentionally hidden.
  await expect(page.locator('[data-testid="public.outages.card"]')).toHaveCount(0);
  await expect(page.getByTestId('public.nodes.section')).toBeVisible();

  const nodesSection = page.getByTestId('public.nodes.section');
  const visibleLocationPanels = nodesSection.locator(
    '[data-cluster-location][data-cluster-location-layout="panel"]:visible',
  );
  const prahaPanel = nodesSection.locator(
    '[data-cluster-location="Praha"][data-cluster-location-layout="panel"]:visible',
  );
  const brnoPanel = nodesSection.locator(
    '[data-cluster-location="Brno"][data-cluster-location-layout="panel"]:visible',
  );

  await expect(visibleLocationPanels).toHaveCount(2);
  await expect(prahaPanel).toBeVisible();
  await expect(brnoPanel).toBeVisible();
  await expect(prahaPanel).toContainText('node-prg');
  await expect(prahaPanel).not.toContainText('node-brq');
  await expect(brnoPanel).toContainText('node-brq');
  await expect(brnoPanel).not.toContainText('node-prg');

  const clusterProofScreenshot = process.env['E2E_CLUSTER_PUBLIC_PROOF_SCREENSHOT']?.trim();
  if (clusterProofScreenshot) {
    await page.screenshot({ path: clusterProofScreenshot, fullPage: true });
  }

  // Not shown when IPv4 is healthy.
  await expect(page.locator('[data-testid="public.ipv4.alert"]')).toHaveCount(0);
});

test('public overview shows IPv4 critical alert when low', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, {
    apiUrl: '/api',
    apiVersion: '7.0',
    sessionToken: 'TEST',
    webuiNext: { publicStatus: { ipv4Warn: 64, ipv4Critical: 16 } },
  });

  await installHaveApiMock(page, {
    user: { id: 1, login: 'test', level: 1 },
    handlers: {
      'GET cluster/public_stats': () => ({
        public_stats: { user_count: 1, vps_count: 1, ipv4_left: 10 },
      }),
      'GET nodes/public_status': () => ({ nodes: [] }),
      'GET outages': () => ({ outages: [] }),
      'GET news_logs': () => ({ news_logs: [] }),
      'GET help_boxes': () => ({ help_boxes: [] }),
      'GET users/current': () => jsonFulfill(failEnvelope('Unauthorized'), 401),
    },
  });

  await page.goto('/');

  await expect(page.getByTestId('public.overview.page')).toBeVisible();
  await expect(page.getByTestId('public.ipv4.alert')).toBeVisible();
  await expect(page.getByTestId('public.ipv4.alert')).toContainText('10');
});
