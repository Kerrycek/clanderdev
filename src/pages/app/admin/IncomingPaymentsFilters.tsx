import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useI18n } from '../../../app/i18n';
import { FilterBar } from '../../../components/layout/FilterBar';
import { Button } from '../../../components/ui/Button';
import { CopyButton } from '../../../components/ui/CopyButton';
import { FilterChip } from '../../../components/ui/FilterChip';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { incomingPaymentBadgeVariant, incomingPaymentStateLabelKey } from '../../../lib/paymentsBadges';
import { tableVariantFromBadgeVariant } from '../../../lib/variantMap';
import { incomingPaymentStateFilterOptions, parsePositiveIntInput } from './IncomingPaymentsModel';

type SearchParamSetter = (
  nextInit: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams),
  navigateOptions?: { replace?: boolean; state?: unknown }
) => void;

/**
 * The incoming-payment index supports an exact state filter only. Keep the
 * controls honest and offer exact open-by-ID separately instead of sending
 * unsupported q/user parameters which the API silently ignores.
 */
export function IncomingPaymentsFilters(props: {
  basePath: string;
  state: string;
  setSearchParams: SearchParamSetter;
  onRefresh: () => void;
  shareUrl: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [paymentId, setPaymentId] = useState('');
  const parsedPaymentId = useMemo(() => parsePositiveIntInput(paymentId.replace(/^\s*#/, '')), [paymentId]);

  const setStateInUrl = (nextState: string) => {
    const normalized = String(nextState ?? '').trim().toLowerCase();
    props.setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (normalized && incomingPaymentStateFilterOptions().includes(normalized)) next.set('state', normalized);
      else next.delete('state');
      return next;
    });
  };

  const openPayment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (parsedPaymentId === undefined) return;
    navigate(`${props.basePath}/payments/incoming/${parsedPaymentId}`);
  };

  const stateLabel = props.state ? t(incomingPaymentStateLabelKey(props.state)) : '';
  const stateTone = props.state
    ? tableVariantFromBadgeVariant(incomingPaymentBadgeVariant(props.state)) ?? 'neutral'
    : 'neutral';

  return (
    <div className="space-y-2">
      <FilterBar>
        <form className="flex w-full gap-2 sm:max-w-sm" onSubmit={openPayment}>
          <Input
            value={paymentId}
            onChange={(event) => setPaymentId(event.target.value)}
            placeholder={t('payments.incoming.list.open_id.placeholder')}
            ariaLabel={t('payments.incoming.list.open_id.aria')}
            inputMode="numeric"
            testId="admin.payments.incoming.open_id.input"
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={parsedPaymentId === undefined}
            testId="admin.payments.incoming.open_id.submit"
          >
            {t('common.open')}
          </Button>
        </form>

        <Select
          value={props.state}
          onChange={(event) => setStateInUrl(event.target.value)}
          aria-label={t('payments.incoming.list.filter.state.aria')}
          className="w-44"
          testId="admin.payments.incoming.filter.state"
        >
          <option value="">{t('common.all')}</option>
          {incomingPaymentStateFilterOptions()
            .filter(Boolean)
            .map((state) => (
              <option key={state} value={state}>
                {t(incomingPaymentStateLabelKey(state))}
              </option>
            ))}
        </Select>

        <Button type="button" variant="secondary" size="sm" onClick={props.onRefresh} testId="admin.payments.incoming.filters.refresh">
          {t('common.refresh')}
        </Button>
        <CopyButton
          text={props.shareUrl}
          label={t('common.copy_link')}
          size="sm"
          variant="secondary"
          testId="admin.payments.incoming.filters.copy_link"
        />
      </FilterBar>

      {props.state ? (
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label={`${t('common.state')}: ${stateLabel}`}
            tone={stateTone}
            onRemove={() => setStateInUrl('')}
            testId="admin.payments.incoming.chip.state"
          />
        </div>
      ) : null}
    </div>
  );
}
