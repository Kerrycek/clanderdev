import React, { useMemo } from 'react';

import { useI18n } from '../../../app/i18n';
import type { RegistrationRequest, ResolveUserRequestAction } from '../../../lib/api/requests';
import {
  fraudRiskBadge,
  requestStateBadgeVariant,
  requestStateLabelKey,
  requestTypeBadgeVariant,
  requestTypeLabelKey,
} from '../../../lib/requestsBadges';

import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';

import type { RequestResolveOverrides, RequestReviewType, ReviewableRequest } from './RequestReviewTypes';

function trimValue(value: string): string {
  return value.trim();
}

function overrideRows(reqType: RequestReviewType, overrides: RequestResolveOverrides) {
  const rows =
    reqType === 'registration'
      ? [
          { labelKey: 'requests.override.login', value: overrides.login },
          { labelKey: 'requests.override.full_name', value: overrides.fullName },
          { labelKey: 'requests.override.org_name', value: overrides.orgName },
          { labelKey: 'requests.override.org_id', value: overrides.orgId },
          { labelKey: 'requests.override.email', value: overrides.email },
          { labelKey: 'requests.override.address', value: overrides.address },
        ]
      : [
          { labelKey: 'requests.override.full_name', value: overrides.fullName },
          { labelKey: 'requests.override.email', value: overrides.email },
          { labelKey: 'requests.override.address', value: overrides.address },
          { labelKey: 'requests.override.change_reason', value: overrides.changeReason },
        ];

  return rows.map((row) => ({ ...row, value: trimValue(row.value) })).filter((row) => row.value);
}

function impactKey(reqType: RequestReviewType, action: ResolveUserRequestAction): string {
  if (action === 'approve' && reqType === 'registration') return 'requests.resolve.review.impact.approve_registration';
  if (action === 'approve') return 'requests.resolve.review.impact.approve_change';
  if (action === 'request_correction') return 'requests.resolve.review.impact.request_correction';
  if (action === 'deny') return 'requests.resolve.review.impact.deny';
  return 'requests.resolve.review.impact.ignore';
}

export function RequestResolveReview(props: {
  request: ReviewableRequest;
  reqType: RequestReviewType;
  reqId: number;
  action: ResolveUserRequestAction;
  requiresReason: boolean;
  approveCreateVps: boolean;
  approveActivate: boolean;
  approveNode: string;
  overrides: RequestResolveOverrides;
  testIdPrefix: string;
}) {
  const { t } = useI18n();
  const state = String(props.request.state ?? '').trim();
  const risk = props.reqType === 'registration' ? fraudRiskBadge(props.request as RegistrationRequest) : null;
  const rows = useMemo(() => overrideRows(props.reqType, props.overrides), [props.overrides, props.reqType]);
  const nodeLabel = trimValue(props.approveNode) || t('common.auto');

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-border bg-surface-2 p-3" data-testid={`${props.testIdPrefix}.review`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">{t('requests.resolve.review.title')}</div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={requestTypeBadgeVariant(props.reqType)}>{t(requestTypeLabelKey(props.reqType))}</Badge>
          <Badge variant={requestStateBadgeVariant(state)}>{t(requestStateLabelKey(state))}</Badge>
        </div>
      </div>

      {risk ? (
        <Alert variant={risk.variant === 'danger' ? 'danger' : 'warn'} title={t('requests.resolve.review.risk.title')} testId={`${props.testIdPrefix}.review.risk`}>
          {t('requests.resolve.review.risk.body', { score: risk.score })}
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">{t('requests.resolve.review.target')}</div>
          <div className="mt-1">#{props.reqId}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">{t('requests.resolve.review.impact')}</div>
          <div className="mt-1">{t(impactKey(props.reqType, props.action))}</div>
        </div>
        {props.reqType === 'registration' && props.action === 'approve' ? (
          <div className="md:col-span-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">{t('requests.resolve.approve.options')}</div>
            <div className="mt-1">
              {t('requests.resolve.review.registration_options', {
                createVps: props.approveCreateVps ? t('common.yes') : t('common.no'),
                activate: props.approveActivate ? t('common.yes') : t('common.no'),
                node: nodeLabel,
              })}
            </div>
          </div>
        ) : null}
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">{t('requests.resolve.review.gates')}</div>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>{props.requiresReason ? t('requests.resolve.review.reason_required') : t('requests.resolve.review.reason_optional')}</li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">{t('requests.resolve.review.overrides')}</div>
          {rows.length > 0 ? (
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {rows.map((row) => (
                <li key={row.labelKey}>
                  {t(row.labelKey)}: {row.value}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-1 text-muted">{t('requests.resolve.review.no_overrides')}</div>
          )}
        </div>
      </div>

      <div className="border-t border-border pt-2 text-xs text-muted">{t('requests.resolve.review.queue')}</div>
    </div>
  );
}
