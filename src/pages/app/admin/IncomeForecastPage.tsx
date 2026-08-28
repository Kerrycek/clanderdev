import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, RefreshCw, UsersRound } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { estimateIncome } from '../../../lib/api/payments';
import { FilterBar } from '../../../components/layout/FilterBar';
import { ListShell } from '../../../components/layout/ListShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Input } from '../../../components/ui/Input';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../components/ui/LoadingState';
import { Select } from '../../../components/ui/Select';
import { StatCard } from '../../../components/ui/StatCard';
import { TableCard } from '../../../components/ui/TableCard';
import { TimeSeriesChart } from '../../../components/ui/TimeSeriesChart';
import { AdminFinanceTabs } from './AdminFinanceTabs';
import {
  MAX_FORECAST_DURATION,
  buildIncomeForecastPeriods,
  defaultIncomeForecastFilters,
  formatIncomeEstimate,
  formatIncomeForecastPeriod,
  incomeEstimateCohortDifference,
  normalizeIncomeForecastFilters,
} from './IncomeForecastModel';

const FORECAST_PERIOD_COUNT = 6;
const PAGE_SIZES = [3, 6] as const;

function parsePageSize(value: string | null): number {
  return value === '3' ? 3 : 6;
}

function parsePage(value: string | null, pageCount: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(pageCount, parsed));
}

