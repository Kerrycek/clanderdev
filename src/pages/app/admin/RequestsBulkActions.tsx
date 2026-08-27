import React from 'react';

import { useI18n } from '../../../app/i18n';
import { Card, CardBody } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import type { ResolveUserRequestAction } from '../../../lib/api/requests';
import { requestActionVariant } from './RequestReviewModel';

export function RequestsBulkActions(props: {
  rowsLength: number;
  selectedRowsLength: number;
  action: ResolveUserRequestAction;
  reason: string;
  needsReason: boolean;
  submitting: boolean;
  onActionChange: (action: ResolveUserRequestAction) => void;
  onReasonChange: (reason: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onClear: () => void;
  onApply: () => void;
}) {
  const { t } = useI18n();
  const missingReason = props.needsReason && !props.reason.trim();

  return (
    <Card className="mb-4" testId="admin.requests.bulk">
      <CardBody className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{t('requests.bulk.title')}</div>
          <div className="mt-1 text-sm text-muted">
            {t('requests.bulk.selected', { count: String(props.selectedRowsLength) })}
          </div>
          {missingReason ? (
            <div className="mt-1 text-xs text-danger">
              {t('requests.bulk.reason_required')}
            </div>
          ) : null}
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 md:grid-cols-[minmax(180px,240px)_1fr_auto] lg:max-w-5xl">
          <Select
            value={props.action}
            onChange={(event) => {
              props.onActionChange(event.target.value as ResolveUserRequestAction);
            }}
            aria-label={t('requests.bulk.action')}
            testId="admin.requests.bulk.action"
          >
            <option value="approve">{t('requests.resolve.action.approve')}</option>
            <option value="deny">{t('requests.resolve.action.deny')}</option>
            <option value="ignore">{t('requests.resolve.action.ignore')}</option>
            <option value="request_correction">
              {t('requests.resolve.action.request_correction')}
            </option>
          </Select>

          <Textarea
            value={props.reason}
            onChange={(event) => props.onReasonChange(event.target.value)}
            rows={1}
            placeholder={t('requests.bulk.reason_placeholder')}
            ariaLabel={t('requests.resolve.reason')}
            disabled={!props.needsReason}
            className="min-h-9"
            testId="admin.requests.bulk.reason"
          />

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={props.onSelectAll}
              disabled={props.rowsLength === 0}
              testId="admin.requests.bulk.select_all"
            >
              {t('requests.bulk.select_all')}
            </Button>
            <Button
              variant="secondary"
              onClick={props.onDeselectAll}
              disabled={props.rowsLength === 0 || props.selectedRowsLength === 0}
              testId="admin.requests.bulk.deselect_all"
            >
              {t('requests.bulk.deselect_all')}
            </Button>
            <Button
              variant="secondary"
              onClick={props.onClear}
              disabled={props.selectedRowsLength === 0}
              testId="admin.requests.bulk.clear"
            >
              {t('common.clear')}
            </Button>
            <Button
              variant={requestActionVariant(props.action)}
              onClick={props.onApply}
              loading={props.submitting}
              disabled={props.selectedRowsLength === 0 || missingReason}
              testId="admin.requests.bulk.apply"
            >
              {t('requests.bulk.apply')}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
