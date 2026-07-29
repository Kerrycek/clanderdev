import React, { type MutableRefObject } from 'react';
import { CircleHelp, SlidersHorizontal } from 'lucide-react';

import { FilterBar } from '../../../components/layout/FilterBar';
import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import { CopyButton } from '../../../components/ui/CopyButton';
import { Drawer } from '../../../components/ui/Drawer';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { SmartFilterInput, type SmartFilterSuggestion } from '../../../components/ui/SmartFilterInput';
import { SmartInputHelp } from '../../../components/ui/SmartInputHelp';
import { UserLookupInput } from '../../../components/ui/UserLookupInput';

import { CHAIN_STATES, type ChainState, type TransactionChainsTranslator } from './transactionChainSemantics';

interface TransactionChainsFiltersProps {
  t: TransactionChainsTranslator;
  mode: 'app' | 'admin';
  smartInputRef: MutableRefObject<HTMLInputElement | null>;
  smart: string;
  smartErrorsCount: number;
  onSmartChange: (value: string) => void;
  onSmartSubmit: () => void;
  smartSuggestions: SmartFilterSuggestion[];
  activeFilterChips: React.ReactNode[];
  queryId?: number;
  filtersActive: boolean;
  helpOpen: boolean;
  onHelpOpen: () => void;
  onHelpClose: () => void;
  advancedOpen: boolean;
  onAdvancedOpen: () => void;
  onAdvancedClose: () => void;
  clearFilters: () => void;
  query: string;
  setQuery: (value: string) => void;
  state: ChainState | '';
  setState: (value: ChainState | '') => void;
  errorsOnly: boolean;
  setErrorsOnly: (value: boolean) => void;
  className: string;
  setClassName: (value: string) => void;
  rowId: string;
  setRowId: (value: string) => void;
  userId: string;
  setUserId: (value: string) => void;
  userSessionId: string;
  setUserSessionId: (value: string) => void;
}

