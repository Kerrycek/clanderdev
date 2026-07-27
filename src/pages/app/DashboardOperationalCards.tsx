import { Link } from "react-router-dom";
import { type AppMode, useAppMode } from "../../app/appMode";
import type { DashboardDensity } from "../../app/dashboardSettingsModel";
import { useI18n } from "../../app/i18n";
import { ClusterLocationPanel } from "../../components/cluster/ClusterLocationPanel";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { LinkButton } from "../../components/ui/LinkButton";
import { NewsMessage } from "../../components/ui/NewsMessage";
import { Spinner } from "../../components/ui/Spinner";
import { StatusDot } from "../../components/ui/StatusDot";
import { Table } from "../../components/ui/Table";
import type { NewsLog, Outage, PublicNodeStatus } from "../../lib/api/public";
import { advisoryCveLabels, type SecurityAdvisory } from "../../lib/api/securityAdvisories";
import { outageBadges } from "../../lib/outageBadges";
import { compareClusterLocationLabels } from "../../lib/clusterLocations";
import { type BadgeVariant } from "../../lib/taskStatus";
import { formatDateTime } from "../../lib/time";
import { pickLocalizedFieldFrom, pickTranslation } from "../../lib/translations";
import { dotVariantFromBadgeVariant } from "../../lib/variantMap";
import { securityAdvisoryStateLabel } from "../../lib/apiValues";
import { isMaintenanceLocked } from "../../lib/nodeMaintenance";
type NodeHealth = "up" | "maintenance" | "down" | "unknown";
interface NodeLocationGroup { ok: number; maintenance: number; down: number; unknown: number; total: number; vps: number; nodes: PublicNodeStatus[]; }
export function DashboardOutageSummary(props: { outage: Outage; to: string }) {
  const i18n = useI18n();
  const summary = pickTranslation(props.outage, "summary", i18n.preferredLanguageCodes);
  const badges = outageBadges(props.outage, i18n.t);
  const dotVariant = dotVariantFromBadgeVariant(badges.primaryVariant);
  return (
    <div className="bg-surface-2 px-3 py-2.5" data-testid="app.dashboard.outage.item">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusDot variant={dotVariant} ariaLabel={badges.lifecycle.label} />
        <Link to={props.to} className="font-medium hover:underline">
          {summary ?? i18n.t("public.outage.fallback_title", { id: props.outage.id })}
        </Link>
        <Badge variant={badges.lifecycle.variant}>{badges.lifecycle.label}</Badge>
        {badges.impact ? <Badge variant={badges.impact.variant}>{badges.impact.label}</Badge> : null}
      </div>
      <div className="mt-0.5 text-xs text-muted">
        {i18n.t("public.outage.field.begins")}: {formatDateTime(props.outage.begins_at)}
        {props.outage.finished_at
          ? ` · ${i18n.t("public.outage.field.finished")}: ${formatDateTime(props.outage.finished_at)}`
          : null}
      </div>
    </div>
  );
}
export function DashboardNewsItem(props: { news: NewsLog }) {
  const i18n = useI18n();
  const html = pickLocalizedFieldFrom(props.news as any, ["message", "body", "text"], i18n.preferredLanguageCodes) ?? props.news.message;
  return (
    <div
      className="grid gap-1 bg-surface-2 px-3 py-2.5 text-sm sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-3"
      data-testid="app.dashboard.news.item"
    >
      <div className="text-xs text-muted sm:pt-0.5">{formatDateTime(props.news.published_at ?? props.news.created_at)}</div>
      <NewsMessage html={html} />
    </div>
  );
}
function formatNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat().format(value);
}
function legacyWebuiUrl(baseUrl: string | undefined, query: string): string | undefined {
  if (!baseUrl) return undefined;
  return `${baseUrl}/?${query}`;
}
function isNodeInMaintenance(n: PublicNodeStatus): boolean {
  return isMaintenanceLocked(n.maintenance_lock);
}
function nodeHealth(n: PublicNodeStatus): NodeHealth {
  if (isNodeInMaintenance(n)) return "maintenance";
  if (n.status === true) return "up";
  if (n.status === false) return "down";
  return "unknown";
}
function nodeHealthPriority(n: PublicNodeStatus): number {
  const h = nodeHealth(n);
  if (h === "down") return 0;
  if (h === "maintenance") return 1;
  if (h === "unknown") return 2;
  return 3;
}
function nodeLocationLabel(n: PublicNodeStatus, fallback: string): string {
  const loc = n.location;
  if (loc && (loc.label || loc.id)) return String(loc.label ?? loc.id);
  return fallback;
}
function sortNodes(a: PublicNodeStatus, b: PublicNodeStatus, unknownLocationLabel: string): number {
  const locA = nodeLocationLabel(a, unknownLocationLabel);
  const locB = nodeLocationLabel(b, unknownLocationLabel);
  const byLoc = locA.localeCompare(locB);
  if (byLoc !== 0) return byLoc;
  const byPriority = nodeHealthPriority(a) - nodeHealthPriority(b);
  if (byPriority !== 0) return byPriority;
  return String(a.name ?? "").localeCompare(String(b.name ?? ""));
}
function nodeHealthBadge(
  n: PublicNodeStatus,
  t: (key: string, vars?: Record<string, unknown>) => string,
): { variant: BadgeVariant; label: string } {
  const h = nodeHealth(n);
  if (h === "up") return { variant: "ok", label: t("dashboard.section.cluster.status.up") };
  if (h === "maintenance") {
    return { variant: "warn", label: t("dashboard.section.cluster.status.maintenance") };
  }
  if (h === "down") return { variant: "danger", label: t("dashboard.section.cluster.status.down") };
  return { variant: "neutral", label: t("dashboard.section.cluster.status.unknown") };
}
function nodeRowVariant(n: PublicNodeStatus): "danger" | "warn" | undefined {
  const h = nodeHealth(n);
  if (h === "down") return "danger";
  if (h === "maintenance") return "warn";
  return undefined;
}
function nodeStorageLabel(
  n: PublicNodeStatus,
  t: (key: string, vars?: Record<string, unknown>) => string,
): string {
  const scan = typeof n["pool_scan"] === "string" ? String(n["pool_scan"]) : "";
  const pct = typeof n["pool_scan_percent"] === "number" ? Number(n["pool_scan_percent"]) : null;
  const pctLabel = pct === null || !Number.isFinite(pct) ? "—" : pct.toFixed(1);
  if (scan === "scrub") return t("dashboard.section.cluster.storage.scrub", { percent: pctLabel });
  if (scan === "resilver") return t("dashboard.section.cluster.storage.resilver", { percent: pctLabel });
  const state = typeof n["pool_state"] === "string" ? String(n["pool_state"]).trim() : "";
  return state || "—";
}
function nodeStorageVariant(n: PublicNodeStatus): BadgeVariant {
  const scan = typeof n["pool_scan"] === "string" ? String(n["pool_scan"]) : "";
  if (scan === "scrub" || scan === "resilver") return "warn";
  if (n["pool_status"] === false) return "danger";
  const state = typeof n["pool_state"] === "string" ? String(n["pool_state"]).trim().toUpperCase() : "";
  if (state && state !== "ONLINE") return "warn";
  return "neutral";
}
function cpuUsedLabel(n: PublicNodeStatus): string {
  if (typeof n.cpu_idle !== "number" || !Number.isFinite(n.cpu_idle)) return "—";
  const used = Math.max(0, Math.min(100, 100 - n.cpu_idle));
  return `${used.toFixed(1)}%`;
}
function cgroupVersionLabel(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "—";
  if (normalized === "1" || normalized === "v1" || normalized === "cgroup_v1") return "v1";
  if (normalized === "2" || normalized === "v2" || normalized === "cgroup_v2") return "v2";
  return String(value);
}

