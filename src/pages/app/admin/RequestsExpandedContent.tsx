import React from 'react';

import { useI18n } from '../../../app/i18n';
import { Badge } from '../../../components/ui/Badge';
import { formatDateTime } from '../../../lib/format';
import { fraudRiskBadge } from '../../../lib/requestsBadges';
import {
  RequestOperationalLinks,
  RequestReviewActions,
} from './RequestReviewActions';
import {
  requestDateValue,
  requestId,
  requestType,
  type UnifiedRequestRow,
  userLabel,
} from './RequestsModel';

export function RequestsExpandedContent(props: {
  request: UnifiedRequestRow;
  isAdmin: boolean;
  basePath: string;
  compact?: boolean;
  onResolved: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const { request, isAdmin, basePath, compact = false, onResolved } = props;
  const id = requestId(request);
  const reqType = requestType(request);
  const testPrefix = `admin.requests.expanded.${reqType}.${id}`;
  const risk = request._type === 'registration' ? fraudRiskBadge(request) : null;
  const updatedAt = requestDateValue(request, 'updated_at');

  return (
    <div className="space-y-3" data-testid={testPrefix}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <div className="text-xs text-muted">{t('common.user')}</div>
          <div className="text-sm">{userLabel(request.user)}</div>
        </div>
        <div>
          <div className="text-xs text-muted">{t('requests.detail.admin')}</div>
          <div className="text-sm">{userLabel(request.admin)}</div>
        </div>
        <div>
          <div className="text-xs text-muted">{t('common.updated')}</div>
          <div className="text-sm">
            {updatedAt ? formatDateTime(updatedAt) : '—'}
          </div>
        </div>

        {request._type === 'registration' ? (
          <>
            <div>
              <div className="text-xs text-muted">{t('requests.field.login')}</div>
              <div className="text-sm">{String(request.login ?? '—')}</div>
            </div>
            <div>
              <div className="text-xs text-muted">{t('requests.field.full_name')}</div>
              <div className="text-sm">{String(request.full_name ?? '—')}</div>
            </div>
            <div>
              <div className="text-xs text-muted">{t('requests.field.email')}</div>
              <div className="text-sm">{String(request.email ?? '—')}</div>
            </div>
            <div className="md:col-span-3">
              <div className="text-xs text-muted">{t('requests.field.address')}</div>
              <div className="whitespace-pre-line text-sm">
                {String(request.address ?? '—')}
              </div>
            </div>
            <div className="md:col-span-3">
              <div className="text-xs text-muted">{t('requests.field.note')}</div>
              <div className="whitespace-pre-line text-sm">
                {String(request.note ?? '—')}
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="text-xs text-muted">{t('requests.field.full_name')}</div>
              <div className="text-sm">{String(request.full_name ?? '—')}</div>
            </div>
            <div>
              <div className="text-xs text-muted">{t('requests.field.email')}</div>
              <div className="text-sm">{String(request.email ?? '—')}</div>
            </div>
            <div className="md:col-span-3">
              <div className="text-xs text-muted">
                {t('requests.field.change_reason')}
              </div>
              <div className="whitespace-pre-line text-sm">
                {String(request.change_reason ?? '—')}
              </div>
            </div>
          </>
        )}
      </div>

      {request.admin_response ? (
        <div className="rounded-md border border-border bg-surface p-3">
          <div className="text-xs text-muted">
            {t('requests.detail.admin_response')}
          </div>
          <div className="mt-1 whitespace-pre-line text-sm">
            {String(request.admin_response)}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {isAdmin && risk ? (
          <Badge
            variant={risk.variant}
            title={t('requests.risk.tooltip', { score: risk.score })}
          >
            {t(risk.labelKey)} {risk.score}
          </Badge>
        ) : null}
        <RequestOperationalLinks
          request={request}
          basePath={basePath}
          compact
          testIdPrefix={testPrefix}
        />
      </div>

      {isAdmin ? (
        <RequestReviewActions
          request={request}
          reqType={reqType}
          reqId={id}
          isAdmin
          basePath={basePath}
          compact={compact}
          showDetailLink
          testIdPrefix={`${testPrefix}.resolve`}
          onResolved={onResolved}
        />
      ) : null}
    </div>
  );
}
