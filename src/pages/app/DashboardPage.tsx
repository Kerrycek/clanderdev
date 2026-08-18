import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { useAppMode } from "../../app/appMode";
import { useAuth } from "../../app/auth";
import { getRuntimeConfig } from "../../app/config";
import { useI18n } from "../../app/i18n";
import { useObjectScope } from "../../app/objectScope";
import { PageContainer } from "../../components/layout/PageContainer";
import { PageHeader } from "../../components/layout/PageHeader";
import { Alert } from "../../components/ui/Alert";
import { fetchClusterFullStats } from "../../lib/api/cluster";
import { fetchDatasets } from "../../lib/api/datasets";
import { fetchDnsZones } from "../../lib/api/dns";
import { fetchNews, fetchOutages, fetchPublicNodeStatus, type Outage } from "../../lib/api/public";
import { fetchSecurityAdvisoriesWithCves } from "../../lib/api/securityAdvisories";
import { fetchVpsList } from "../../lib/api/vps";
import { categorizeOutage, sortOutagesNewestFirst } from "../../lib/outage";
import { useTierBIntervalMs, useTierSlowIntervalMs } from "../../lib/refreshTiers";

import { countDashboardRows } from "./DashboardCounts";
import { DashboardOperationalSummary } from "./DashboardPageStatus";
import { DashboardPreferencesCard } from "./DashboardPreferencesCard";
import { DashboardSummaryCards } from "./DashboardSummaryCards";
import { DashboardWidgetGrid } from "./DashboardWidgets";
import { summarizeNodes } from "./DashboardOperationalCards";
import { useDashboardSettingsState } from "./useDashboardSettings";

function thirtyDaysAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString();
}

function legacyWebuiUrl(baseUrl: string | undefined, query: string): string | undefined {
  if (!baseUrl) return undefined;
  return `${baseUrl}/?${query}`;
}

