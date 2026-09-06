import React, { useMemo } from 'react';
import { CircleHelp, SlidersHorizontal } from 'lucide-react';

import { useI18n } from '../../../app/i18n';
import { useToasts } from '../../../app/toasts';
import {
  requestStateBadgeVariant,
  requestStateLabelKey,
  requestTypeLabelKey,
} from '../../../lib/requestsBadges';
import { tableVariantFromBadgeVariant } from '../../../lib/variantMap';

import { FilterBar } from '../../../components/layout/FilterBar';
import { Button } from '../../../components/ui/Button';
import { CopyButton } from '../../../components/ui/CopyButton';
import { FilterChip } from '../../../components/ui/FilterChip';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { SmartFilterInput, type SmartFilterSuggestion } from '../../../components/ui/SmartFilterInput';
import { SmartInputHelp } from '../../../components/ui/SmartInputHelp';
import { UserLookupInput } from '../../../components/ui/UserLookupInput';
import type { ToneVariant } from '../../../components/ui/tone';

import {
  ALL_ADMIN_REQUEST_STATES,
  DEFAULT_ADMIN_REQUEST_STATE,
  defaultStateOptions,
  safeNumber,
  type RequestTypeFilter,
} from './RequestsModel';

export function RequestsFilters(props: {
  isAdmin: boolean;
  type: RequestTypeFilter;
  state: string;
  qText: string;
  userId: string;
  adminId: string;
  apiIp: string;
  clientIp: string;
  clientPtr: string;
  smart: string;
  smartNeedle: string;
  smartErrors: string[];
  smartSuggestions: SmartFilterSuggestion[];
  helpOpen: boolean;
  advancedOpen: boolean;
  filtersActive: boolean;
  shareUrl: string;
  rowsLength: number;
  allVisibleExpanded: boolean;
  smartInputRef: React.RefObject<HTMLInputElement | null>;
  setType: (value: RequestTypeFilter) => void;
  setState: (value: string) => void;
  setQText: (value: string) => void;
  setUserId: (value: string) => void;
  setAdminId: (value: string) => void;
  setApiIp: (value: string) => void;
  setClientIp: (value: string) => void;
  setClientPtr: (value: string) => void;
  setSmart: (value: string) => void;
  setSmartErrors: (value: string[]) => void;
  setHelpOpen: (value: boolean) => void;
  setAdvancedOpen: (value: boolean) => void;
  applySmartText: (value: string) => void | Promise<void>;
  clearFilters: () => void;
  expandAllVisible: () => void;
  collapseAllVisible: () => void;
}) {
  const { t } = useI18n();
  const toasts = useToasts();

  const stateTrim = props.state.trim() || undefined;
  const qTrim = props.qText.trim() || undefined;
  const userIdNum = safeNumber(props.userId);
  const adminIdNum = safeNumber(props.adminId);

  const activeFilterChips = useMemo(() => {
    const chips: React.ReactNode[] = [];

    if (props.type && props.type !== 'all') {
      chips.push(
        <FilterChip
          key="type"
          label={`type:${t(requestTypeLabelKey(props.type))}`}
          onRemove={() => props.setType('all')}
          testId="admin.requests.chip.type"
        />
      );
    }

    if (stateTrim && stateTrim !== DEFAULT_ADMIN_REQUEST_STATE) {
      const tone = stateTrim === ALL_ADMIN_REQUEST_STATES
        ? 'neutral'
        : (tableVariantFromBadgeVariant(requestStateBadgeVariant(stateTrim)) ?? 'neutral') as ToneVariant;
      chips.push(
        <FilterChip
          key="state"
          label={`state:${stateTrim === ALL_ADMIN_REQUEST_STATES ? t('requests.list.filter.state.all') : t(requestStateLabelKey(stateTrim))}`}
          tone={tone}
          onRemove={() => props.setState(DEFAULT_ADMIN_REQUEST_STATE)}
          testId="admin.requests.chip.state"
        />
      );
    }

    if (qTrim) {
      chips.push(<FilterChip key="q" label={`q:${qTrim}`} onRemove={() => props.setQText('')} testId="admin.requests.chip.q" />);
    }

    if (props.isAdmin && userIdNum !== undefined) {
      chips.push(
        <FilterChip
          key="user"
          label={`user:#${userIdNum}`}
          onRemove={() => props.setUserId('')}
          testId="admin.requests.chip.user"
        />
      );
    }

    if (props.isAdmin && adminIdNum !== undefined) {
      chips.push(
        <FilterChip
          key="admin"
          label={`admin:#${adminIdNum}`}
          onRemove={() => props.setAdminId('')}
          testId="admin.requests.chip.admin"
        />
      );
    }

    if (props.apiIp.trim()) {
      chips.push(
        <FilterChip
          key="api_ip"
          label={`api_ip:${props.apiIp.trim()}`}
          onRemove={() => props.setApiIp('')}
          testId="admin.requests.chip.api_ip"
        />
      );
    }

    if (props.clientIp.trim()) {
      chips.push(
        <FilterChip
          key="client_ip"
          label={`client_ip:${props.clientIp.trim()}`}
          onRemove={() => props.setClientIp('')}
          testId="admin.requests.chip.client_ip"
        />
      );
    }

    if (props.clientPtr.trim()) {
      chips.push(
        <FilterChip
          key="client_ptr"
          label={`client_ptr:${props.clientPtr.trim()}`}
          onRemove={() => props.setClientPtr('')}
          testId="admin.requests.chip.client_ptr"
        />
      );
    }

    props.smartErrors.forEach((error, index) => {
      chips.push(
        <FilterChip
          key={`err.${index}`}
          label={error}
          tone="danger"
          onRemove={() => props.setSmartErrors([])}
          testId={`admin.requests.chip.error.${index}`}
        />
      );
    });

    return chips;
  }, [
    adminIdNum,
    props,
    qTrim,
    stateTrim,
    t,
    userIdNum,
  ]);

  const helpExamples = props.isAdmin
    ? [
        { example: '?', description: t('requests.list.smart_help.examples.help') },
        { example: '123', description: t('requests.list.smart_help.examples.open_id') },
        { example: 'alice', description: t('requests.list.smart_help.examples.search') },
        { example: 'state:awaiting', description: t('requests.list.smart_help.examples.state') },
        { example: 'type:registration', description: t('requests.list.smart_help.examples.type') },
        { example: 'user:alice', description: t('requests.list.smart_help.examples.user') },
      ]
    : [
        { example: '?', description: t('requests.list.smart_help.examples.help') },
        { example: '123', description: t('requests.list.smart_help.examples.open_id') },
        { example: 'address change', description: t('requests.list.smart_help.examples.search') },
        { example: 'state:awaiting', description: t('requests.list.smart_help.examples.state') },
        { example: 'type:change', description: t('requests.list.smart_help.examples.type') },
      ];

  const helpTopKeys = props.isAdmin
    ? [
        { key: 'q', description: t('requests.list.smart_help.keys.q'), example: 'q:alice' },
        { key: 'state', description: t('requests.list.smart_help.keys.state'), example: 'state:awaiting' },
        { key: 'type', description: t('requests.list.smart_help.keys.type'), example: 'type:change' },
        { key: 'user', description: t('requests.list.smart_help.keys.user'), example: 'user:alice' },
        { key: 'admin', description: t('requests.list.smart_help.keys.admin'), example: 'admin:root' },
      ]
    : [
        { key: 'q', description: t('requests.list.smart_help.keys.q'), example: 'q:address change' },
        { key: 'state', description: t('requests.list.smart_help.keys.state'), example: 'state:awaiting' },
        { key: 'type', description: t('requests.list.smart_help.keys.type'), example: 'type:change' },
      ];

  const helpMoreKeys = [
    { key: 'api_ip', description: t('requests.list.smart_help.keys.api_ip'), example: 'api_ip:203.0.113.10' },
    { key: 'client_ip', description: t('requests.list.smart_help.keys.client_ip'), example: 'client_ip:198.51.100.20' },
    { key: 'client_ptr', description: t('requests.list.smart_help.keys.client_ptr'), example: 'client_ptr:example.net' },
    { key: 'id', description: t('requests.list.smart_help.keys.id'), example: 'id:123' },
  ];

  return (
    <>
      <div className="relative">
        <FilterBar testId="admin.requests.filters">
          <div className="w-full sm:max-w-xl">
            <SmartFilterInput
              ref={props.smartInputRef}
              value={props.smart}
              onChange={(value) => {
                props.setSmart(value);
                if (props.smartErrors.length) props.setSmartErrors([]);
              }}
              placeholder={t('requests.list.search.placeholder')}
              ariaLabel={t('requests.list.search.placeholder')}
              testId="admin.requests.smart_filter.input"
              suggestions={props.smartSuggestions}
              onSubmit={() => void props.applySmartText(props.smart)}
              suffix={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 px-0"
                  onClick={() => props.setHelpOpen(true)}
                  aria-label={t('filters.help.open')}
                  title={t('filters.help.open')}
                >
                  <CircleHelp className="h-4 w-4" aria-hidden />
                </Button>
              }
            />

            {activeFilterChips.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1" data-testid="admin.requests.active_filters">
                {activeFilterChips}
              </div>
            ) : null}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => props.setAdvancedOpen(true)}
            aria-label={t('filters.advanced.open')}
            title={t('filters.advanced.open')}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            <span className="ml-2 hidden sm:inline">{t('filters.advanced.label')}</span>
          </Button>

          <Button
            variant={props.state === 'awaiting' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => props.setState(DEFAULT_ADMIN_REQUEST_STATE)}
            aria-pressed={props.state === DEFAULT_ADMIN_REQUEST_STATE}
            testId="admin.requests.quick.awaiting"
          >
            {t(requestStateLabelKey('awaiting'))}
          </Button>

          <Button
            variant={props.state === 'pending_correction' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => props.setState(props.state === 'pending_correction' ? DEFAULT_ADMIN_REQUEST_STATE : 'pending_correction')}
            aria-pressed={props.state === 'pending_correction'}
            testId="admin.requests.quick.pending_correction"
          >
            {t(requestStateLabelKey('pending_correction'))}
          </Button>

          <CopyButton
            size="sm"
            variant="secondary"
            label={t('common.copy_link')}
            text={props.shareUrl}
            testId="admin.requests.copy_link"
          />

          <Button
            variant="secondary"
            size="sm"
            onClick={props.allVisibleExpanded ? props.collapseAllVisible : props.expandAllVisible}
            disabled={props.rowsLength === 0}
            testId={props.allVisibleExpanded ? 'admin.requests.collapse_all' : 'admin.requests.expand_all'}
          >
            {props.allVisibleExpanded ? t('requests.list.collapse_all') : t('requests.list.expand_all')}
          </Button>

          {props.filtersActive ? (
            <Button variant="secondary" size="sm" onClick={props.clearFilters}>
              {t('common.clear_filters')}
            </Button>
          ) : null}
        </FilterBar>

        {props.advancedOpen ? (
          <div
            className="absolute left-0 top-full z-40 mt-2 w-drawer-xl rounded-lg border border-border bg-surface p-4 shadow-xl"
            data-testid="admin.requests.advanced_filters"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <div className="text-sm font-semibold">{t('filters.advanced.title')}</div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 px-0"
                onClick={() => props.setAdvancedOpen(false)}
                aria-label={t('common.close')}
              >
                ×
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm font-medium">{t('requests.list.filter.type.label')}</div>
                <div className="mt-1">
                  <Select
                    value={props.type}
                    onChange={(event) => props.setType((event.target.value as RequestTypeFilter) || 'all')}
                    aria-label={t('requests.list.filter.type.aria')}
                  >
                    <option value="all">{t('requests.list.filter.type.all')}</option>
                    <option value="registration">{t('requests.type.registration')}</option>
                    <option value="change">{t('requests.type.change')}</option>
                  </Select>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('requests.list.filter.state.label')}</div>
                <div className="mt-1">
                  <Select value={props.state} onChange={(event) => props.setState(event.target.value)} aria-label={t('requests.list.filter.state.aria')}>
                    {defaultStateOptions()
                      .filter((value) => value)
                      .map((value) => (
                        <option key={value} value={value}>
                          {value === DEFAULT_ADMIN_REQUEST_STATE
                            ? t('requests.list.filter.state.open')
                            : t(requestStateLabelKey(value))}
                        </option>
                      ))}
                    <option value={ALL_ADMIN_REQUEST_STATES}>{t('requests.list.filter.state.all')}</option>
                  </Select>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('requests.list.filter.user.label')}</div>
                <div className="mt-1">
                  <UserLookupInput
                    value={props.userId}
                    onChange={props.setUserId}
                    placeholder={t('requests.list.filter.user.placeholder')}
                    testId="admin.requests.filter.user.lookup"
                    loadingLabel={t('common.loading')}
                    noResultsLabel={t('palette.empty.no_results')}
                  />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('requests.list.filter.admin.label')}</div>
                <div className="mt-1">
                  <UserLookupInput
                    value={props.adminId}
                    onChange={props.setAdminId}
                    placeholder={t('requests.list.filter.admin.placeholder')}
                    testId="admin.requests.filter.admin.lookup"
                    loadingLabel={t('common.loading')}
                    noResultsLabel={t('palette.empty.no_results')}
                  />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('requests.list.filter.api_ip.label')}</div>
                <div className="mt-1">
                  <Input
                    value={props.apiIp}
                    onChange={(event) => props.setApiIp(event.target.value)}
                    placeholder={t('requests.list.filter.api_ip.placeholder')}
                    testId="admin.requests.filter.api_ip"
                  />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('requests.list.filter.client_ip.label')}</div>
                <div className="mt-1">
                  <Input
                    value={props.clientIp}
                    onChange={(event) => props.setClientIp(event.target.value)}
                    placeholder={t('requests.list.filter.client_ip.placeholder')}
                    testId="admin.requests.filter.client_ip"
                  />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('requests.list.filter.client_ptr.label')}</div>
                <div className="mt-1">
                  <Input
                    value={props.clientPtr}
                    onChange={(event) => props.setClientPtr(event.target.value)}
                    placeholder={t('requests.list.filter.client_ptr.placeholder')}
                    testId="admin.requests.filter.client_ptr"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
              {props.filtersActive ? (
                <Button variant="secondary" size="sm" onClick={props.clearFilters}>
                  {t('common.clear_filters')}
                </Button>
              ) : null}
              <Button variant="primary" size="sm" onClick={() => props.setAdvancedOpen(false)}>
                {t('common.done')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <SmartInputHelp
        open={props.helpOpen}
        onClose={() => {
          props.setHelpOpen(false);
          if (props.smartNeedle === '?') props.setSmart('');
        }}
        title={t('filters.help.title')}
        intro={t('requests.list.smart_help.intro')}
        examples={helpExamples}
        topKeys={helpTopKeys}
        moreKeys={helpMoreKeys}
        inference={[
          t('requests.list.smart_help.inference.enter_applies'),
          t('requests.list.smart_help.inference.number_opens'),
          t('requests.list.smart_help.inference.key_value'),
        ]}
        onInsertKey={(key) => {
          props.setHelpOpen(false);
          props.setSmart(`${key}:`);
          window.requestAnimationFrame(() => props.smartInputRef.current?.focus());
        }}
        actions={[
          {
            label: t('filters.help.open_advanced'),
            onClick: () => {
              props.setHelpOpen(false);
              props.setAdvancedOpen(true);
            },
          },
          {
            label: t('common.copy_link'),
            onClick: async () => {
              const url = typeof window !== 'undefined' ? window.location.href : '';
              if (!url) return;
              try {
                await navigator.clipboard.writeText(url);
                toasts.pushToast({ variant: 'ok', title: t('toast.copied.title') });
              } catch {
                toasts.pushToast({ variant: 'warn', title: t('toast.copied_failed.title') });
              }
            },
          },
        ]}
        testId="admin.requests.smart_filter.help"
        keyRowTestIdPrefix="admin.requests.smart_filter.help.key"
      />
    </>
  );
}
