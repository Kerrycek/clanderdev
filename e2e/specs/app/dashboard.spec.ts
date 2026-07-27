import { expect, test } from "@playwright/test";

import { bootstrapVpsAdminWindow, installHaveApiMock } from "../../fixtures";

test.describe("Dashboard", () => {
  test("@pr-smoke @pr-smoke-mobile @smoke @smoke-mobile shows operational overview, KPI cards and navigation actions", async ({
    page,
  }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: "TEST" });
    const vpsRequests: string[] = [];

    await installHaveApiMock(page, {
      user: { id: 1, login: "test", level: 1 },
      handlers: {
        "GET vpses": (ctx) => {
          vpsRequests.push(ctx.url.search);
          const vpses = [
            {
              id: 101,
              hostname: "a",
              is_running: true,
              object_state: "active",
            },
            {
              id: 102,
              hostname: "b",
              is_running: false,
              object_state: "active",
            },
            {
              id: 103,
              hostname: "c",
              is_running: false,
              object_state: "active",
            },
          ];
          return { vpses, _meta: { total_count: vpses.length } };
        },
        "GET datasets": () => ({
          datasets: [{ id: 1 }],
          _meta: { total_count: 7 },
        }),
        "GET dns_zones": () => ({
          dns_zones: [{ id: 1 }],
          _meta: { total_count: 2 },
        }),
        "GET transaction_chains": () => ({
          transaction_chains: [
            {
              id: 201,
              label: "Deploy dataset",
              state: "queued",
              size: 3,
              progress: 1,
              created_at: new Date().toISOString(),
            },
          ],
          _meta: { total_count: 1 },
        }),
        "GET nodes/public_status": () => ({
          nodes: [
            {
              id: 1,
              name: "node-a.prg",
              fqdn: "node-a.prg.example.test",
              status: true,
              location: { label: "Praha" },
              last_report: new Date().toISOString(),
              vps_count: 100,
              vps_free: 10,
              cpu_idle: 50,
              kernel: "6.1.0",
              cgroup_version: "v2",
              pool_state: "ONLINE",
              pool_status: true,
            },
            {
              id: 2,
              name: "node-b.prg",
              fqdn: "node-b.prg.example.test",
              status: false,
              location: { label: "Brno" },
              last_report: new Date(Date.now() - 60_000).toISOString(),
              vps_count: 20,
              vps_free: 5,
              cpu_idle: 80,
              kernel: "6.1.0",
              cgroup_version: "v2",
              pool_state: "ONLINE",
              pool_status: true,
              maintenance_lock: "lock",
              maintenance_lock_reason: "Hardware upgrade",
            },
          ],
        }),
        "GET outages": () => ({
          outages: [
            {
              id: 55,
              state: "announced",
              type: "maintenance",
              impact: "network",
              begins_at: new Date(Date.now() - 60_000).toISOString(),
              en_summary: "Network maintenance in DC1",
              cs_summary: "Údržba sítě v DC1",
            },
          ],
        }),
        "GET news_logs": () => ({
          news_logs: [
            {
              id: 9,
              message: "Maintenance window moved",
              published_at: new Date().toISOString(),
            },
          ],
        }),
        "GET security_advisories": () => ({
          security_advisories: [
            {
              id: 77,
              name: "OpenSSL advisory",
              state: "published",
              published_at: new Date().toISOString(),
              affected: true,
              affected_node_count: 2,
              affected_user_count: 1,
              affected_vps_count: 3,
              en_summary: "Patch OpenSSL on affected hosts",
              cs_summary: "Aktualizujte OpenSSL na dotčených hostech",
              security_advisory_cves: [{ id: 7701, cve_id: "CVE-2026-0001" }],
            },
          ],
          _meta: { total_count: 1 },
        }),
      },
    });

    await page.goto("/app");

    await expect(page.getByTestId("app.dashboard.page")).toBeVisible();
    await expect(page.getByTestId("app.dashboard.header")).toBeVisible();
    await expect(page.getByTestId("app.dashboard.summary-grid")).toBeVisible();

    await expect(page.getByTestId("app.dashboard.kpi.vps")).toContainText("3");
    expect(vpsRequests).toHaveLength(1);
    expect(new URLSearchParams(vpsRequests[0]).get("vps[limit]")).toBe("200");
    await expect(page.getByTestId("app.dashboard.kpi.datasets")).toContainText(
      "7",
    );
    await expect(page.getByTestId("app.dashboard.kpi.dns")).toContainText("2");
    await expect(page.getByTestId("app.dashboard.kpi.members")).toHaveCount(0);
    await expect(page.getByTestId("app.dashboard.kpi.cluster-vps")).toHaveCount(
      0,
    );

    await expect(page.getByTestId("app.dashboard.kpi.vps.open")).toBeVisible();
    await expect(page.getByTestId("app.dashboard.kpi.tasks")).toHaveCount(0);
    await expect(page.getByTestId("app.dashboard.operations.card")).toHaveCount(
      0,
    );

    await expect(page.getByTestId("app.dashboard.outages.card")).toContainText(
      "Network maintenance in DC1",
    );
    await expect(page.getByTestId("app.dashboard.security.card")).toContainText(
      "OpenSSL advisory",
    );
    await expect(page.getByTestId("app.dashboard.security.card")).toContainText(
      "CVE-2026-0001",
    );
    await expect(page.getByTestId("app.dashboard.news.card")).toContainText(
      "Maintenance window moved",
    );
    const clusterCard = page.getByTestId("app.dashboard.cluster.card");
    const visibleLocationPanels = clusterCard.locator(
      '[data-cluster-location][data-cluster-location-layout="panel"]:visible',
    );
    const prahaPanel = clusterCard.locator(
      '[data-cluster-location="Praha"][data-cluster-location-layout="panel"]:visible',
    );
    const brnoPanel = clusterCard.locator(
      '[data-cluster-location="Brno"][data-cluster-location-layout="panel"]:visible',
    );

    await expect(visibleLocationPanels).toHaveCount(2);
    await expect(prahaPanel).toBeVisible();
    await expect(brnoPanel).toBeVisible();
    await expect(prahaPanel).toContainText("node-a.prg");
    await expect(prahaPanel).not.toContainText("node-b.prg");
    await expect(brnoPanel).toContainText("node-b.prg");
    await expect(brnoPanel).not.toContainText("node-a.prg");
    await expect(page.getByTestId("app.dashboard.cluster.card")).toContainText(
      "1 online",
    );
    await expect(page.getByTestId("app.dashboard.cluster.card")).toContainText(
      "1 maintenance",
    );
    await expect(prahaPanel).toContainText(
      "node-a.prg",
    );
    await expect(brnoPanel).toContainText(
      "node-b.prg",
    );
    await expect(clusterCard).not.toContainText(
      "free",
    );
    await expect(prahaPanel).toContainText(
      "ONLINE",
    );
    await expect(prahaPanel).toContainText(
      "50.0%",
    );

    const clusterProofScreenshot = process.env["E2E_CLUSTER_DASHBOARD_PROOF_SCREENSHOT"]?.trim();
    if (clusterProofScreenshot) {
      await page.screenshot({ path: clusterProofScreenshot, fullPage: true });
    }

    await expect(page.getByTestId("app.dashboard.preferences.card")).toContainText(
      "Compact",
    );
    await page.getByTestId("app.dashboard.preferences.toggle").click();
    await page
      .getByTestId("app.dashboard.preferences.density")
      .selectOption("comfortable");
    await expect(page.getByTestId("app.dashboard.preferences.card")).toContainText(
      "Comfortable",
    );

    await expect(
      page.getByTestId("app.dashboard.preferences.widget.security.visible").locator("input"),
    ).toBeDisabled();

    await page.getByTestId("app.dashboard.widget.cluster.collapse").click();
    await expect(page.getByTestId("app.dashboard.cluster.card")).toContainText(
      "2 nodes total",
    );
    await expect(page.getByTestId("app.dashboard.cluster.groups")).toHaveCount(0);

    await page.getByTestId("app.dashboard.widget.news.collapse").click();
    await expect(page.getByTestId("app.dashboard.news.card")).toContainText(
      "1 published news items",
    );

    await page.getByTestId("app.dashboard.preferences.widget.news.visible").click();
    await expect(page.getByTestId("app.dashboard.news.card")).toHaveCount(0);
    await expect(page.getByTestId("app.dashboard.security.card")).toBeVisible();
    await expect(page.getByTestId("app.dashboard.cluster.card")).toBeVisible();
  });
});
