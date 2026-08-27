import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../../app/auth';
import { useI18n } from '../../app/i18n';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { securityAdvisoryStateLabel, translatedApiValue } from '../../lib/apiValues';
import {
  advisoryCveLabels,
  fetchAllSecurityAdvisoryUpdates,
  fetchSecurityAdvisory,
  fetchSecurityAdvisoryCves,
  fetchSecurityAdvisoryNodeStatuses,
  fetchSecurityAdvisoryOutageLinks,
  type SecurityAdvisoryAffectedVps,
  type SecurityAdvisoryCve,
  type SecurityAdvisoryNodeStatus,
  type SecurityAdvisoryOutageLink,
  type SecurityAdvisoryUpdate,
} from '../../lib/api/securityAdvisories';
import { formatDateTime } from '../../lib/time';
import { pickLocalizedField, pickTranslation } from '../../lib/translations';
import { fetchAllOwnSecurityAdvisoryVps } from './securityAdvisoryPublic';

const PUBLIC_RELATED_ITEMS_LIMIT = 100;

function isPublicState(state: unknown): boolean {
  return state === 'published' || state === 'retracted';
}

function stateVariant(state: unknown): 'ok' | 'danger' | 'warn' | 'neutral' {
  if (state === 'published' || state === 'mitigated' || state === 'not_affected') return 'ok';
  if (state === 'vulnerable') return 'danger';
  if (state === 'unknown') return 'warn';
  return 'neutral';
}

function recordId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const id = (value as Record<string, unknown>)['id'];
  return typeof id === 'number' && Number.isFinite(id) ? id : null;
}

