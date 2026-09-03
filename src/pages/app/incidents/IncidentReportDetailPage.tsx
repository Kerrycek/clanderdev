import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { PageContainer } from '../../../components/layout/PageContainer';
import { fetchIncidentReport } from '../../../lib/api/incidents';
import { formatDateTime } from '../../../lib/format';

import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { ChipLink } from '../../../components/ui/ChipLink';
import { ErrorState } from '../../../components/ui/ErrorState';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ObjectHeader } from '../../../components/ui/ObjectHeader';

function vpsActionVariant(action?: string): 'neutral' | 'warn' | 'danger' {
  if (!action) return 'neutral';
  if (action === 'stop') return 'danger';
  if (action === 'suspend' || action === 'disable_network') return 'warn';
  return 'neutral';
}

function vpsActionLabelKey(action?: string): string {
  if (!action) return 'incidents.action.none';
  if (action === 'none') return 'incidents.action.none';
  if (action === 'stop') return 'incidents.action.stop';
  if (action === 'suspend') return 'incidents.action.suspend';
  if (action === 'disable_network') return 'incidents.action.disable_network';
  return 'incidents.action.unknown';
}

export function incidentFiledByPath(mode: string, basePath: string, userId: number): string | undefined {
  return mode === 'admin' ? `${basePath}/users/${userId}` : undefined;
}