function ClusterNodeMobileCard(props: {
  basePath: string;
  location: string;
  mode: AppMode;
  node: PublicNodeStatus;
  t: (key: string, vars?: Record<string, unknown>) => string;
}) {
  const health = nodeHealthBadge(props.node, props.t);
  const maintenanceReason =
    typeof props.node.maintenance_lock_reason === "string"
      ? props.node.maintenance_lock_reason
      : undefined;
  const nodeId = typeof props.node["id"] === "number" ? Number(props.node["id"]) : null;
  const nodeName = props.node.name || props.node.fqdn || "—";

  return (
    <div
      className="rounded-md border border-border bg-surface-2 p-3"
      data-row-variant={nodeRowVariant(props.node)}
      data-testid={`app.dashboard.cluster.mobile-node.${props.location}.${nodeId ?? nodeName}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 truncate font-medium">
          {props.mode === "admin" && nodeId ? (
            <Link to={`${props.basePath}/nodes/${nodeId}`} className="hover:underline">
              {nodeName}
            </Link>
          ) : (
            nodeName
          )}
        </div>
        <Badge variant={health.variant} title={maintenanceReason} className="shrink-0">
          {health.label}
        </Badge>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs">
        <span className="text-muted">{props.t("dashboard.section.cluster.table.storage")}</span>
        <Badge variant={nodeStorageVariant(props.node)}>{nodeStorageLabel(props.node, props.t)}</Badge>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-muted">{props.t("dashboard.section.cluster.table.vps")}</dt>
          <dd className="mt-0.5 font-medium">
            {typeof props.node.vps_count === "number" ? formatNumber(props.node.vps_count) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">{props.t("dashboard.section.cluster.table.cpu")}</dt>
          <dd className="mt-0.5 font-medium">{cpuUsedLabel(props.node)}</dd>
        </div>
        <div>
          <dt className="text-muted">{props.t("dashboard.section.cluster.table.kernel")}</dt>
          <dd className="mt-0.5 truncate font-medium">
            {props.node.kernel ? String(props.node.kernel) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">{props.t("dashboard.section.cluster.table.cgroups")}</dt>
          <dd className="mt-0.5 font-medium">{cgroupVersionLabel(props.node["cgroup_version"])}</dd>
        </div>
      </dl>
    </div>
  );
}

export function summarizeNodes(nodes: PublicNodeStatus[], unknownLocationLabel: string) {
  const groups = new Map<string, NodeLocationGroup>();
  let ok = 0;
  let maintenance = 0;
  let down = 0;
  let unknown = 0;
  let total = 0;
  let vps = 0;
  for (const n of nodes) {
    const loc = nodeLocationLabel(n, unknownLocationLabel);
    const group = groups.get(loc) ?? {
      ok: 0,
      maintenance: 0,
      down: 0,
      unknown: 0,
      total: 0,
      vps: 0,
      nodes: [],
    };
    const h = nodeHealth(n);
    group.total += 1;
    group.nodes.push(n);
    total += 1;
    const nodeVps = typeof n.vps_count === "number" && Number.isFinite(n.vps_count) ? n.vps_count : 0;
    group.vps += nodeVps;
    vps += nodeVps;
    if (h === "up") {
      group.ok += 1;
      ok += 1;
    } else if (h === "maintenance") {
      group.maintenance += 1;
      maintenance += 1;
    } else if (h === "down") {
      group.down += 1;
      down += 1;
    } else {
      group.unknown += 1;
      unknown += 1;
    }
    groups.set(loc, group);
  }
  const byLocation = [...groups.entries()].sort((a, b) => compareClusterLocationLabels(a[0], b[0]));
  for (const [, group] of byLocation) {
    group.nodes.sort((a, b) => sortNodes(a, b, unknownLocationLabel));
  }
  return { byLocation, summary: { ok, maintenance, down, unknown, total, vps } };
}
function advisoryStateBadge(
  state: unknown,
  t: (key: string, vars?: Record<string, unknown>) => string,
): { variant: BadgeVariant; label: string } {
  const s = String(state ?? "").trim();
  if (s === "published") return { variant: "ok", label: securityAdvisoryStateLabel(t, s) };
  if (s === "retracted") return { variant: "warn", label: securityAdvisoryStateLabel(t, s) };
  if (s === "draft") return { variant: "neutral", label: securityAdvisoryStateLabel(t, s) };
  return { variant: "neutral", label: s ? securityAdvisoryStateLabel(t, s) : t("state.unknown") };
}
function SecurityAdvisoryItem(props: { advisory: SecurityAdvisory; legacyHref?: string }) {
  const i18n = useI18n();
  const advisory = props.advisory;
  const cves = advisoryCveLabels(advisory);
  const summary = pickTranslation(advisory, "summary", i18n.preferredLanguageCodes);
  const stateBadge = advisoryStateBadge(advisory.state, i18n.t);
  const title = advisory.name || i18n.t("dashboard.section.security.fallback_title", { id: advisory.id });
  const detailHref = props.legacyHref
    ? legacyWebuiUrl(props.legacyHref, `page=security_advisory&action=show&id=${advisory.id}`)
    : undefined;
  const affectedUserCount = typeof advisory.affected_user_count === "number" ? advisory.affected_user_count : null;
  const affectedVpsCount = typeof advisory.affected_vps_count === "number" ? advisory.affected_vps_count : null;
  const affectedNodeCount = typeof advisory.affected_node_count === "number" ? advisory.affected_node_count : null;
  return (
    <div className="space-y-1.5 bg-surface-2 px-3 py-2.5" data-testid="app.dashboard.security.item">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {detailHref ? (
          <a href={detailHref} target="_blank" rel="noreferrer" className="font-medium hover:underline">
            {title}
          </a>
        ) : (
          <span className="font-medium">{title}</span>
        )}
        <Badge variant={stateBadge.variant}>{stateBadge.label}</Badge>
        {advisory.affected === true ? (
          <Badge variant="danger">{i18n.t("dashboard.section.security.affects_me")}</Badge>
        ) : advisory.affected === false ? (
          <Badge variant="neutral">{i18n.t("dashboard.section.security.not_affected")}</Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span>
          {i18n.t("dashboard.section.security.published")}: {formatDateTime(advisory.published_at)}
        </span>
        {affectedNodeCount !== null ? (
          <span>· {i18n.t("dashboard.section.security.affected_nodes", { count: affectedNodeCount })}</span>
        ) : null}
        {affectedUserCount !== null || affectedVpsCount !== null ? (
          <span>
            · {i18n.t("dashboard.section.security.affected_users_vps", { users: affectedUserCount ?? "—", vps: affectedVpsCount ?? "—" })}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {cves.length > 0 ? (
          cves.slice(0, 6).map((cve) => (
            <Badge key={cve} variant="info">
              {cve}
            </Badge>
          ))
        ) : (
          <Badge variant="neutral">{i18n.t("dashboard.section.security.no_cves")}</Badge>
        )}
        {cves.length > 6 ? (
          <span className="text-xs text-muted">{i18n.t("common.more_n", { count: cves.length - 6 })}</span>
        ) : null}
      </div>
      {summary ? <div className="text-sm text-muted">{summary}</div> : null}
    </div>
  );
}
export function SecurityAdvisoriesCard(props: { isLoading: boolean; isError: boolean; advisories: SecurityAdvisory[]; legacyListUrl?: string; legacyBaseUrl?: string; collapsed?: boolean; density?: DashboardDensity; itemLimit?: number; onToggleCollapsed?: () => void; }) {
  const { t } = useI18n();
  const collapsed = props.collapsed === true;
  const compact = props.density === "compact";
  const itemLimit = props.itemLimit ?? 3;
  return (
    <Card testId="app.dashboard.security.card">
      <CardHeader
        className="items-center p-3"
        title={t("dashboard.section.security.title")}
        subtitle={t("dashboard.section.security.subtitle")}
        actions={
          <>
            {props.onToggleCollapsed ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={props.onToggleCollapsed}
                testId="app.dashboard.widget.security.collapse"
              >
                {collapsed ? t("dashboard.preferences.widget.expand") : t("dashboard.preferences.widget.collapse")}
              </Button>
            ) : null}
            {props.legacyListUrl ? (
              <Button as="a" href={props.legacyListUrl} target="_blank" rel="noreferrer" variant="secondary" size="sm">
                {t("dashboard.section.security.open_legacy")}
              </Button>
            ) : null}
          </>
        }
      />
      <CardBody className={compact ? "p-2.5" : "p-3"}>
        {props.isLoading ? (
          <Spinner label={t("dashboard.section.security.loading")} />
        ) : props.isError ? (
          <Alert title={t("dashboard.section.security.error")} variant="danger" />
        ) : props.advisories.length === 0 ? (
          <div className="text-sm text-muted">{t("dashboard.section.security.empty")}</div>
        ) : collapsed ? (
          <div className="text-sm text-muted">
            {t("dashboard.widget.security.collapsed_summary", { count: props.advisories.length })}
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {props.advisories.slice(0, itemLimit).map((advisory) => (
              <SecurityAdvisoryItem key={advisory.id} advisory={advisory} legacyHref={props.legacyBaseUrl} />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
export function ClusterHealthCard(props: { isLoading: boolean; isError: boolean; nodeData: ReturnType<typeof summarizeNodes>; nodeIssueCount: number; collapsed?: boolean; density?: DashboardDensity; onToggleCollapsed?: () => void; }) {
  const { t } = useI18n();
  const { basePath, mode } = useAppMode();
  const compact = props.density === "compact";
  const collapsed = props.collapsed === true;
  const nodeRows = props.nodeData.byLocation.flatMap(([, group]) => group.nodes);
  const visibleNodeLimit = compact ? 12 : Number.POSITIVE_INFINITY;
  let remainingNodeCount = visibleNodeLimit;
  const visibleLocationGroups = props.nodeData.byLocation.flatMap(([location, group]) => {
    const nodes = remainingNodeCount > 0 ? group.nodes.slice(0, remainingNodeCount) : [];
    remainingNodeCount -= nodes.length;
    return nodes.length > 0 ? [{ location, group, nodes }] : [];
  });
  const renderedNodeCount = visibleLocationGroups.reduce((count, group) => count + group.nodes.length, 0);
  const statusBadges = (
    <div className="flex flex-wrap gap-2 text-sm">
      <Badge variant="ok">{t("dashboard.section.cluster.status_summary.up", { count: props.nodeData.summary.ok })}</Badge>
      {props.nodeData.summary.maintenance > 0 ? (
        <Badge variant="warn">
          {t("dashboard.section.cluster.status_summary.maintenance", { count: props.nodeData.summary.maintenance })}
        </Badge>
      ) : null}
      {props.nodeData.summary.down > 0 ? (
        <Badge variant="danger">{t("dashboard.section.cluster.status_summary.down", { count: props.nodeData.summary.down })}</Badge>
      ) : null}
      {props.nodeData.summary.unknown > 0 ? (
        <Badge variant="neutral">{t("dashboard.section.cluster.status_summary.unknown", { count: props.nodeData.summary.unknown })}</Badge>
      ) : null}
    </div>
  );
  return (
    <Card testId="app.dashboard.cluster.card" className="xl:col-span-2">
      <CardHeader
        title={t("dashboard.section.cluster.title")}
        subtitle={t("dashboard.section.cluster.subtitle_compact", {
          total: props.nodeData.summary.total,
          issues: props.nodeIssueCount,
        })}
        actions={
          <>
            {props.onToggleCollapsed ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={props.onToggleCollapsed}
                testId="app.dashboard.widget.cluster.collapse"
              >
                {collapsed ? t("dashboard.preferences.widget.expand") : t("dashboard.preferences.widget.collapse")}
              </Button>
            ) : null}
            {mode === "admin" ? (
              <LinkButton to={`${basePath}/nodes`} variant="secondary" size="sm">
                {t("nav.nodes")}
              </LinkButton>
            ) : null}
          </>
        }
      />
      <CardBody className={compact ? "p-3" : undefined}>
        {props.isLoading ? (
          <Spinner label={t("dashboard.section.cluster.loading")} />
        ) : props.isError ? (
          <Alert title={t("dashboard.section.cluster.error")} variant="danger" />
        ) : props.nodeData.summary.total === 0 ? (
          <div className="text-sm text-muted">{t("dashboard.section.cluster.empty")}</div>
        ) : (
          <div className={compact ? "space-y-3" : "space-y-4"}>
            {statusBadges}
            {collapsed ? (
              <div className="text-sm text-muted">
                {t("dashboard.widget.cluster.collapsed_summary", {
                  total: props.nodeData.summary.total,
                  issues: props.nodeIssueCount,
                })}
              </div>
            ) : (
              <>
                <div className={compact ? "space-y-3" : "space-y-4"} data-testid="app.dashboard.cluster.groups">
                  {visibleLocationGroups.map(({ location, group, nodes }) => (
                    <ClusterLocationPanel
                      key={location}
                      location={location}
                      summary={t("dashboard.section.cluster.location_summary", {
                        up: group.ok,
                        maintenance: group.maintenance,
                        down: group.down,
                        total: group.total,
                      })}
                      compactSummary={t("dashboard.section.cluster.location_summary_compact", {
                        up: group.ok,
                        total: group.total,
                      })}
                      summaryVariant={
                        group.down > 0
                          ? "danger"
                          : group.maintenance > 0
                            ? "warn"
                            : group.unknown > 0
                              ? "neutral"
                              : "ok"
                      }
                      segments={[
                        { value: group.ok, variant: "ok", title: t("dashboard.section.cluster.status.up") },
                        { value: group.maintenance, variant: "warn", title: t("dashboard.section.cluster.status.maintenance") },
                        { value: group.down, variant: "danger", title: t("dashboard.section.cluster.status.down") },
                        { value: group.unknown, variant: "neutral", title: t("dashboard.section.cluster.status.unknown") },
                      ]}
                      barAriaLabel={t("dashboard.section.cluster.location_bar_aria", { location })}
                      testId={`app.dashboard.cluster.location.${location}`}
                    >
                      <div
                        className="space-y-2 p-3 md:hidden"
                        data-testid={`app.dashboard.cluster.mobile.${location}`}
                      >
                        {nodes.map((node) => (
                          <ClusterNodeMobileCard
                            key={`${location}:${String(node["id"] ?? node.name ?? node.fqdn ?? "node")}`}
                            basePath={basePath}
                            location={location}
                            mode={mode}
                            node={node}
                            t={t}
                          />
                        ))}
                      </div>
                      <div className="hidden overflow-auto md:block">
                        <Table
                          className="table-fixed"
                          minWidth="md"
                          testId={`app.dashboard.cluster.table.${location}`}
                          variant="list"
                        >
                          <colgroup>
                            <col style={{ width: "22%" }} />
                            <col style={{ width: "14%" }} />
                            <col style={{ width: "14%" }} />
                            <col style={{ width: "10%" }} />
                            <col style={{ width: "12%" }} />
                            <col style={{ width: "16%" }} />
                            <col style={{ width: "12%" }} />
                          </colgroup>
                          <thead className="bg-surface-2 text-left text-xs text-muted">
                            <tr>
                              <th className="px-3 py-2 font-medium">{t("dashboard.section.cluster.table.node")}</th>
                              <th className="px-3 py-2 text-center font-medium">{t("dashboard.section.cluster.table.status")}</th>
                              <th className="px-3 py-2 text-center font-medium">{t("dashboard.section.cluster.table.storage")}</th>
                              <th className="px-3 py-2 text-center font-medium">{t("dashboard.section.cluster.table.vps")}</th>
                              <th className="px-3 py-2 text-center font-medium">{t("dashboard.section.cluster.table.cpu")}</th>
                              <th className="px-3 py-2 text-center font-medium">{t("dashboard.section.cluster.table.kernel")}</th>
                              <th className="px-3 py-2 text-center font-medium">{t("dashboard.section.cluster.table.cgroups")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {nodes.map((node) => {
                              const health = nodeHealthBadge(node, t);
                              const rowVariant = nodeRowVariant(node);
                              const maintenanceReason =
                                typeof node.maintenance_lock_reason === "string"
                                  ? node.maintenance_lock_reason
                                  : undefined;
                              const nodeId = typeof node["id"] === "number" ? Number(node["id"]) : null;
                              const nodeName = node.name || node.fqdn || "—";
                              return (
                                <tr
                                  key={`${location}:${nodeId ?? nodeName}`}
                                  className="border-t border-border"
                                  data-row-variant={rowVariant}
                                >
                                  <td className="px-3 py-2 font-medium">
                                    {mode === "admin" && nodeId ? (
                                      <Link to={`${basePath}/nodes/${nodeId}`} className="hover:underline">
                                        {nodeName}
                                      </Link>
                                    ) : (
                                      nodeName
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <span className="inline-flex min-w-24 justify-center">
                                      <Badge variant={health.variant} title={maintenanceReason}>
                                        {health.label}
                                      </Badge>
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <span className="inline-flex min-w-20 justify-center">
                                      <Badge variant={nodeStorageVariant(node)}>{nodeStorageLabel(node, t)}</Badge>
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-center text-muted">
                                    {typeof node.vps_count === "number" ? formatNumber(node.vps_count) : "—"}
                                  </td>
                                  <td className="px-3 py-2 text-center text-muted">{cpuUsedLabel(node)}</td>
                                  <td className="px-3 py-2 text-center text-muted">
                                    {node.kernel ? String(node.kernel) : "—"}
                                  </td>
                                  <td className="px-3 py-2 text-center text-muted">
                                    {cgroupVersionLabel(node["cgroup_version"])}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </Table>
                      </div>
                    </ClusterLocationPanel>
                  ))}
                </div>
                {nodeRows.length > renderedNodeCount ? (
                  <div className="text-xs text-muted">
                    {t("dashboard.section.cluster.more_nodes_compact", { count: nodeRows.length - renderedNodeCount })}
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
