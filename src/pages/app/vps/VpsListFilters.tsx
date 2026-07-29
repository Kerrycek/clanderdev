import React from 'react';
import { CircleHelp, SlidersHorizontal } from 'lucide-react';

import { FilterBar } from '../../../components/layout/FilterBar';
import { Button } from '../../../components/ui/Button';
import { CopyButton } from '../../../components/ui/CopyButton';
import { Drawer } from '../../../components/ui/Drawer';
import { Input } from '../../../components/ui/Input';
import { NodeLookupInput } from '../../../components/ui/NodeLookupInput';
import { Select } from '../../../components/ui/Select';
import { SmartFilterInput, type SmartFilterSuggestion } from '../../../components/ui/SmartFilterInput';
import { SmartInputHelp } from '../../../components/ui/SmartInputHelp';
import { UserLookupInput } from '../../../components/ui/UserLookupInput';

import type { VpsListStateFilter, VpsListTranslator } from './vpsListSemantics';

export interface VpsListFiltersProps {
  mode: 'app' | 'admin';
  t: VpsListTranslator;
  smart: string;
  smartNeedle: string;
  smartErrors: string[];
  setSmart: (value: string) => void;
  setSmartErrors: (errors: string[]) => void;
  smartSuggestions: SmartFilterSuggestion[];
  applySmartText: (value: string) => void | Promise<void>;
  activeFilterChips: React.ReactNode[];
  filtersActive: boolean;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  advancedOpen: boolean;
  setAdvancedOpen: (open: boolean) => void;
  smartInputRef: React.RefObject<HTMLInputElement | null>;
  clearFilters: () => void;
  nodeId: string;
  setNodeId: (value: string) => void;
  userId: string;
  setUserId: (value: string) => void;
  userNamespaceMapId: string;
  setUserNamespaceMapId: (value: string) => void;
  locationId: string;
  setLocationId: (value: string) => void;
  stateFilter: VpsListStateFilter;
  setStateFilter: (value: VpsListStateFilter) => void;
  onCopyLink: () => void;
}

