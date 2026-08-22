import React from 'react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/i18n';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { StatusDot } from '../../../components/ui/StatusDot';
import { TableCard } from '../../../components/ui/TableCard';
import { TableRowLink } from '../../../components/ui/TableRowLink';
import { clsx } from '../../../components/ui/clsx';
import type { ExportItem } from '../../../lib/api/exports';
import { formatDateTime } from '../../../lib/format';
import { exportAddress, exportRowVariant, sourceLabel } from './ExportModel';

function exportBadge(ex: ExportItem, t: (k: string) => string) {
  return ex.enabled === false
    ? { variant: 'warn' as const, label: t('common.disabled') }
    : { variant: 'ok' as const, label: t('common.enabled') };
}

type PaginationProps = {
  page: number;
  pageCount: number;
  limit: number;
  allowedLimits: readonly number[];
  onLimitChange: (limit: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onGoToPage: (page: number) => void;
  canPrev: boolean;
  canNext: boolean;
};

export function ExportsListResults(props: {
  rows: ExportItem[];
  basePath: string;
  embedded: boolean;
  canPaginate: boolean;
  pagination: PaginationProps;
}) {
  const { t } = useI18n();
  const prefix = props.embedded ? 'dataset.exports' : 'exports';

  return (
    <>
      <div className="hidden md:block">
        <TableCard
          testId={`${prefix}.table`}
          tableClassName="table-fixed"
          footer={
            props.canPaginate ? (
              <KeysetPagination {...props.pagination} testId={`${prefix}.pagination.desktop`} />
            ) : null
          }
        >
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="w-8 px-3 py-2" />
                  <th className="w-24 px-3 py-2">{t('common.id')}</th>
                  <th className="px-3 py-2">{t('common.dataset')}</th>
                  <th className="px-3 py-2">{t('exports.field.address')}</th>
                  <th className="px-3 py-2">{t('exports.field.path')}</th>
                  <th className="w-28 px-3 py-2">{t('common.state')}</th>
                  <th className="w-28 px-3 py-2">{t('exports.field.mode')}</th>
                  <th className="w-36 px-3 py-2">{t('common.updated')}</th>
                </tr>
              </thead>
              <tbody>
                {props.rows.map((ex) => {
                  const variant = exportRowVariant(ex);
                  const badge = exportBadge(ex, t);
                  return (
                    <TableRowLink
                      key={ex.id}
                      to={`${props.basePath}/exports/${ex.id}`}
                      variant={variant}
                      testId={`exports.row.${ex.id}`}
                      className="border-b border-border/80 hover:bg-surface-2"
                    >
                      <td className="px-3 py-2 align-top"><StatusDot variant={variant === 'warn' ? 'warn' : 'ok'} /></td>
                      <td className="px-3 py-2 align-top font-medium text-fg">#{ex.id}</td>
                      <td className="px-3 py-2 align-top text-muted">{sourceLabel(ex)}</td>
                      <td className="px-3 py-2 align-top font-mono text-xs text-fg">{exportAddress(ex)}</td>
                      <td className="px-3 py-2 align-top font-mono text-xs text-fg">{String(ex.path ?? '—')}</td>
                      <td className="px-3 py-2 align-top"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                      <td className="px-3 py-2 align-top text-muted">{ex.rw ? t('exports.mode.rw') : t('exports.mode.ro')}</td>
                      <td className="px-3 py-2 align-top text-muted">{ex.updated_at ? formatDateTime(ex.updated_at) : '—'}</td>
                    </TableRowLink>
                  );
                })}
              </tbody>
        </TableCard>
      </div>

      <div className="space-y-3 md:hidden">
        {props.rows.map((ex) => {
          const variant = exportRowVariant(ex);
          const badge = exportBadge(ex, t);
          return (
            <Card key={ex.id} testId={`exports.card.${ex.id}`} className={clsx(variant === 'warn' ? 'bg-warn-row border-warn-border' : undefined)}>
              <Link to={`${props.basePath}/exports/${ex.id}`} className="block p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusDot variant={variant === 'warn' ? 'warn' : 'ok'} />
                      <div className="font-medium text-fg">#{ex.id}</div>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-muted">{sourceLabel(ex)}</div>
                    <div className="mt-2 font-mono text-xs text-fg">{exportAddress(ex)}:{String(ex.path ?? '')}</div>
                  </div>
                </div>
              </Link>
            </Card>
          );
        })}
      </div>

      {props.canPaginate ? (
        <Card className="md:hidden">
          <KeysetPagination {...props.pagination} testId={`${prefix}.pagination.mobile`} />
        </Card>
      ) : null}
    </>
  );
}
