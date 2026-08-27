import React from 'react';
import type { Node } from '../../../../lib/api/nodes';
import type { PublicNodeStatus } from '../../../../lib/api/public';
import { formatDateTime, formatMiB, formatUptimeSeconds } from '../../../../lib/format';
import { Badge } from '../../../../components/ui/Badge';
import { Card } from '../../../../components/ui/Card';
import { fmt, fmtLoad, fmtPercent, statusBadge } from './nodeDetailSemantics';

export function NodeOverviewCards(props: {
  node: Node;
  loc?: string;
  statusRow?: PublicNodeStatus;
  t: (key: any, params?: Record<string, unknown>) => string;
}) {
  const { node, loc, statusRow, t } = props;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card>
        <div className="p-4">
          <div className="text-sm font-semibold">{t('admin.node.section.identity')}</div>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted">{t('common.id')}</dt>
              <dd>#{node.id}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.name')}</dt>
              <dd>{fmt(node.name)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.domain_name')}</dt>
              <dd>{fmt(node.domain_name)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.fqdn')}</dt>
              <dd>{fmt(node.fqdn)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.role')}</dt>
              <dd>{fmt(node.type)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.hypervisor')}</dt>
              <dd>{fmt(node.hypervisor_type)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.ip')}</dt>
              <dd>{fmt(node.ip_addr)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.location')}</dt>
              <dd>{loc ?? '—'}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <div className="text-sm font-semibold">{t('admin.node.section.health')}</div>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.status')}</dt>
              <dd>
                {(() => {
                  const b = statusBadge(t, node.status);
                  return (
                    <span className="inline-flex items-center gap-2">
                      <Badge variant={b.variant}>{b.label}</Badge>
                      {statusRow ? (
                        <span className="text-xs text-muted">
                          ({t('admin.node.health.public_prefix')}{' '}
                          <span className="font-medium">{statusBadge(t, statusRow.status).label}</span>)
                        </span>
                      ) : null}
                    </span>
                  );
                })()}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.last_report')}</dt>
              <dd>{formatDateTime(statusRow?.last_report ?? node.pool_checked_at ?? undefined)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.uptime')}</dt>
              <dd>{formatUptimeSeconds(node.uptime)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.load_average')}</dt>
              <dd>
                {fmtLoad(node.loadavg1)} / {fmtLoad(node.loadavg5)} / {fmtLoad(node.loadavg15)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.process_count')}</dt>
              <dd>{fmt(node.process_count)}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <div className="text-sm font-semibold">{t('admin.node.section.resources')}</div>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.cpus')}</dt>
              <dd>{fmt(node.cpus)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.cpu_idle')}</dt>
              <dd>{fmtPercent(node.cpu_idle)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.memory')}</dt>
              <dd>
                {formatMiB(node.used_memory)} <span className="text-faint">/ {formatMiB(node.total_memory)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.swap')}</dt>
              <dd>
                {formatMiB(node.used_swap)} <span className="text-faint">/ {formatMiB(node.total_swap)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.arc_hit')}</dt>
              <dd>{fmtPercent(node.arc_hitpercent)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.kernel')}</dt>
              <dd className="break-words">{fmt(node.kernel)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.vpsadminos')}</dt>
              <dd className="break-words">{fmt(node.version)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('admin.node.field.cgroup')}</dt>
              <dd>{fmt(node.cgroup_version)}</dd>
            </div>
          </dl>
        </div>
      </Card>
    </div>
  );
}