export function IncomeForecastPage() {
  const { basePath } = useAppMode();
  const { lang, t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const locale = lang === 'cs' ? 'cs-CZ' : 'en-US';
  const defaults = useMemo(() => defaultIncomeForecastFilters(), []);

  const filters = useMemo(() => normalizeIncomeForecastFilters({
    year: searchParams.get('year'),
    month: searchParams.get('month'),
    select: searchParams.get('select'),
    duration: searchParams.get('duration'),
  }, defaults), [defaults, searchParams]);

  const [draft, setDraft] = useState(() => ({
    year: String(filters.year),
    month: String(filters.month),
    select: filters.select,
    duration: String(filters.duration),
  }));

  useEffect(() => {
    setDraft({
      year: String(filters.year),
      month: String(filters.month),
      select: filters.select,
      duration: String(filters.duration),
    });
  }, [filters]);

  const draftYear = Number(draft.year);
  const draftDuration = Number(draft.duration);
  const draftValid = Number.isInteger(draftYear)
    && draftYear >= 1970
    && draftYear <= 3_000
    && Number.isInteger(draftDuration)
    && draftDuration >= 1
    && draftDuration <= MAX_FORECAST_DURATION;

  const periods = useMemo(
    () => buildIncomeForecastPeriods(filters, FORECAST_PERIOD_COUNT),
    [filters],
  );

  const forecastQ = useQuery({
    queryKey: ['payment_stats', 'estimate_income', filters],
    queryFn: async ({ signal }) => Promise.all(periods.map(async (period) => {
      const response = await estimateIncome({
        year: period.year,
        month: period.month,
        select: filters.select,
        duration: filters.duration,
      }, { signal });

      return { ...period, ...response.data };
    })),
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const data = forecastQ.data;
  const current = data?.[0];
  const previous = data?.[1];
  const currentCohortDifference = current
    ? incomeEstimateCohortDifference(current.estimated_income, previous?.estimated_income)
    : null;

  const pageSize = parsePageSize(searchParams.get('limit'));
  const pageCount = Math.max(1, Math.ceil((data?.length ?? FORECAST_PERIOD_COUNT) / pageSize));
  const page = parsePage(searchParams.get('page'), pageCount);
  const visibleRows = data?.slice((page - 1) * pageSize, page * pageSize) ?? [];

  const setListParam = (name: 'page' | 'limit', value: number) => {
    setSearchParams((previousParams) => {
      const next = new URLSearchParams(previousParams);
      if (name === 'page' && value <= 1) next.delete('page');
      else if (name === 'limit' && value === 6) next.delete('limit');
      else next.set(name, String(value));
      if (name === 'limit') next.delete('page');
      return next;
    });
  };

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draftValid) return;

    const normalized = normalizeIncomeForecastFilters(draft, filters);
    setSearchParams((previousParams) => {
      const next = new URLSearchParams(previousParams);
      next.set('year', String(normalized.year));
      next.set('month', String(normalized.month));
      next.set('select', normalized.select);
      next.set('duration', String(normalized.duration));
      next.delete('page');
      return next;
    });
  };

  const modeLabel = t(`finance.forecast.mode.${filters.select}`);
  const formatChange = (value: number | null) => value === null
    ? t('finance.forecast.summary.change.unavailable')
    : t('finance.forecast.summary.change.value', {
        value: `${value > 0 ? '+' : ''}${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}`,
      });

  const periodLabels = new Map(periods.map((period) => [
    period.timestamp,
    formatIncomeForecastPeriod(period, locale),
  ]));

  const pagination = (
    <KeysetPagination
      testId="admin.finance.forecast.pagination"
      page={page}
      pageCount={pageCount}
      totalPagesKnown
      canPrev={page > 1}
      canNext={page < pageCount}
      onPrev={() => setListParam('page', page - 1)}
      onNext={() => setListParam('page', page + 1)}
      onGoToPage={(target) => setListParam('page', target)}
      limit={pageSize}
      allowedLimits={PAGE_SIZES}
      onLimitChange={(limit) => setListParam('limit', limit)}
    />
  );

  return (
    <ListShell
      testId="admin.finance.forecast"
      header={(
        <div className="space-y-4">
          <PageHeader
            title={t('finance.forecast.title')}
            description={t('finance.forecast.description')}
            actions={(
              <>
                <Button
                  to={`${basePath}/payments/incoming`}
                  variant="secondary"
                  size="sm"
                  testId="admin.finance.forecast.open_incoming"
                >
                  <CreditCard size={16} aria-hidden="true" />
                  {t('finance.forecast.open_incoming')}
                </Button>
                <Button
                  to={`${basePath}/users`}
                  variant="secondary"
                  size="sm"
                  testId="admin.finance.forecast.open_users"
                >
                  <UsersRound size={16} aria-hidden="true" />
                  {t('finance.forecast.open_users')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={forecastQ.isFetching}
                  onClick={() => void forecastQ.refetch()}
                  testId="admin.finance.forecast.refresh"
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  {t('finance.forecast.refresh')}
                </Button>
              </>
            )}
          />
          <AdminFinanceTabs />
        </div>
      )}
      filters={(
        <Card testId="admin.finance.forecast.filters">
          <CardBody>
            <form onSubmit={applyFilters}>
              <FilterBar>
                <div className="w-full sm:w-32">
                  <Input
                    label={t('finance.forecast.filter.year')}
                    type="number"
                    min={1970}
                    max={3_000}
                    value={draft.year}
                    onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, year: event.target.value }))}
                    testId="admin.finance.forecast.filter.year"
                  />
                </div>
                <div className="w-full sm:w-44">
                  <Select
                    label={t('finance.forecast.filter.month')}
                    value={draft.month}
                    onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, month: event.target.value }))}
                    options={Array.from({ length: 12 }, (_, index) => ({
                      value: String(index + 1),
                      label: t(`finance.forecast.month.${index + 1}`),
                    }))}
                    testId="admin.finance.forecast.filter.month"
                  />
                </div>
                <div className="w-full sm:min-w-64 sm:flex-1">
                  <Select
                    label={t('finance.forecast.filter.mode')}
                    value={draft.select}
                    onChange={(event) => setDraft((currentDraft) => ({
                      ...currentDraft,
                      select: event.target.value === 'all_until' ? 'all_until' : 'exactly_until',
                    }))}
                    options={[
                      { value: 'exactly_until', label: t('finance.forecast.mode.exactly_until') },
                      { value: 'all_until', label: t('finance.forecast.mode.all_until') },
                    ]}
                    testId="admin.finance.forecast.filter.mode"
                  />
                </div>
                <div className="w-full sm:w-48">
                  <Input
                    label={t('finance.forecast.filter.duration')}
                    type="number"
                    min={1}
                    max={MAX_FORECAST_DURATION}
                    value={draft.duration}
                    onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, duration: event.target.value }))}
                    testId="admin.finance.forecast.filter.duration"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!draftValid}
                  testId="admin.finance.forecast.filter.apply"
                >
                  {t('finance.forecast.filter.apply')}
                </Button>
              </FilterBar>
              <div className="mt-3 text-xs text-muted" data-testid="admin.finance.forecast.mode_description">
                {t(`finance.forecast.mode.${draft.select}.description`)}
              </div>
              {!draftValid ? (
                <div className="mt-2 text-xs text-danger" role="alert">
                  {t('finance.forecast.filter.invalid')}
                </div>
              ) : null}
            </form>
          </CardBody>
        </Card>
      )}
    >
      {forecastQ.isLoading ? (
        <LoadingState testId="admin.finance.forecast.loading" />
      ) : forecastQ.isError && !data ? (
        <ErrorState
          error={forecastQ.error}
          onRetry={() => void forecastQ.refetch()}
          showBack={false}
          testId="admin.finance.forecast.error"
        />
      ) : data && current ? (
        <div className="space-y-4">
          {forecastQ.isError ? (
            <Alert
              variant="warn"
              title={t('finance.forecast.stale.title')}
              description={t('finance.forecast.stale.body')}
              testId="admin.finance.forecast.stale"
            />
          ) : forecastQ.isFetching ? (
            <Alert
              variant="info"
              title={t('finance.forecast.refreshing.title')}
              description={t('finance.forecast.refreshing.body')}
              testId="admin.finance.forecast.refreshing"
            />
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title={t('finance.forecast.summary.estimate')}
              subtitle={formatIncomeForecastPeriod(current, locale)}
              value={formatIncomeEstimate(current.estimated_income, locale)}
              testId="admin.finance.forecast.summary.estimate"
            />
            <StatCard
              title={t('finance.forecast.summary.users')}
              subtitle={modeLabel}
              value={new Intl.NumberFormat(locale).format(current.user_count)}
              testId="admin.finance.forecast.summary.users"
            />
            <StatCard
              title={t('finance.forecast.summary.duration')}
              subtitle={modeLabel}
              value={t('finance.forecast.summary.duration.value', { count: filters.duration })}
              testId="admin.finance.forecast.summary.duration"
            />
            <StatCard
              title={t('finance.forecast.summary.change')}
              subtitle={previous ? formatIncomeForecastPeriod(previous, locale) : undefined}
              value={formatChange(currentCohortDifference)}
              testId="admin.finance.forecast.summary.change"
            />
          </div>

          <Alert
            variant="neutral"
            title={t('finance.forecast.unit.title')}
            description={t('finance.forecast.unit.body')}
            testId="admin.finance.forecast.unit_note"
          />

          <Alert
            variant="neutral"
            title={t('finance.forecast.cohort_note.title')}
            description={t('finance.forecast.cohort_note.body')}
            testId="admin.finance.forecast.cohort_note"
          />

          <Card testId="admin.finance.forecast.chart_card">
            <CardHeader
              title={t('finance.forecast.chart.title')}
              subtitle={t('finance.forecast.chart.description')}
              actions={forecastQ.dataUpdatedAt ? (
                <span className="text-xs text-muted">
                  {t('finance.forecast.updated_at', {
                    value: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
                      .format(new Date(forecastQ.dataUpdatedAt)),
                  })}
                </span>
              ) : null}
            />
            <CardBody>
              <TimeSeriesChart
                points={[...data].reverse().map((row) => ({ x: row.timestamp, y: row.estimated_income }))}
                variant="accent"
                ariaLabel={t('finance.forecast.chart.aria')}
                formatValue={(value) => formatIncomeEstimate(value, locale)}
                formatTime={(timestamp) => periodLabels.get(timestamp) ?? String(timestamp)}
                className="min-h-48"
                testId="admin.finance.forecast.chart"
              />
            </CardBody>
          </Card>

          <div>
            <div className="mb-3">
              <h2 className="font-semibold text-fg">{t('finance.forecast.history.title')}</h2>
              <p className="mt-1 text-sm text-muted">{t('finance.forecast.history.description')}</p>
            </div>

            <div className="hidden md:block">
              <TableCard minWidth="md" testId="admin.finance.forecast.table_card" tableTestId="admin.finance.forecast.table">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left">{t('finance.forecast.history.col.period')}</th>
                    <th className="px-4 py-3 text-left">{t('finance.forecast.history.col.mode')}</th>
                    <th className="px-4 py-3 text-right">{t('finance.forecast.history.col.users')}</th>
                    <th className="px-4 py-3 text-right">{t('finance.forecast.history.col.estimate')}</th>
                    <th className="px-4 py-3 text-right">{t('finance.forecast.history.col.change')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const absoluteIndex = data.findIndex((candidate) => candidate.key === row.key);
                    const change = incomeEstimateCohortDifference(row.estimated_income, data[absoluteIndex + 1]?.estimated_income);
                    return (
                      <tr key={row.key} data-testid={`admin.finance.forecast.row.${row.key}`}>
                        <td className="px-4 py-3 font-medium">{formatIncomeForecastPeriod(row, locale)}</td>
                        <td className="px-4 py-3 text-muted">{modeLabel}</td>
                        <td className="px-4 py-3 text-right">{new Intl.NumberFormat(locale).format(row.user_count)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatIncomeEstimate(row.estimated_income, locale)}</td>
                        <td className="px-4 py-3 text-right text-muted">{formatChange(change)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableCard>
            </div>

            <div className="space-y-2 md:hidden">
              {visibleRows.map((row) => {
                const absoluteIndex = data.findIndex((candidate) => candidate.key === row.key);
                const change = incomeEstimateCohortDifference(row.estimated_income, data[absoluteIndex + 1]?.estimated_income);
                return (
                  <TableCard
                    key={row.key}
                    title={formatIncomeForecastPeriod(row, locale)}
                    subtitle={modeLabel}
                    testId={`admin.finance.forecast.mobile.${row.key}`}
                    rows={[
                      { label: t('finance.forecast.history.col.users'), value: new Intl.NumberFormat(locale).format(row.user_count) },
                      { label: t('finance.forecast.history.col.estimate'), value: formatIncomeEstimate(row.estimated_income, locale) },
                      { label: t('finance.forecast.history.col.change'), value: formatChange(change) },
                    ]}
                  />
                );
              })}
            </div>
            <Card className="mt-2">{pagination}</Card>
          </div>
        </div>
      ) : null}
    </ListShell>
  );
}