export function TransactionChainsFilters({
  t,
  mode,
  smartInputRef,
  smart,
  smartErrorsCount,
  onSmartChange,
  onSmartSubmit,
  smartSuggestions,
  activeFilterChips,
  queryId,
  filtersActive,
  helpOpen,
  onHelpOpen,
  onHelpClose,
  advancedOpen,
  onAdvancedOpen,
  onAdvancedClose,
  clearFilters,
  query,
  setQuery,
  state,
  setState,
  errorsOnly,
  setErrorsOnly,
  className,
  setClassName,
  rowId,
  setRowId,
  userId,
  setUserId,
  userSessionId,
  setUserSessionId,
}: TransactionChainsFiltersProps) {
  return (
    <>
      <FilterBar testId="transactions.list.filters">
        <div className="w-full sm:max-w-xl">
          <SmartFilterInput
            ref={smartInputRef}
            value={smart}
            onChange={onSmartChange}
            onSubmit={onSmartSubmit}
            placeholder={t('transactions.chains.search.placeholder')}
            suggestions={smartSuggestions}
            testId="transactions.chains.smart_filter.input"
            suffix={
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
                title={t('filters.help.open')}
                onClick={onHelpOpen}
                data-testid="transactions.chains.smart_filter.help"
              >
                <CircleHelp className="h-4 w-4" />
              </button>
            }
          />
          {activeFilterChips.length > 0 ? <div className="mt-2 flex flex-wrap gap-2">{activeFilterChips}</div> : null}
          {queryId ? <div className="mt-1 text-xs text-muted">{t('transactions.search.id_lookup')}</div> : null}
        </div>

        <Button
          variant="secondary"
          onClick={onAdvancedOpen}
          title={t('filters.advanced.open')}
          testId="transactions.chains.advanced.open"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="ml-2 hidden sm:inline">{t('filters.advanced.label')}</span>
        </Button>

        <CopyButton text={typeof window !== 'undefined' ? window.location.href : ''} label={t('common.copy_link')} testId="transactions.chains.copy_link" />

        {filtersActive || smartErrorsCount > 0 ? (
          <Button variant="secondary" onClick={clearFilters} testId="transactions.chains.clear_filters">
            {t('common.clear_filters')}
          </Button>
        ) : null}
      </FilterBar>

      <SmartInputHelp
        open={helpOpen}
        onClose={onHelpClose}
        title={t('transactions.chains.smart_help.title')}
        intro={t('transactions.chains.smart_help.intro')}
        examples={
          mode === 'admin'
            ? [
                { example: '?', description: t('filters.help.open') },
                { example: '123', description: t('transactions.chains.smart_help.item.open_chain') },
                { example: 'backup', description: t('transactions.chains.smart_help.item.label') },
                { example: 'state:failed', description: t('transactions.chains.smart_help.item.state') },
                { example: 'errors', description: t('transactions.chains.smart_help.item.errors') },
                { example: 'Vps:123', description: t('transactions.chains.smart_help.item.concern') },
                { example: 'user:alice', description: t('transactions.chains.smart_help.item.user') },
                { example: 'session:456', description: t('transactions.chains.smart_help.item.session') },
              ]
            : [
                { example: '?', description: t('filters.help.open') },
                { example: '123', description: t('transactions.chains.smart_help.item.open_chain') },
                { example: 'backup', description: t('transactions.chains.smart_help.item.label') },
                { example: 'state:failed', description: t('transactions.chains.smart_help.item.state') },
                { example: 'errors', description: t('transactions.chains.smart_help.item.errors') },
                { example: 'Vps:123', description: t('transactions.chains.smart_help.item.concern') },
              ]
        }
        topKeys={[
          {
            key: 'state',
            description: t('transactions.chains.smart_help.item.state'),
            example: 'state:failed',
          },
          {
            key: 'errors',
            description: t('transactions.chains.smart_help.item.errors'),
            example: 'errors',
          },
          {
            key: 'id',
            description: t('transactions.chains.smart_help.item.open_chain'),
            example: 'id:123',
          },
          {
            key: 'q',
            description: t('transactions.chains.smart_help.item.label'),
            example: 'q:backup',
          },
          {
            key: 'Vps',
            description: t('transactions.chains.smart_help.item.concern'),
            example: 'Vps:123',
          },
        ]}
        moreKeys={
          mode === 'admin'
            ? [
                { key: 'user', description: t('transactions.chains.smart_help.item.user'), example: 'user:alice' },
                { key: 'session', description: t('transactions.chains.smart_help.item.session'), example: 'session:456' },
              ]
            : undefined
        }
        onInsertKey={(key) => {
          onHelpClose();
          onSmartChange(`${key}:`);
          window.requestAnimationFrame(() => smartInputRef.current?.focus());
        }}
        actions={[
          {
            label: t('filters.help.open_advanced'),
            onClick: () => {
              onHelpClose();
              onAdvancedOpen();
            },
          },
        ]}
        testId="transactions.chains.smart_help"
        keyRowTestIdPrefix="transactions.chains.smart_help.key"
      />

      <Drawer open={advancedOpen} onClose={onAdvancedClose} title={t('filters.advanced.title')} width="lg" testId="transactions.chains.advanced.drawer">
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium">{t('transactions.chains.advanced.label')}</div>
            <div className="mt-2">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('transactions.chains.search.placeholder')} testId="transactions.chains.advanced.q" />
            </div>
          </div>

          <div>
            <div className="text-sm font-medium">{t('transactions.chains.advanced.state')}</div>
            <div className="mt-2">
              <Select
                value={state}
                onChange={(e) => {
                  const value = e.target.value as ChainState | '';
                  setState(value);
                  if (value) setErrorsOnly(false);
                }}
                disabled={errorsOnly}
                className="w-full"
                testId="transactions.chains.advanced.state"
              >
                <option value="">{t('transactions.chains.filter.state.all')}</option>
                {CHAIN_STATES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
              {errorsOnly ? <div className="mt-1 text-xs text-danger">{t('transactions.chains.filter.state.disabled_hint')}</div> : null}
            </div>
          </div>

          <Checkbox
            checked={errorsOnly}
            onChange={(checked) => {
              setErrorsOnly(checked);
              if (checked) setState('');
            }}
            label={t('transactions.chains.filter.errors_only.chip')}
            description={t('transactions.chains.filter.errors_only.title')}
            testId="transactions.chains.advanced.errors"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-sm font-medium">{t('transactions.chains.advanced.concern_class')}</div>
              <div className="mt-2">
                <Input
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder={t('transactions.chains.filter.concern_class.placeholder')}
                  testId="transactions.chains.advanced.class"
                />
              </div>
            </div>
            <div>
              <div className="text-sm font-medium">{t('transactions.chains.advanced.concern_id')}</div>
              <div className="mt-2">
                <Input
                  value={rowId}
                  onChange={(e) => setRowId(e.target.value)}
                  placeholder={t('transactions.chains.filter.concern_id.placeholder')}
                  type="number"
                  testId="transactions.chains.advanced.row_id"
                />
              </div>
            </div>
          </div>

          {mode === 'admin' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-sm font-medium">{t('transactions.chains.advanced.user')}</div>
                <div className="mt-2">
                  <UserLookupInput
                    value={userId}
                    onChange={setUserId}
                    placeholder={t('transactions.chains.filter.user_id.placeholder')}
                    testId="transactions.chains.advanced.user"
                  />
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">{t('transactions.chains.advanced.session')}</div>
                <div className="mt-2">
                  <Input
                    value={userSessionId}
                    onChange={(e) => setUserSessionId(e.target.value)}
                    placeholder={t('transactions.chains.filter.user_session_id.placeholder')}
                    type="number"
                    testId="transactions.chains.advanced.session"
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="secondary" onClick={clearFilters}>
              {t('common.clear_filters')}
            </Button>
            <Button variant="primary" onClick={onAdvancedClose}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      </Drawer>
    </>
  );
}
