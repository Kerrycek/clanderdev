import React from 'react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../../../app/i18n';

import type { IpAddress } from '../../../../lib/api/ipAddresses';
import { formatDateTime } from '../../../../lib/format';

import { Badge } from '../../../../components/ui/Badge';
import { KeysetPagination } from '../../../../components/ui/KeysetPagination';
import { StatusDot } from '../../../../components/ui/StatusDot';
import { TableCard } from '../../../../components/ui/TableCard';
import { TableRowLink } from '../../../../components/ui/TableRowLink';

import { IpAddressRowActions } from './IpAddressRowActions';
import {
  ifaceLabel,
  environmentLabel,
  locationMark,
  ipAddressText,
  ipCreatedAt,
  ipDotVariant,
  ipId,
  ipLabel,
  ipRowVariant,
  ipUserId,
  ipVpsId,
  isAssignedToInterface,
  isPrivateIp,
  isRoutedIp,
  networkLabel,
  userLabel,
  vpsLabel,
} from './ipAddressListSemantics';

interface PaginationProps {
  page: number;
  pageCount: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onGoToPage: (page: number) => void;
  limit: number;
  allowedLimits: readonly number[];
  onLimitChange: (limit: number) => void;
}

interface IpAddressesListTableProps {
  pageData: IpAddress[];
  ipDetailBasePath: string;
  basePath: string;
  na: string;
  locationFallback?: { label?: string | null; environment?: { label?: string | null } | null } | null;
  canPaginate: boolean;
  pagination: PaginationProps;
}

export function IpAddressesListTable({ pageData, ipDetailBasePath, basePath, na, locationFallback, canPaginate, pagination }: IpAddressesListTableProps) {
  const { t } = useI18n();

  return (
    <TableCard
      className="hidden md:block"
      minWidth="lg"
      tableClassName="table-fixed"
      tableTestId="admin.ip_addresses.table"
      footer={
        canPaginate ? (
          <KeysetPagination
            page={pagination.page}
            pageCount={pagination.pageCount}
            canPrev={pagination.canPrev}
            canNext={pagination.canNext}
            onPrev={pagination.onPrev}
            onNext={pagination.onNext}
            onGoToPage={pagination.onGoToPage}
            limit={pagination.limit}
            allowedLimits={pagination.allowedLimits}
            onLimitChange={pagination.onLimitChange}
            testId="admin.ip_addresses.pagination.desktop"
          />
        ) : null
      }
    >
      <colgroup>
        <col style={{ width: '3%' }} />
        <col style={{ width: '14%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '8%' }} />
        <col style={{ width: '9%' }} />
        <col style={{ width: '9%' }} />
        <col style={{ width: '9%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '9%' }} />
        <col style={{ width: '19%' }} />
      </colgroup>
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted">
          <th className="w-8 px-3 py-2" aria-label={t('common.state')} />
          <th className="px-3 py-2">{t('admin.ip_addresses.field.ip')}</th>
          <th className="px-3 py-2">{t('admin.ip.field.network')}</th>
          <th className="px-3 py-2">{t('admin.ip_addresses.field.environment')}</th>
          <th className="px-3 py-2">{t('object_kind.vps')}</th>
          <th className="px-3 py-2">{t('admin.user.heading')}</th>
          <th className="px-3 py-2">{t('admin.ip_addresses.field.interface')}</th>
          <th className="px-3 py-2">{t('admin.ip_addresses.field.flags')}</th>
          <th className="px-3 py-2">{t('admin.ip.field.created')}</th>
          <th className="px-1 py-2 text-right">{t('common.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {pageData.map((ip) => {
          const id = ipId(ip);
          const vpsId = ipVpsId(ip);
          const userId = ipUserId(ip);
          const assigned = isAssignedToInterface(ip);
          const createdAt = ipCreatedAt(ip);
          const ipAddr = ipAddressText(ip);
          const mark = locationMark(ip, locationFallback);
          const detailPath = `${ipDetailBasePath}/${id}`;
          return (
            <TableRowLink
              key={id}
              testId={`admin.ip_addresses.row.${id}`}
              to={detailPath}
              variant={ipRowVariant(ip)}
              className="border-b border-border/60 last:border-b-0"
            >
              <td className="px-3 py-2">
                <StatusDot
                  variant={ipDotVariant(ip)}
                  ariaLabel={assigned ? t('admin.ip_addresses.chip.assigned_true') : t('admin.ip_addresses.chip.assigned_false')}
                  testId={`admin.ip_addresses.row.${id}.dot`}
                />
              </td>
              <td className="px-3 py-2">
                <Link className="font-medium text-accent hover:underline" to={detailPath}>
                  {ipLabel(ip)}
                </Link>
                <div className="mt-1 text-xs text-faint">#{id}</div>
              </td>
              <td className="px-3 py-2 text-xs text-muted">{networkLabel(ip, na)}</td>
              <td className="px-3 py-2 text-xs text-muted">
                {mark ? (
                  <span title={mark.label} aria-label={mark.label} className="inline-flex min-w-5 justify-center rounded border border-border bg-surface-2 px-1 font-semibold text-fg">
                    {mark.code}
                  </span>
                ) : (
                  environmentLabel(ip, na)
                )}
              </td>
              <td className="px-3 py-2 text-xs">
                {vpsId ? (
                  <Link className="text-accent hover:underline" to={`${basePath}/vps/${vpsId}`}>
                    {vpsLabel(ip, na)}
                  </Link>
                ) : (
                  <span className="text-faint">{na}</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs">
                {userId ? (
                  <Link className="text-accent hover:underline" to={`${basePath}/users/${userId}`}>
                    {userLabel(ip, na)}
                  </Link>
                ) : (
                  <span className="text-faint">{na}</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-muted">{ifaceLabel(ip, na)}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={assigned ? 'ok' : 'warn'}>
                    {assigned ? t('admin.ip_addresses.chip.assigned_true') : t('admin.ip_addresses.chip.assigned_false')}
                  </Badge>
                  {isPrivateIp(ip) ? <Badge variant="neutral">{t('admin.ip_addresses.chip.private')}</Badge> : null}
                  {isRoutedIp(ip) ? <Badge variant="black">{t('admin.ip.routed_badge')}</Badge> : null}
                </div>
              </td>
              <td className="px-3 py-2 text-xs text-muted">{createdAt ? formatDateTime(createdAt) : na}</td>
              <td className="px-1 py-2 text-right">
                <IpAddressRowActions
                  ipAddr={ipAddr}
                  detailPath={detailPath}
                  basePath={basePath}
                  assigned={assigned}
                  testIdPrefix={`admin.ip_addresses.row.${id}`}
                />
              </td>
            </TableRowLink>
          );
        })}
      </tbody>
    </TableCard>
  );
}
