import type { TranslationKey } from '../../../../app/i18n';
import type {
  SecurityAdvisory,
  SecurityAdvisoryOutageLink,
  SecurityAdvisoryUpdate,
} from '../../../../lib/api/securityAdvisories';
import type { PublishReadinessIssue } from './securityAdvisoryAdminModel';

export type DetailTab = 'overview' | 'nodes' | 'affected' | 'updates' | 'outages';
export const DETAIL_TABS: DetailTab[] = ['overview', 'nodes', 'affected', 'updates', 'outages'];

export function sortSecurityAdvisoryUpdates(updates: SecurityAdvisoryUpdate[]): SecurityAdvisoryUpdate[] {
  return updates.slice().sort((a, b) => {
    const aTime = new Date(a.created_at ?? a.updated_at ?? 0).getTime();
    const bTime = new Date(b.created_at ?? b.updated_at ?? 0).getTime();
    return bTime - aTime;
  });
}

export function detailTabTranslationKey(tab: DetailTab): TranslationKey {
  return `admin.security_advisories.tab.${tab}` as TranslationKey;
}

export function nodeStateTranslationKey(state: string): TranslationKey {
  return `admin.security_advisories.node_state.${state}` as TranslationKey;
}

export function securityAdvisoryStateVariant(state: string): 'neutral' | 'ok' | 'warn' {
  if (state === 'published') return 'ok';
  if (state === 'retracted') return 'warn';
  return 'neutral';
}

export function finiteSecurityAdvisoryCount(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '—';
}

export function securityAdvisoryTitle(
  advisory: SecurityAdvisory,
  t: (key: any, vars?: any) => string,
): string {
  return advisory.name || t('admin.security_advisories.fallback_title', { id: advisory.id });
}

export function securityAdvisoryReadinessMessage(
  issue: PublishReadinessIssue,
  t: (key: any, vars?: any) => string,
): string {
  if (issue.type === 'missing_cves') return t('admin.security_advisories.readiness.missing_cves');
  if (issue.type === 'missing_node_status') {
    return t('admin.security_advisories.readiness.missing_node_status', { node: issue.nodeName });
  }
  if (issue.type === 'missing_mitigation_times') {
    return t('admin.security_advisories.readiness.missing_mitigation_times', { node: issue.nodeName });
  }
  return t('admin.security_advisories.readiness.unresolved_node', { node: issue.nodeName });
}

export function securityAdvisoryOutageObject(
  link: SecurityAdvisoryOutageLink,
): Record<string, unknown> | null {
  return link.outage && typeof link.outage === 'object'
    ? (link.outage as Record<string, unknown>)
    : null;
}