export function VpsListFilters(props: VpsListFiltersProps) {
  return (
    <>
      <FilterBar testId="vps.list.filters">
        <div className="w-full sm:max-w-xl">
          <SmartFilterInput
            ref={props.smartInputRef}
            value={props.smart}
            onChange={(v) => {
              props.setSmart(v);
              if (props.smartErrors.length) props.setSmartErrors([]);
            }}
            placeholder={props.t('vps.list.search.placeholder')}
            ariaLabel={props.t('vps.list.search.placeholder')}
            testId="vps.smart_filter.input"
            suggestions={props.smartSuggestions}
            onSubmit={() => void props.applySmartText(props.smart)}
            suffix={
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 px-0"
                onClick={() => props.setHelpOpen(true)}
                aria-label={props.t('filters.help.open')}
                title={props.t('filters.help.open')}
              >
                <CircleHelp className="h-4 w-4" aria-hidden />
              </Button>
            }
          />

          {props.activeFilterChips.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1" data-testid="vps.list.active_filters">
              {props.activeFilterChips}
            </div>
          ) : null}
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => props.setAdvancedOpen(true)}
          aria-label={props.t('filters.advanced.open')}
          title={props.t('filters.advanced.open')}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          <span className="ml-2 hidden sm:inline">{props.t('filters.advanced.label')}</span>
        </Button>

        <CopyButton
          size="sm"
          variant="secondary"
          label={props.t('common.copy_link')}
          text={typeof window !== 'undefined' ? window.location.href : ''}
          testId="vps.list.copy_link"
        />

        {props.filtersActive ? (
          <Button variant="secondary" size="sm" onClick={props.clearFilters}>
            {props.t('common.clear_filters')}
          </Button>
        ) : null}
      </FilterBar>

      <SmartInputHelp
        open={props.helpOpen}
        onClose={() => {
          props.setHelpOpen(false);
          if (props.smartNeedle === '?') props.setSmart('');
        }}
        title={props.t('filters.help.title')}
        intro={props.t('vps.list.smart_help.intro')}
        examples={[
          {
            example: '?',
            description: props.t('vps.list.smart_help.examples.help'),
          },
          {
            example: '123',
            description: props.t('vps.list.smart_help.examples.open_id'),
          },
          {
            example: 'db-01',
            description: props.t('vps.list.smart_help.examples.hostname'),
          },
          {
            example: 'state:running',
            description: props.t('vps.list.smart_help.examples.state'),
          },
          {
            example: 'user:alice',
            description: props.t('vps.list.smart_help.examples.user'),
          },
          {
            example: 'node:node15',
            description: props.t('vps.list.smart_help.examples.node'),
          },
        ]}
        topKeys={[
          {
            key: 'hostname',
            description: props.t('vps.list.smart_help.keys.hostname'),
            example: 'hostname:db-01',
          },
          {
            key: 'ip',
            description: props.t('vps.list.smart_help.keys.ip'),
            example: 'ip:198.51.100.10',
          },
          {
            key: 'state',
            description: props.t('vps.list.smart_help.keys.state'),
            example: 'state:busy',
          },
          {
            key: 'node',
            description: props.t('vps.list.smart_help.keys.node'),
            example: 'node:15',
          },
          {
            key: 'location',
            description: props.t('vps.list.smart_help.keys.location'),
            example: 'location:1',
          },
          {
            key: 'user',
            description: props.t('vps.list.smart_help.keys.user'),
            example: 'user:alice',
          },
          {
            key: 'map',
            description: props.t('vps.list.smart_help.keys.map'),
            example: 'map:42',
          },
          {
            key: 'id',
            description: props.t('vps.list.smart_help.keys.id'),
            example: 'id:123',
          },
        ]}
        inference={[
          props.t('vps.list.smart_help.inference.enter_applies'),
          props.t('vps.list.smart_help.inference.number_opens'),
          props.t('vps.list.smart_help.inference.key_value'),
        ]}
        onInsertKey={(key) => {
          props.setHelpOpen(false);
          props.setSmart(`${key}:`);
          window.requestAnimationFrame(() => props.smartInputRef.current?.focus());
        }}
        actions={[
          {
            label: props.t('filters.help.open_advanced'),
            onClick: () => {
              props.setHelpOpen(false);
              props.setAdvancedOpen(true);
            },
          },
          {
            label: props.t('common.copy_link'),
            onClick: props.onCopyLink,
          },
        ]}
        testId="vps.smart_filter.help"
        keyRowTestIdPrefix="vps.smart_filter.help.key"
      />

      <Drawer
        open={props.advancedOpen}
        onClose={() => props.setAdvancedOpen(false)}
        title={props.t('filters.advanced.title')}
        width="lg"
        testId="vps.list.advanced_filters"
        footer={
          <div className="flex items-center justify-end gap-2">
            {props.filtersActive ? (
              <Button variant="secondary" size="sm" onClick={props.clearFilters}>
                {props.t('common.clear_filters')}
              </Button>
            ) : null}
            <Button variant="primary" size="sm" onClick={() => props.setAdvancedOpen(false)}>
              {props.t('common.done')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium">{props.t('vps.list.filter.state.label')}</div>
            <div className="mt-1">
              <Select
                value={props.stateFilter}
                onChange={(event) => props.setStateFilter(event.target.value as VpsListStateFilter)}
                ariaLabel={props.t('vps.list.filter.state.label')}
                testId="vps.filter.state.select"
                options={[
                  { value: 'all', label: props.t('vps.list.filter.state.all') },
                  { value: 'running', label: props.t('vps.list.filter.state.running') },
                  { value: 'stopped', label: props.t('vps.list.filter.state.stopped') },
                  { value: 'busy', label: props.t('vps.list.filter.state.busy') },
                  { value: 'failed', label: props.t('vps.list.filter.state.failed') },
                ]}
              />
            </div>
          </div>

          {props.mode === 'admin' ? (
            <div>
              <div className="text-sm font-medium">{props.t('vps.list.filter.node.label')}</div>
              <div className="mt-1">
                <NodeLookupInput
                  value={props.nodeId}
                  onChange={props.setNodeId}
                  placeholder={props.t('vps.list.filter.node.placeholder')}
                  testId="vps.filter.node.lookup"
                  loadingLabel={props.t('common.loading')}
                  noResultsLabel={props.t('palette.empty.no_results')}
                />
              </div>
            </div>
          ) : null}

          {props.mode === 'admin' ? (
            <div>
              <div className="text-sm font-medium">{props.t('vps.list.filter.user.label')}</div>
              <div className="mt-1">
                <UserLookupInput
                  value={props.userId}
                  onChange={props.setUserId}
                  placeholder={props.t('vps.list.filter.user.placeholder')}
                  testId="vps.filter.user.lookup"
                  loadingLabel={props.t('common.loading')}
                  noResultsLabel={props.t('palette.empty.no_results')}
                />
              </div>
            </div>
          ) : null}

          <div>
            <div className="text-sm font-medium">{props.t('vps.list.filter.location.label')}</div>
            <div className="mt-1">
              <Input
                value={props.locationId}
                onChange={(e) => props.setLocationId(e.target.value)}
                placeholder={props.t('vps.list.filter.location.placeholder')}
                testId="vps.filter.location.input"
                ariaLabel={props.t('vps.list.filter.location.placeholder')}
                inputMode="numeric"
              />
            </div>
          </div>

          <div>
            <div className="text-sm font-medium">{props.t('vps.list.filter.user_namespace_map.label')}</div>
            <div className="mt-1">
              <Input
                value={props.userNamespaceMapId}
                onChange={(e) => props.setUserNamespaceMapId(e.target.value)}
                placeholder={props.t('vps.list.filter.user_namespace_map.placeholder')}
                testId="vps.filter.user_namespace_map.input"
                ariaLabel={props.t('vps.list.filter.user_namespace_map.placeholder')}
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
            {props.t('vps.list.smart_help.drawer_hint')}
          </div>
        </div>
      </Drawer>
    </>
  );
}