function recordLabel(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback;
  const record = value as Record<string, unknown>;

  for (const key of ['label', 'name', 'domain_name', 'hostname']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  return fallback;
}

function cveHref(cve: SecurityAdvisoryCve, label: string): string {
  if (typeof cve.url === 'string' && /^https:\/\//i.test(cve.url.trim())) return cve.url.trim();
  return `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(label)}`;
}

function nodeLabel(status: SecurityAdvisoryNodeStatus, fallback: string): string {
  return status.node_name?.trim() || recordLabel(status.node, fallback);
}

function outageInfo(
  link: SecurityAdvisoryOutageLink,
  languageCodes: string[],
  fallback: (id: number) => string,
): { id: number | null; label: string } {
  const id = link.outage_id ?? recordId(link.outage);
  const outage = link.outage && typeof link.outage === 'object'
    ? link.outage as Record<string, unknown>
    : null;
  const summary = outage ? pickTranslation(outage, 'summary', languageCodes) : undefined;

  return {
    id,
    label: summary ?? fallback(id ?? link.id),
  };
}

export function SecurityAdvisoryDetailPage() {
  const i18n = useI18n();
  const auth = useAuth();
  const params = useParams();
  const advisoryId = Number(params['advisoryId']);
  const validId = Number.isFinite(advisoryId) && advisoryId > 0;

  const advisoryQ = useQuery({
    queryKey: ['public', 'security_advisories', 'show', advisoryId],
    queryFn: async () => (await fetchSecurityAdvisory(advisoryId)).data,
    enabled: validId,
  });

  const publicAdvisory = advisoryQ.data && isPublicState(advisoryQ.data.state)
    ? advisoryQ.data
    : null;
  const loadRelated = validId && Boolean(publicAdvisory);
  const loadPersonalImpact = loadRelated && auth.status === 'authenticated' && Boolean(auth.user?.id);

  const cvesQ = useQuery({
    queryKey: ['public', 'security_advisories', advisoryId, 'cves'],
    queryFn: async () => (
      await fetchSecurityAdvisoryCves({
        securityAdvisoryId: advisoryId,
        limit: PUBLIC_RELATED_ITEMS_LIMIT,
      })
    ).data,
    enabled: loadRelated,
  });

  const nodeStatusesQ = useQuery({
    queryKey: ['public', 'security_advisories', advisoryId, 'node_statuses'],
    queryFn: async () => (
      await fetchSecurityAdvisoryNodeStatuses(advisoryId, {
        limit: PUBLIC_RELATED_ITEMS_LIMIT,
        includes: 'node',
      })
    ).data,
    enabled: loadRelated,
  });

  const updatesQ = useQuery({
    queryKey: ['public', 'security_advisories', advisoryId, 'updates'],
    queryFn: async () => (
      await fetchAllSecurityAdvisoryUpdates({
        securityAdvisoryId: advisoryId,
        limit: PUBLIC_RELATED_ITEMS_LIMIT,
      })
    ).data,
    enabled: loadRelated,
  });

  const ownVpsQ = useQuery({
    queryKey: ['public', 'security_advisories', advisoryId, 'own_affected_vps', auth.user?.id],
    queryFn: () => fetchAllOwnSecurityAdvisoryVps(
      advisoryId,
      auth.canUseAdminUi ? auth.user?.id : undefined,
    ),
    enabled: loadPersonalImpact,
  });

  const outageLinksQ = useQuery({
    queryKey: ['public', 'security_advisories', advisoryId, 'outage_links'],
    queryFn: async () => (
      await fetchSecurityAdvisoryOutageLinks({
        securityAdvisoryId: advisoryId,
        limit: PUBLIC_RELATED_ITEMS_LIMIT,
        includes: 'outage',
      })
    ).data,
    enabled: loadRelated,
  });

  const updates = useMemo(() => {
    return (updatesQ.data ?? []).slice().sort((a: SecurityAdvisoryUpdate, b: SecurityAdvisoryUpdate) => {
      const aPublishedAt = typeof a['published_at'] === 'string' ? a['published_at'] : null;
      const bPublishedAt = typeof b['published_at'] === 'string' ? b['published_at'] : null;
      const at = new Date(aPublishedAt ?? a.created_at ?? a.updated_at ?? 0).getTime();
      const bt = new Date(bPublishedAt ?? b.created_at ?? b.updated_at ?? 0).getTime();
      return bt - at;
    });
  }, [updatesQ.data]);

  if (!validId) {
    return (
      <Alert title={i18n.t('public.security_advisory_detail.invalid_id.title')} variant="danger">
        {i18n.t('public.security_advisory_detail.invalid_id.body')}
      </Alert>
    );
  }

  if (advisoryQ.isLoading) {
    return <Spinner label={i18n.t('public.security_advisory_detail.loading')} />;
  }

  if (advisoryQ.isError) {
    return <Alert title={i18n.t('public.security_advisory_detail.error')} variant="danger" />;
  }

  if (!publicAdvisory) {
    return <Alert title={i18n.t('public.security_advisory_detail.not_found')} variant="danger" />;
  }

  const title = publicAdvisory.name
    || i18n.t('public.security_advisories.fallback_title', { id: publicAdvisory.id });
  const summary = pickTranslation(publicAdvisory, 'summary', i18n.preferredLanguageCodes);
  const description = pickTranslation(publicAdvisory, 'description', i18n.preferredLanguageCodes);
  const response = pickLocalizedField(publicAdvisory, 'response', i18n.preferredLanguageCodes);
  const cveObjects = cvesQ.data ?? [];
  const cveLabels = advisoryCveLabels({ ...publicAdvisory, cves: cveObjects });
  const cvesByLabel = new Map(
    cveObjects
      .map((cve) => [String(cve.cve_id ?? '').trim().toUpperCase(), cve] as const)
      .filter(([label]) => Boolean(label)),
  );

  return (
    <div className="space-y-6" data-testid="public.security_advisory_detail.page">
      <div className="space-y-3">
        <Link className="text-sm text-accent hover:underline" to="/security-advisories">
          ← {i18n.t('public.security_advisory_detail.back')}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <div className="text-sm text-muted">
              {i18n.t('public.security_advisories.published')}: {formatDateTime(publicAdvisory.published_at)}
              {publicAdvisory.retracted_at
                ? ` · ${i18n.t('public.security_advisory_detail.retracted')}: ${formatDateTime(publicAdvisory.retracted_at)}`
                : ''}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {loadPersonalImpact && typeof publicAdvisory.affected === 'boolean' ? (
              <Badge variant={publicAdvisory.affected ? 'danger' : 'neutral'}>
                {i18n.t(publicAdvisory.affected
                  ? 'dashboard.section.security.affects_me'
                  : 'dashboard.section.security.not_affected')}
              </Badge>
            ) : null}
            <Badge variant={stateVariant(publicAdvisory.state)}>
              {securityAdvisoryStateLabel(i18n.t, publicAdvisory.state)}
            </Badge>
          </div>
        </div>

        {cvesQ.isLoading ? (
          <Spinner label={i18n.t('public.security_advisory_detail.cves.loading')} />
        ) : cvesQ.isError ? (
          <Alert title={i18n.t('public.security_advisory_detail.cves.error')} variant="warn" />
        ) : cveLabels.length > 0 ? (
          <div className="flex flex-wrap gap-2" aria-label={i18n.t('public.security_advisory_detail.cves.title')}>
            {cveLabels.map((label) => {
              const cve = cvesByLabel.get(label) ?? { id: 0, cve_id: label };
              return (
                <a
                  key={label}
                  href={cveHref(cve, label)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35"
                >
                  <Badge variant="info">{label} ↗</Badge>
                </a>
              );
            })}
          </div>
        ) : null}
      </div>

      {summary ? (
        <Alert title={i18n.t('public.security_advisory_detail.summary')} variant="info">
          <div className="whitespace-pre-wrap">{summary}</div>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {description ? (
          <Card>
            <CardHeader title={i18n.t('public.security_advisory_detail.description')} />
            <CardBody>
              <div className="whitespace-pre-wrap text-sm text-fg">{description}</div>
            </CardBody>
          </Card>
        ) : null}

        {response ? (
          <Card>
            <CardHeader title={i18n.t('public.security_advisory_detail.response')} />
            <CardBody>
              <div className="whitespace-pre-wrap text-sm text-fg">{response}</div>
            </CardBody>
          </Card>
        ) : null}
      </div>

      {loadPersonalImpact ? (
        <Card testId="public.security_advisory_detail.own_affected_vps">
          <CardHeader
            title={i18n.t('public.security_advisories.affected_vps')}
            actions={typeof publicAdvisory.affected === 'boolean' ? (
              <Badge variant={publicAdvisory.affected ? 'danger' : 'neutral'}>
                {i18n.t(publicAdvisory.affected
                  ? 'dashboard.section.security.affects_me'
                  : 'dashboard.section.security.not_affected')}
              </Badge>
            ) : null}
          />
          <CardBody>
            {ownVpsQ.isLoading ? (
              <Spinner label={i18n.t('common.loading')} />
            ) : ownVpsQ.isError ? (
              <Alert title={i18n.t('common.error')} variant="warn" />
            ) : (ownVpsQ.data?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted">{i18n.t('dashboard.section.security.not_affected')}</div>
            ) : (
              <div className="divide-y divide-border">
                {ownVpsQ.data?.map((row: SecurityAdvisoryAffectedVps) => {
                  const vpsId = row.vps_id ?? recordId(row.vps);
                  const vpsName = recordLabel(
                    row.vps,
                    `${i18n.t('common.vps')} #${vpsId ?? row.id}`,
                  );
                  const nodeId = row.node_id ?? recordId(row.node);
                  const affectedNode = recordLabel(
                    row.node,
                    i18n.t('public.security_advisory_detail.nodes.fallback', { id: nodeId ?? row.id }),
                  );
                  const nodeState = row.node_state ?? 'unknown';

                  return (
                    <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        {vpsId ? (
                          <Link className="font-medium text-accent hover:underline" to={`/app/vps/${vpsId}`}>
                            {vpsName}
                          </Link>
                        ) : (
                          <div className="font-medium text-fg">{vpsName}</div>
                        )}
                        <div className="mt-1 text-xs text-muted">
                          {i18n.t('common.node')}: {affectedNode}
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {row.vulnerable_until
                            ? `${i18n.t('public.security_advisory_detail.nodes.vulnerable_until')}: ${formatDateTime(row.vulnerable_until)}`
                            : null}
                          {row.vulnerable_until && row.mitigated_since ? ' · ' : null}
                          {row.mitigated_since
                            ? `${i18n.t('public.security_advisory_detail.nodes.mitigated_since')}: ${formatDateTime(row.mitigated_since)}`
                            : null}
                        </div>
                      </div>
                      <Badge variant={stateVariant(nodeState)}>
                        {translatedApiValue(i18n.t, 'security_advisory.node_state', nodeState)}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={i18n.t('public.security_advisory_detail.nodes.title')}
          subtitle={i18n.t('public.security_advisory_detail.nodes.subtitle')}
        />
        <CardBody>
          {nodeStatusesQ.isLoading ? (
            <Spinner label={i18n.t('public.security_advisory_detail.nodes.loading')} />
          ) : nodeStatusesQ.isError ? (
            <Alert title={i18n.t('public.security_advisory_detail.nodes.error')} variant="warn" />
          ) : (nodeStatusesQ.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted">{i18n.t('public.security_advisory_detail.nodes.empty')}</div>
          ) : (
            <div className="divide-y divide-border">
              {nodeStatusesQ.data?.map((status) => {
                const state = status.state ?? 'unknown';
                return (
                  <div key={status.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div>
                      <div className="font-medium text-fg">
                        {nodeLabel(status, i18n.t('public.security_advisory_detail.nodes.fallback', { id: status.node_id ?? status.id }))}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {status.vulnerable_until
                          ? `${i18n.t('public.security_advisory_detail.nodes.vulnerable_until')}: ${formatDateTime(status.vulnerable_until)}`
                          : null}
                        {status.vulnerable_until && status.mitigated_since ? ' · ' : null}
                        {status.mitigated_since
                          ? `${i18n.t('public.security_advisory_detail.nodes.mitigated_since')}: ${formatDateTime(status.mitigated_since)}`
                          : null}
                      </div>
                    </div>
                    <Badge variant={stateVariant(state)}>
                      {translatedApiValue(i18n.t, 'security_advisory.node_state', state)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={i18n.t('public.security_advisory_detail.updates.title')}
          subtitle={i18n.t('public.security_advisory_detail.updates.subtitle')}
        />
        <CardBody>
          {updatesQ.isLoading ? (
            <Spinner label={i18n.t('public.security_advisory_detail.updates.loading')} />
          ) : updatesQ.isError ? (
            <Alert title={i18n.t('public.security_advisory_detail.updates.error')} variant="warn" />
          ) : updates.length === 0 ? (
            <div className="text-sm text-muted">{i18n.t('public.security_advisory_detail.updates.empty')}</div>
          ) : (
            <div className="space-y-4">
              {updates.map((update) => {
                const updateSummary = pickLocalizedField(update, 'summary', i18n.preferredLanguageCodes);
                const message = pickLocalizedField(update, 'message', i18n.preferredLanguageCodes);
                const publishedAt = typeof update['published_at'] === 'string'
                  ? update['published_at']
                  : update.created_at;
                return (
                  <article key={update.id} className="rounded-lg border border-border bg-surface-2 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="font-semibold text-fg">
                          {updateSummary || i18n.t('public.security_advisory_detail.updates.fallback', { id: update.id })}
                        </h2>
                        <div className="mt-1 text-xs text-muted">
                          {formatDateTime(publishedAt)}
                        </div>
                      </div>
                      {update.state ? (
                        <Badge variant={stateVariant(update.state)}>
                          {securityAdvisoryStateLabel(i18n.t, update.state)}
                        </Badge>
                      ) : null}
                    </div>
                    {message ? <div className="mt-3 whitespace-pre-wrap text-sm text-fg">{message}</div> : null}
                  </article>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={i18n.t('public.security_advisory_detail.outages.title')} />
        <CardBody>
          {outageLinksQ.isLoading ? (
            <Spinner label={i18n.t('public.security_advisory_detail.outages.loading')} />
          ) : outageLinksQ.isError ? (
            <Alert title={i18n.t('public.security_advisory_detail.outages.error')} variant="warn" />
          ) : (outageLinksQ.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted">{i18n.t('public.security_advisory_detail.outages.empty')}</div>
          ) : (
            <div className="space-y-2">
              {outageLinksQ.data?.map((link) => {
                const outage = outageInfo(
                  link,
                  i18n.preferredLanguageCodes,
                  (id) => i18n.t('public.security_advisory_detail.outages.fallback', { id }),
                );
                return outage.id ? (
                  <Link
                    key={link.id}
                    className="block rounded-lg border border-border bg-surface-2 p-3 text-sm font-medium text-accent hover:underline"
                    to={`/outages/${outage.id}`}
                  >
                    {outage.label} →
                  </Link>
                ) : (
                  <div key={link.id} className="rounded-lg border border-border bg-surface-2 p-3 text-sm text-fg">
                    {outage.label}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