export function IncidentReportDetailPage() {
  const { incidentId } = useParams();
  const id = Number(incidentId);

  const { basePath, mode } = useAppMode();
  const { t } = useI18n();

  const includes = mode === 'admin' ? 'user,vps,ip_address_assignment,filed_by,mailbox' : 'vps,ip_address_assignment,filed_by';

  const q = useQuery({
    queryKey: ['incident_reports', 'show', id, { scope: basePath }],
    queryFn: async () => (await fetchIncidentReport(id, { includes })).data,
    enabled: Number.isFinite(id) && id > 0,
  });

  const r = q.data;

  const meta = useMemo(() => {
    if (!r) return null;

    const det = r.detected_at ? formatDateTime(r.detected_at) : t('common.na');
    const rep = r.reported_at ? formatDateTime(r.reported_at) : t('common.na');

    const vpsIdRow = (r.vps as any)?.id ? Number((r.vps as any).id) : undefined;
    const vpsHost = (r.vps as any)?.hostname ? String((r.vps as any).hostname) : undefined;

    const userIdRow = (r.user as any)?.id ? Number((r.user as any).id) : undefined;
    const userLogin = (r.user as any)?.login ? String((r.user as any).login) : undefined;

    const filedId = (r.filed_by as any)?.id ? Number((r.filed_by as any).id) : undefined;
    const filedLogin = (r.filed_by as any)?.login ? String((r.filed_by as any).login) : undefined;
    const filedPath = filedId ? incidentFiledByPath(mode, basePath, filedId) : undefined;

    const ip = (r.ip_address_assignment as any)?.ip_addr ? String((r.ip_address_assignment as any).ip_addr) : undefined;

    const action = String(r.vps_action ?? 'none');
    const cpu = typeof r.cpu_limit === 'number' && Number.isFinite(r.cpu_limit) ? Math.floor(r.cpu_limit) : null;

    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">{t('incidents.field.detected_at')}:</span>
        <span>{det}</span>

        <span className="text-muted">{t('incidents.field.reported_at')}:</span>
        <span>{rep}</span>

        {vpsIdRow ? (
          <ChipLink to={`${basePath}/vps/${vpsIdRow}`}>{vpsHost || `#${vpsIdRow}`}</ChipLink>
        ) : r.raw_vps_id ? (
          <span className="font-mono text-xs">#{r.raw_vps_id}</span>
        ) : null}

        {mode === 'admin' && userIdRow ? (
          <ChipLink to={`${basePath}/users/${userIdRow}`}>{userLogin || `#${userIdRow}`}</ChipLink>
        ) : null}

        {ip ? <span className="font-mono text-xs">{ip}</span> : null}

        {action !== 'none' ? <Badge variant={vpsActionVariant(action)}>{t(vpsActionLabelKey(action))}</Badge> : null}

        {cpu !== null ? <Badge variant="warn">{t('incidents.badge.cpu_limit', { pct: cpu })}</Badge> : null}

        {filedId ? (
          <span className="text-xs text-faint">
            {t('incidents.field.filed_by')}:{' '}
            {filedPath ? (
              <ChipLink to={filedPath}>{filedLogin || `#${filedId}`}</ChipLink>
            ) : (
              <span>{filedLogin || `#${filedId}`}</span>
            )}
          </span>
        ) : null}
      </div>
    );
  }, [basePath, mode, r, t]);

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <PageContainer testId="incidents.detail.invalid">
        <ErrorState title={t('incidents.detail.invalid_id')} body={t('error.not_found.body')} showBack />
      </PageContainer>
    );
  }

  if (q.isLoading) {
    return (
      <PageContainer testId="incidents.detail.loading">
        <LoadingState />
      </PageContainer>
    );
  }

  if (q.isError || !r) {
    return (
      <PageContainer testId="incidents.detail.error">
        <ErrorState
          title={t('incidents.detail.load_error')}
          error={q.error}
          onRetry={() => void q.refetch()}
          showBack
        />
      </PageContainer>
    );
  }

  const action = String(r.vps_action ?? 'none');

  const vpsIdRow = (r.vps as any)?.id ? Number((r.vps as any).id) : undefined;
  const vpsHost = (r.vps as any)?.hostname ? String((r.vps as any).hostname) : undefined;

  const titleAfter = action !== 'none' ? <Badge variant={vpsActionVariant(action)}>{t(vpsActionLabelKey(action))}</Badge> : undefined;

  return (
    <PageContainer testId="incidents.detail">
      <ObjectHeader
        kicker={{ label: t('incidents.list.title'), href: `${basePath}/incidents` }}
        title={t('incidents.detail.title', { id })}
        titleAfter={titleAfter}
        meta={meta}
        actions={
          vpsIdRow ? (
            <Button variant="secondary" size="sm" to={`${basePath}/vps/${vpsIdRow}`} testId="incidents.detail.open_vps">
              {t('common.open_vps')}
            </Button>
          ) : null
        }
        testId="incidents.detail.header"
      />

      <div className="mt-4 grid grid-cols-1 gap-4">
        <Card testId="incidents.detail.summary">
          <CardHeader title={t('incidents.detail.summary_title')} subtitle={r.subject ? String(r.subject) : undefined} />
          <CardBody>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs text-muted">{t('incidents.field.id')}</div>
                <div className="mt-0.5 font-mono text-sm">{r.id}</div>
              </div>

              <div>
                <div className="text-xs text-muted">{t('incidents.field.codename')}</div>
                <div className="mt-0.5 font-mono text-sm">{r.codename ? String(r.codename) : '—'}</div>
              </div>

              <div>
                <div className="text-xs text-muted">{t('incidents.field.detected_at')}</div>
                <div className="mt-0.5 text-sm">{r.detected_at ? formatDateTime(r.detected_at) : '—'}</div>
              </div>

              <div>
                <div className="text-xs text-muted">{t('incidents.field.reported_at')}</div>
                <div className="mt-0.5 text-sm">{r.reported_at ? formatDateTime(r.reported_at) : '—'}</div>
              </div>

              <div>
                <div className="text-xs text-muted">{t('incidents.field.vps_action')}</div>
                <div className="mt-0.5 text-sm">{t(vpsActionLabelKey(action))}</div>
              </div>

              <div>
                <div className="text-xs text-muted">{t('incidents.field.cpu_limit')}</div>
                <div className="mt-0.5 text-sm">
                  {typeof r.cpu_limit === 'number' && Number.isFinite(r.cpu_limit)
                    ? t('incidents.value.cpu_limit', { pct: Math.floor(r.cpu_limit) })
                    : t('common.na')}
                </div>
              </div>

              {mode === 'admin' ? (
                <>
                  <div>
                    <div className="text-xs text-muted">{t('common.user')}</div>
                    <div className="mt-0.5 text-sm">
                      {(r.user as any)?.id ? (
                        <ChipLink to={`${basePath}/users/${Number((r.user as any).id)}`}>
                          {String((r.user as any).login ?? `#${Number((r.user as any).id)}`)}
                        </ChipLink>
                      ) : (
                        t('common.na')
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-muted">{t('incidents.field.mailbox')}</div>
                    <div className="mt-0.5 text-sm">
                      {(r.mailbox as any)?.id ? (
                        <ChipLink to={`${basePath}/mailer/mailboxes/${Number((r.mailbox as any).id)}`}>
                          {String((r.mailbox as any).label ?? `#${Number((r.mailbox as any).id)}`)}
                        </ChipLink>
                      ) : (
                        t('common.na')
                      )}
                    </div>
                  </div>
                </>
              ) : null}

              <div>
                <div className="text-xs text-muted">{t('common.vps')}</div>
                <div className="mt-0.5 text-sm">
                  {vpsIdRow ? (
                    <ChipLink to={`${basePath}/vps/${vpsIdRow}`}>{vpsHost || `#${vpsIdRow}`}</ChipLink>
                  ) : r.raw_vps_id ? (
                    <span className="font-mono text-xs">#{r.raw_vps_id}</span>
                  ) : (
                    t('common.na')
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs text-muted">{t('incidents.field.ip')}</div>
                <div className="mt-0.5 font-mono text-xs">
                  {(r.ip_address_assignment as any)?.ip_addr
                    ? String((r.ip_address_assignment as any).ip_addr)
                    : t('common.na')}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card testId="incidents.detail.text">
          <CardHeader title={t('incidents.detail.report_text')} />
          <CardBody>
            <pre className="max-h-scroll-lg overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 text-xs font-mono">
              {r.text ? String(r.text) : ''}
            </pre>
          </CardBody>
        </Card>
      </div>
    </PageContainer>
  );
}