export function DashboardPage() {
  const auth = useAuth();
  const { basePath, mode } = useAppMode();
  const scope = useObjectScope();
  const { t } = useI18n();
  const cfg = useMemo(() => getRuntimeConfig(), []);
  const recentSince = useMemo(() => thirtyDaysAgoIso(), []);
  const tierBRefetchMs = useTierBIntervalMs();
  const tierSlowRefetchMs = useTierSlowIntervalMs();
  const { dashboardSettings, setDashboardSettings } = useDashboardSettingsState();

  const mineUserId = scope.mineUserId;
  const isAdminScope = scope.scope === "all";

  const clusterStatsQ = useQuery({
    queryKey: ["dashboard", "cluster_full_stats"],
    queryFn: async () => (await fetchClusterFullStats()).data,
    enabled: isAdminScope,
    refetchInterval: tierSlowRefetchMs,
  });

  const vpsQ = useQuery({
    queryKey: ["dashboard", "vps_count", { user: mineUserId ?? null }],
    queryFn: async () => {
      const totalCount = await countDashboardRows(({ limit, fromId }) => fetchVpsList({ limit, fromId, user: mineUserId }));
      return { totalCount };
    },
    enabled: !isAdminScope,
  });

  const datasetsQ = useQuery({
    queryKey: ["dashboard", "datasets_count", { user: mineUserId ?? null, scope: scope.scope }],
    queryFn: async () => {
      const totalCount = await countDashboardRows(
        ({ limit, fromId }) => fetchDatasets({ limit, fromId, user: mineUserId }),
        { allowFallbackPagination: !isAdminScope },
      );
      return { totalCount };
    },
  });

  const dnsZonesQ = useQuery({
    queryKey: ["dashboard", "dns_zones_count", { user: mineUserId ?? null, scope: scope.scope }],
    queryFn: async () => {
      const totalCount = await countDashboardRows(
        ({ limit, fromId }) => fetchDnsZones({ limit, fromId, user: mineUserId }),
        { allowFallbackPagination: !isAdminScope },
      );
      return { totalCount };
    },
  });

  const nodesQ = useQuery({
    queryKey: ["dashboard", "nodes", "public_status"],
    queryFn: async () => (await fetchPublicNodeStatus()).data,
    refetchInterval: tierBRefetchMs,
  });

  const outagesQ = useQuery({
    queryKey: ["dashboard", "outages", "recent", { limit: 25 }],
    queryFn: async () => (await fetchOutages({ limit: 25 })).data,
    refetchInterval: tierSlowRefetchMs,
  });

  const newsQ = useQuery({
    queryKey: ["dashboard", "news_logs", "latest", { limit: 5 }],
    queryFn: async () => (await fetchNews({ limit: 5 })).data,
    refetchInterval: tierSlowRefetchMs,
  });

  const securityQ = useQuery({
    queryKey: ["dashboard", "security_advisories", "recent", recentSince],
    queryFn: async () =>
      (
        await fetchSecurityAdvisoriesWithCves({
          limit: 5,
          state: "published",
          recentSince,
          order: "newest",
          includes: "created_by,published_by",
        })
      ).data,
    refetchInterval: tierSlowRefetchMs,
  });

  const outagesByCategory = useMemo(() => {
    const list = (outagesQ.data ?? []).slice().sort(sortOutagesNewestFirst);
    const now = new Date();
    const current: Outage[] = [];
    const planned: Outage[] = [];
    const resolved: Outage[] = [];
    const unknown: Outage[] = [];

    for (const o of list) {
      switch (categorizeOutage(o, now)) {
        case "current":
          current.push(o);
          break;
        case "planned":
          planned.push(o);
          break;
        case "resolved":
          resolved.push(o);
          break;
        default:
          unknown.push(o);
      }
    }

    return { current, planned, resolved, unknown };
  }, [outagesQ.data]);

  const highlightedOutages = useMemo(
    () => [...outagesByCategory.current, ...outagesByCategory.planned].slice(0, 3),
    [outagesByCategory],
  );

  const unknownLocationLabel = t("dashboard.section.cluster.location_unknown");
  const nodeData = useMemo(() => summarizeNodes(nodesQ.data ?? [], unknownLocationLabel), [nodesQ.data, unknownLocationLabel]);
  const nodeIssueCount = nodeData.summary.down + nodeData.summary.maintenance + nodeData.summary.unknown;

  const signedInMeta = auth.user
    ? t("dashboard.signed_in_as", { login: auth.user.login, role: auth.role })
    : t("dashboard.signed_in");

  const outagesListPath = mode === "admin" ? `${basePath}/outages` : "/outages";
  const outageDetailPath = (id: number) => (mode === "admin" ? `${basePath}/outages/${id}` : `/outages/${id}`);
  const newsPath = mode === "admin" ? `${basePath}/content/news` : "/news";
  const legacySecurityBase = cfg.webuiUrl;
  const legacySecurityListUrl = legacyWebuiUrl(legacySecurityBase, "page=security_advisory&action=list");

  const statusAlert = DashboardOperationalSummary({
    t,
    outagesLoading: outagesQ.isLoading,
    outagesError: outagesQ.isError,
    nodesLoading: nodesQ.isLoading,
    nodesError: nodesQ.isError,
    currentOutageCount: outagesByCategory.current.length,
    nodeDownCount: nodeData.summary.down,
    nodeMaintenanceCount: nodeData.summary.maintenance,
  });

  return (
    <PageContainer variant="wide" testId="app.dashboard.page">
      <div className="space-y-4">
        <PageHeader testId="app.dashboard.header" title={t("nav.dashboard")} description={t("dashboard.description")} meta={signedInMeta} />

        <Alert title={statusAlert.title} variant={statusAlert.variant} className="p-2.5" testId="app.dashboard.status-alert">
          <span>{statusAlert.body}</span>
          {outagesByCategory.current.length > 0 ? (
            <span className="ml-2">
              <Link to={outagesListPath} className="underline">
                {t("dashboard.alert.outage.link")}
              </Link>
            </span>
          ) : null}
        </Alert>

        <DashboardPreferencesCard />

        <DashboardSummaryCards
          basePath={basePath}
          density={dashboardSettings.density}
          vps={{
            isLoading: isAdminScope ? clusterStatsQ.isLoading : vpsQ.isLoading,
            isError: isAdminScope ? clusterStatsQ.isError : vpsQ.isError,
            totalCount: isAdminScope ? clusterStatsQ.data?.vps_count : vpsQ.data?.totalCount,
          }}
          datasets={{
            isLoading: datasetsQ.isLoading,
            isError: datasetsQ.isError,
            totalCount: datasetsQ.data?.totalCount,
          }}
          dns={{
            isLoading: dnsZonesQ.isLoading,
            isError: dnsZonesQ.isError,
            totalCount: dnsZonesQ.data?.totalCount,
          }}
        />

        <DashboardWidgetGrid
          dashboardSettings={dashboardSettings}
          setDashboardSettings={setDashboardSettings}
          density={dashboardSettings.density}
          outages={{
            isLoading: outagesQ.isLoading,
            isError: outagesQ.isError,
            dataCount: outagesByCategory.current.length + outagesByCategory.planned.length,
            currentCount: outagesByCategory.current.length,
            plannedCount: outagesByCategory.planned.length,
            resolvedCount: outagesByCategory.resolved.length,
            highlighted: highlightedOutages,
            listPath: outagesListPath,
            detailPath: outageDetailPath,
          }}
          news={{
            isLoading: newsQ.isLoading,
            isError: newsQ.isError,
            items: newsQ.data ?? [],
            path: newsPath,
          }}
          security={{
            isLoading: securityQ.isLoading,
            isError: securityQ.isError,
            advisories: securityQ.data ?? [],
            legacyListUrl: legacySecurityListUrl,
            legacyBaseUrl: legacySecurityBase,
          }}
          cluster={{
            isLoading: nodesQ.isLoading,
            isError: nodesQ.isError,
            nodeData,
            nodeIssueCount,
          }}
        />
      </div>
    </PageContainer>
  );
}
