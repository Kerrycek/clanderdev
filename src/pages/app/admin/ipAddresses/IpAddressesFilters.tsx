import { CircleHelp, SlidersHorizontal } from 'lucide-react';

import { useI18n } from '../../../../app/i18n';

import { parseBoolParam, parseNonNegativeInt, parsePositiveInt } from '../../../../lib/parse';

import { FilterBar } from '../../../../components/layout/FilterBar';
import { Button } from '../../../../components/ui/Button';
import { CopyButton } from '../../../../components/ui/CopyButton';
import { Drawer } from '../../../../components/ui/Drawer';
import { Input } from '../../../../components/ui/Input';
import { Select } from '../../../../components/ui/Select';
import { SmartFilterInput } from '../../../../components/ui/SmartFilterInput';
import { SmartInputHelp } from '../../../../components/ui/SmartInputHelp';
import { NetworkLookupInput } from '../../../../components/ui/NetworkLookupInput';
import { UserLookupInput } from '../../../../components/ui/UserLookupInput';
import { VpsLookupInput } from '../../../../components/ui/VpsLookupInput';
import type { IpAddressesFiltersProps } from './IpAddressesFilters.types';

export function IpAddressesFilters({
  smart,
  setSmart,
  smartErrors,
  clearSmartErrors,
  smartInputRef,
  smartNeedle,
  helpOpen,
  setHelpOpen,
  advancedOpen,
  setAdvancedOpen,
  activeFilterChips,
  smartSuggestions,
  applySmartText,
  filtersActive,
  shareUrl,
  clearFilters,
  addr,
  prefixNum,
  vpsId,
  userLookup,
  setUserLookup,
  networkId,
  ifaceId,
  locationId,
  environmentLocations,
  versionNum,
  assignedToInterface,
  order,
  setTextParam,
  setIntParam,
  setResolvedUserFilter,
  setBoolParamInUrl,
}: IpAddressesFiltersProps) {
  const { t } = useI18n();

  return (
    <>
      <FilterBar testId="admin.ip_addresses.filters">
        <div className="w-full sm:max-w-xl">
          <SmartFilterInput
            ref={smartInputRef}
            value={smart}
            onChange={(value) => {
              setSmart(value);
              if (smartErrors.length) clearSmartErrors();
            }}
            placeholder={t('admin.ip_addresses.search.placeholder')}
            ariaLabel={t('admin.ip_addresses.search.placeholder')}
            testId="admin.ip_addresses.smart_filter.input"
            suggestions={smartSuggestions}
            onSubmit={() => {
              void applySmartText(smart);
            }}
            suffix={
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 px-0"
                onClick={() => setHelpOpen(true)}
                aria-label={t('filters.help.open')}
                title={t('filters.help.open')}
              >
                <CircleHelp className="h-4 w-4" aria-hidden />
              </Button>
            }
          />

          {activeFilterChips.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1" data-testid="admin.ip_addresses.active_filters">
              {activeFilterChips}
            </div>
          ) : null}
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setAdvancedOpen(true)}
          aria-label={t('filters.advanced.open')}
          title={t('filters.advanced.open')}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          <span className="ml-2 hidden sm:inline">{t('filters.advanced.label')}</span>
        </Button>

        <CopyButton size="sm" variant="secondary" label={t('common.copy_link')} text={shareUrl} testId="admin.ip_addresses.copy_link" />

        {filtersActive ? (
          <Button variant="secondary" size="sm" onClick={clearFilters} testId="admin.ip_addresses.clear">
            {t('common.clear_filters')}
          </Button>
        ) : null}
      </FilterBar>

      <div className="rounded-lg border border-border bg-surface p-3 shadow-sm" data-testid="admin.ip_addresses.quick_filters">
        <div className="grid gap-3 xl:grid-cols-[15rem_minmax(0,1fr)_12rem_22rem] xl:items-end">
          <Select
            label={t('admin.ip_addresses.quick.environment')}
            value={locationId !== undefined ? String(locationId) : ''}
            onChange={(e) => setIntParam('location', parsePositiveInt(e.target.value))}
            options={[
              { value: '', label: t('admin.ip_addresses.quick.environment.any') },
              ...environmentLocations.map((location) => {
                const label = String(location.label ?? `#${location.id}`);
                const environment = String(location.environment?.label ?? '').trim();
                return { value: String(location.id), label: environment ? `${label} · ${environment}` : label };
              }),
            ]}
            testId="admin.ip_addresses.quick.environment"
          />
          <div className="min-w-0 flex-1">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">{t('admin.ip_addresses.quick.subnet')}</span>
              <NetworkLookupInput
                value={networkId ?? null}
                onChange={(id) => setIntParam('network', id ?? undefined)}
                purpose="vps"
                locationId={locationId}
                placeholder={t('admin.ip_addresses.quick.subnet.placeholder')}
                testId="admin.ip_addresses.quick.subnet"
                loadingLabel={t('common.loading')}
                noResultsLabel={t('palette.empty.no_results')}
              />
            </label>
          </div>

          <Select
            label={t('admin.ip_addresses.advanced.version')}
            value={versionNum !== undefined ? String(versionNum) : ''}
            onChange={(e) => setTextParam('version', e.target.value || undefined)}
            options={[
              { value: '', label: t('admin.ip_addresses.advanced.version.any') },
              { value: '4', label: 'IPv4' },
              { value: '6', label: 'IPv6' },
            ]}
            testId="admin.ip_addresses.quick.version"
          />

          <div>
            <div className="mb-1 text-xs font-semibold text-muted">{t('admin.ip_addresses.quick.occupancy')}</div>
            <div className="grid h-10 grid-cols-3 overflow-hidden rounded-md border border-border bg-surface-2 p-0.5">
              <button
                type="button"
                onClick={() => setBoolParamInUrl('assigned_to_interface', undefined)}
                className={assignedToInterface === undefined ? 'rounded bg-surface px-2 text-sm font-semibold shadow-sm' : 'px-2 text-sm text-muted hover:text-fg'}
                data-testid="admin.ip_addresses.quick.occupancy.any"
              >
                {t('admin.ip_addresses.advanced.assigned.any')}
              </button>
              <button
                type="button"
                onClick={() => setBoolParamInUrl('assigned_to_interface', true)}
                className={assignedToInterface === true ? 'rounded bg-surface px-2 text-sm font-semibold shadow-sm' : 'px-2 text-sm text-muted hover:text-fg'}
                data-testid="admin.ip_addresses.quick.occupancy.assigned"
              >
                {t('admin.ip_addresses.quick.assigned')}
              </button>
              <button
                type="button"
                onClick={() => setBoolParamInUrl('assigned_to_interface', false)}
                className={assignedToInterface === false ? 'rounded bg-surface px-2 text-sm font-semibold shadow-sm' : 'px-2 text-sm text-muted hover:text-fg'}
                data-testid="admin.ip_addresses.quick.occupancy.unassigned"
              >
                {t('admin.ip_addresses.quick.unassigned')}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase text-faint">{t('admin.ip_addresses.quick.shortcuts')}</span>
          <Button variant={versionNum === 4 ? 'primary' : 'secondary'} size="sm" onClick={() => setTextParam('version', '4')} testId="admin.ip_addresses.quick.shortcut.ipv4">
            IPv4
          </Button>
          <Button variant={versionNum === 6 ? 'primary' : 'secondary'} size="sm" onClick={() => setTextParam('version', '6')} testId="admin.ip_addresses.quick.shortcut.ipv6">
            IPv6
          </Button>
          <Button
            variant={order === 'interface' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setTextParam('order', 'interface')}
            testId="admin.ip_addresses.quick.shortcut.interface_order"
          >
            {t('admin.ip_addresses.advanced.order.interface')}
          </Button>
        </div>
      </div>

      <SmartInputHelp
        open={helpOpen}
        onClose={() => {
          setHelpOpen(false);
          if (smartNeedle === '?') setSmart('');
        }}
        title={t('filters.help.title')}
        intro={t('admin.ip_addresses.smart_help.intro')}
        examples={[
          { example: '?', description: t('admin.ip_addresses.smart_help.examples.help') },
          { example: '123', description: t('admin.ip_addresses.smart_help.examples.open_id') },
          { example: '192.0.2.10', description: t('admin.ip_addresses.smart_help.examples.search') },
          { example: 'addr:192.0.2.10', description: t('admin.ip_addresses.smart_help.examples.addr') },
          { example: 'addr:192.0.2.0/24', description: t('admin.ip_addresses.smart_help.examples.addr_prefix') },
          { example: 'vps:101', description: t('admin.ip_addresses.smart_help.examples.vps') },
          { example: 'user:42', description: t('admin.ip_addresses.smart_help.examples.user') },
          { example: 'version:6', description: t('admin.ip_addresses.smart_help.examples.version') },
          { example: 'assigned:true', description: t('admin.ip_addresses.smart_help.examples.assigned') },
        ]}
        topKeys={[
          { key: 'addr', description: t('admin.ip_addresses.smart_help.keys.addr'), example: 'addr:192.0.2.10' },
          { key: 'vps', description: t('admin.ip_addresses.smart_help.keys.vps'), example: 'vps:101' },
          { key: 'user', description: t('admin.ip_addresses.smart_help.keys.user'), example: 'user:42' },
          { key: 'network', description: t('admin.ip_addresses.smart_help.keys.network'), example: 'network:12' },
        ]}
        moreKeys={[
          { key: 'iface', description: t('admin.ip_addresses.smart_help.keys.iface'), example: 'iface:501' },
          { key: 'location', description: t('admin.ip_addresses.smart_help.keys.location'), example: 'location:1' },
          { key: 'prefix', description: t('admin.ip_addresses.smart_help.keys.prefix'), example: 'prefix:64' },
          { key: 'version', description: t('admin.ip_addresses.smart_help.keys.version'), example: 'version:4' },
          { key: 'assigned', description: t('admin.ip_addresses.smart_help.keys.assigned'), example: 'assigned:false' },
          { key: 'order', description: t('admin.ip_addresses.smart_help.keys.order'), example: 'order:asc' },
          { key: 'id', description: t('admin.ip_addresses.smart_help.keys.id'), example: 'id:123' },
        ]}
        inference={[
          t('admin.ip_addresses.smart_help.inference.enter_applies'),
          t('admin.ip_addresses.smart_help.inference.number_opens'),
          t('admin.ip_addresses.smart_help.inference.key_value'),
        ]}
        onInsertKey={(key) => {
          const current = smartInputRef.current;
          if (!current) return;

          const next = smart.trim() ? `${smart.trim()} ${key}:` : `${key}:`;
          setSmart(next);
          clearSmartErrors();

          window.setTimeout(() => {
            current.focus();
            try {
              current.setSelectionRange(next.length, next.length);
            } catch {
              // ignore
            }
          }, 0);
        }}
        testId="admin.ip_addresses.smart_help"
        keyRowTestIdPrefix="admin.ip_addresses.smart_help.key"
      />

      <Drawer
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        title={t('filters.advanced.title')}
        width="lg"
        testId="admin.ip_addresses.advanced.drawer"
      >
        <div className="space-y-4">
          <div className="text-sm text-muted">{t('admin.ip_addresses.advanced.hint')}</div>

          <div>
            <div className="text-sm font-medium">{t('admin.ip_addresses.advanced.addr')}</div>
            <div className="mt-1">
              <Input
                value={addr}
                onChange={(e) => setTextParam('addr', e.target.value.trim() ? e.target.value : undefined)}
                placeholder={t('admin.ip_addresses.advanced.addr.placeholder')}
                testId="admin.ip_addresses.advanced.addr"
              />
            </div>
          </div>

          <div>
            <div className="text-sm font-medium">{t('admin.ip_addresses.advanced.prefix')}</div>
            <div className="mt-1 max-w-xs">
              <Input
                value={prefixNum !== undefined ? String(prefixNum) : ''}
                onChange={(e) => {
                  const parsed = parseNonNegativeInt(e.target.value);
                  if (parsed === undefined || parsed < 0 || parsed > 128) setTextParam('prefix', undefined);
                  else setTextParam('prefix', String(parsed));
                }}
                placeholder={t('admin.ip_addresses.advanced.prefix.placeholder')}
                testId="admin.ip_addresses.advanced.prefix"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm font-medium">{t('admin.ip_addresses.advanced.vps')}</div>
              <div className="mt-1">
                <VpsLookupInput
                  value={vpsId ?? null}
                  onChange={(id) => setIntParam('vps', id ?? undefined)}
                  placeholder={t('admin.ip_addresses.advanced.vps.placeholder')}
                  testId="admin.ip_addresses.advanced.vps"
                />
              </div>
            </div>

            <div>
              <div className="text-sm font-medium">{t('admin.ip_addresses.advanced.user')}</div>
              <div className="mt-1">
                <UserLookupInput
                  value={userLookup}
                  onChange={(value) => {
                    setUserLookup(value);
                    const id = parsePositiveInt(value);
                    if (id !== undefined) setResolvedUserFilter(id);
                    else setResolvedUserFilter(undefined);
                  }}
                  placeholder={t('admin.ip_addresses.advanced.user.placeholder')}
                  testId="admin.ip_addresses.advanced.user"
                  loadingLabel={t('common.loading')}
                  noResultsLabel={t('palette.empty.no_results')}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm font-medium">{t('admin.ip_addresses.advanced.network')}</div>
              <div className="mt-1 max-w-xs">
                <NetworkLookupInput
                  value={networkId ?? null}
                  onChange={(id) => setIntParam('network', id ?? undefined)}
                  purpose="vps"
                  locationId={locationId}
                  placeholder={t('admin.ip_addresses.advanced.network.placeholder')}
                  testId="admin.ip_addresses.advanced.network"
                  loadingLabel={t('common.loading')}
                  noResultsLabel={t('palette.empty.no_results')}
                />
              </div>
            </div>

            <div>
              <div className="text-sm font-medium">{t('admin.ip_addresses.advanced.iface')}</div>
              <div className="mt-1 max-w-xs">
                <Input
                  value={ifaceId !== undefined ? String(ifaceId) : ''}
                  onChange={(e) => setIntParam('network_interface', parsePositiveInt(e.target.value))}
                  placeholder={t('admin.ip_addresses.advanced.iface.placeholder')}
                  testId="admin.ip_addresses.advanced.iface"
                  inputMode="numeric"
                />
              </div>
            </div>

            <div>
              <div className="text-sm font-medium">{t('admin.ip_addresses.advanced.location')}</div>
              <div className="mt-1 max-w-xs">
                <Input
                  value={locationId !== undefined ? String(locationId) : ''}
                  onChange={(e) => setIntParam('location', parsePositiveInt(e.target.value))}
                  placeholder={t('admin.ip_addresses.advanced.location.placeholder')}
                  testId="admin.ip_addresses.advanced.location"
                  inputMode="numeric"
                />
              </div>
            </div>

            <div>
              <div className="text-sm font-medium">{t('admin.ip_addresses.advanced.version')}</div>
              <div className="mt-1 max-w-xs">
                <Select
                  value={versionNum !== undefined ? String(versionNum) : ''}
                  onChange={(e) => setTextParam('version', e.target.value || undefined)}
                  options={[
                    { value: '', label: t('admin.ip_addresses.advanced.version.any') },
                    { value: '4', label: 'IPv4' },
                    { value: '6', label: 'IPv6' },
                  ]}
                  testId="admin.ip_addresses.advanced.version"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm font-medium">{t('admin.ip_addresses.advanced.assigned')}</div>
              <div className="mt-1 max-w-xs">
                <Select
                  value={assignedToInterface === undefined ? '' : assignedToInterface ? '1' : '0'}
                  onChange={(e) => setBoolParamInUrl('assigned_to_interface', parseBoolParam(e.target.value))}
                  options={[
                    { value: '', label: t('admin.ip_addresses.advanced.assigned.any') },
                    { value: '1', label: t('admin.ip_addresses.advanced.assigned.true') },
                    { value: '0', label: t('admin.ip_addresses.advanced.assigned.false') },
                  ]}
                  testId="admin.ip_addresses.advanced.assigned"
                />
              </div>
              <div className="mt-1 text-xs text-faint">{t('admin.ip_addresses.advanced.assigned.hint')}</div>
            </div>

            <div>
              <div className="text-sm font-medium">{t('admin.ip_addresses.advanced.order')}</div>
              <div className="mt-1 max-w-xs">
                <Select
                  value={order}
                  onChange={(e) => {
                    const value = e.target.value.trim();
                    setTextParam('order', value === 'desc' ? undefined : value);
                  }}
                  options={[
                    { value: 'desc', label: t('admin.ip_addresses.advanced.order.desc') },
                    { value: 'asc', label: t('admin.ip_addresses.advanced.order.asc') },
                    { value: 'interface', label: t('admin.ip_addresses.advanced.order.interface') },
                  ]}
                  testId="admin.ip_addresses.advanced.order"
                />
              </div>
            </div>
          </div>

          {filtersActive ? (
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={clearFilters}>
                {t('common.clear_filters')}
              </Button>
              <Button onClick={() => setAdvancedOpen(false)}>{t('common.done')}</Button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <Button onClick={() => setAdvancedOpen(false)}>{t('common.done')}</Button>
            </div>
          )}
        </div>
      </Drawer>
    </>
  );
}
