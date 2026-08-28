import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';

import { useI18n } from '../../../app/i18n';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Spinner } from '../../../components/ui/Spinner';
import { UserLookupInput } from '../../../components/ui/UserLookupInput';
import { fetchEnvironments, fetchLocations } from '../../../lib/api/infra';
import { fetchNodes } from '../../../lib/api/nodes';
import { fetchOutageComponents } from '../../../lib/api/outages';
import { parsePositiveInt } from '../../../lib/parse';
import {
  addHandlerSelection,
  addScopeSelection,
  type OutageHandlerSelection,
  type OutageScopeSelection,
  type OutageSystemsFormState,
} from './outageAdminModel';

function optionLabel(value: { id: number; label?: string; domain?: string; name?: string; domain_name?: string; fqdn?: string }) {
  return value.label || value.fqdn || value.domain_name || value.domain || value.name || `#${value.id}`;
}

function ScopeChip(props: { item: OutageScopeSelection; onRemove: () => void }) {
  const { t } = useI18n();
  const id = props.item.id ?? props.item.apiName ?? props.item.label;
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg"
      data-testid={`admin.outages.systems.scope.${props.item.kind}.${id}`}
    >
      <span className="text-muted">{t(`admin.outages.systems.kind.${props.item.kind}`)}:</span>
      <span className="truncate">{props.item.label}</span>
      <button
        type="button"
        className="ml-0.5 rounded-full p-0.5 text-muted hover:bg-surface hover:text-fg"
        aria-label={t('admin.outages.systems.remove', { label: props.item.label })}
        data-testid={`admin.outages.systems.scope.${props.item.kind}.${id}.remove`}
        onClick={props.onRemove}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

function HandlerChip(props: { item: OutageHandlerSelection; onRemove: () => void }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg">
      <span className="truncate">{props.item.label}</span>
      <button
        type="button"
        className="ml-0.5 rounded-full p-0.5 text-muted hover:bg-surface hover:text-fg"
        aria-label={t('admin.outages.systems.remove', { label: props.item.label })}
        data-testid={`admin.outages.systems.handler.${props.item.id}.remove`}
        onClick={props.onRemove}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

export function OutageScopeEditor(props: {
  form: OutageSystemsFormState;
  setForm: React.Dispatch<React.SetStateAction<OutageSystemsFormState>>;
}) {
  const { t } = useI18n();
  const [environmentId, setEnvironmentId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [nodeId, setNodeId] = useState('');
  const [componentId, setComponentId] = useState('');
  const [handlerLookup, setHandlerLookup] = useState('');
  const [customName, setCustomName] = useState('');

  const environmentNumericId = parsePositiveInt(environmentId);
  const locationNumericId = parsePositiveInt(locationId);

  const environmentsQ = useQuery({
    queryKey: ['admin_outages', 'lookup', 'environments'],
    queryFn: async () => (await fetchEnvironments({ limit: 250 })).data,
    staleTime: 60_000,
  });
  const locationsQ = useQuery({
    queryKey: ['admin_outages', 'lookup', 'locations', environmentNumericId],
    queryFn: async () => (await fetchLocations({ environmentId: environmentNumericId, limit: 250 })).data,
    enabled: Boolean(environmentNumericId),
    staleTime: 60_000,
  });
  const nodesQ = useQuery({
    queryKey: ['admin_outages', 'lookup', 'nodes', locationNumericId],
    queryFn: async () => (await fetchNodes({ location: locationNumericId, limit: 250 })).data,
    enabled: Boolean(locationNumericId),
    staleTime: 60_000,
  });
  const componentsQ = useQuery({
    queryKey: ['admin_outages', 'lookup', 'components'],
    queryFn: async () => (await fetchOutageComponents({ limit: 250 })).data,
    staleTime: 60_000,
  });

  const environment = useMemo(
    () => environmentsQ.data?.find((item) => item.id === environmentNumericId),
    [environmentNumericId, environmentsQ.data]
  );
  const location = useMemo(
    () => locationsQ.data?.find((item) => item.id === locationNumericId),
    [locationNumericId, locationsQ.data]
  );
  const node = useMemo(
    () => nodesQ.data?.find((item) => item.id === parsePositiveInt(nodeId)),
    [nodeId, nodesQ.data]
  );
  const component = useMemo(
    () => componentsQ.data?.find((item) => item.id === parsePositiveInt(componentId)),
    [componentId, componentsQ.data]
  );

  const addScope = (item: OutageScopeSelection) => {
    props.setForm((current) => ({ ...current, scope: addScopeSelection(current.scope, item) }));
  };
  const removeScope = (index: number) => {
    props.setForm((current) => ({ ...current, scope: current.scope.filter((_, candidate) => candidate !== index) }));
  };
  const addHandler = (item: OutageHandlerSelection) => {
    props.setForm((current) => ({ ...current, handlers: addHandlerSelection(current.handlers, item) }));
  };

  const baseOption = [{ value: '', label: t('common.select') }];

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-surface-2/50 p-4" data-testid="admin.outages.systems.hierarchy">
        <div className="mb-1 text-sm font-semibold text-fg">{t('admin.outages.systems.hierarchy.title')}</div>
        <div className="mb-4 text-xs text-muted">{t('admin.outages.systems.hierarchy.help')}</div>
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">1. {t('admin.outages.systems.environments')}</span>
            <Select
              testId="admin.outages.systems.hierarchy.environment"
              value={environmentId}
              onChange={(event) => {
                setEnvironmentId(event.target.value);
                setLocationId('');
                setNodeId('');
              }}
              options={[...baseOption, ...(environmentsQ.data ?? []).map((item) => ({ value: String(item.id), label: optionLabel(item) }))]}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">2. {t('admin.outages.systems.locations')}</span>
            <Select
              testId="admin.outages.systems.hierarchy.location"
              value={locationId}
              disabled={!environmentNumericId || locationsQ.isLoading}
              onChange={(event) => {
                setLocationId(event.target.value);
                setNodeId('');
              }}
              options={[...baseOption, ...(locationsQ.data ?? []).map((item) => ({ value: String(item.id), label: optionLabel(item) }))]}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">3. {t('admin.outages.systems.nodes')}</span>
            <Select
              testId="admin.outages.systems.hierarchy.node"
              value={nodeId}
              disabled={!locationNumericId || nodesQ.isLoading}
              onChange={(event) => setNodeId(event.target.value)}
              options={[...baseOption, ...(nodesQ.data ?? []).map((item) => ({ value: String(item.id), label: optionLabel(item) }))]}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!environment}
            testId="admin.outages.systems.hierarchy.add_environment"
            onClick={() => environment && addScope({ kind: 'Environment', id: environment.id, label: optionLabel(environment) })}
          >{t('admin.outages.systems.add_environment')}</Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!location}
            testId="admin.outages.systems.hierarchy.add_location"
            onClick={() => location && addScope({ kind: 'Location', id: location.id, label: optionLabel(location) })}
          >{t('admin.outages.systems.add_location')}</Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!node}
            testId="admin.outages.systems.hierarchy.add_node"
            onClick={() => node && addScope({ kind: 'Node', id: node.id, label: optionLabel(node) })}
          >{t('admin.outages.systems.add_node')}</Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            testId="admin.outages.systems.hierarchy.add_cluster"
            onClick={() => addScope({ kind: 'Cluster', id: null, label: t('admin.outages.systems.cluster_wide') })}
          >{t('admin.outages.systems.add_cluster')}</Button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">{t('admin.outages.systems.components')}</span>
            <div className="flex gap-2">
              <Select
                testId="admin.outages.systems.components.select"
                value={componentId}
                onChange={(event) => setComponentId(event.target.value)}
                options={[...baseOption, ...(componentsQ.data ?? []).map((item) => ({ value: String(item.id), label: optionLabel(item) }))]}
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={!component}
                testId="admin.outages.systems.components.add"
                onClick={() => {
                  if (!component) return;
                  addScope({ kind: 'vpsAdmin', id: component.id, label: optionLabel(component) });
                  setComponentId('');
                }}
              >{t('common.add')}</Button>
            </div>
          </label>
          {componentsQ.isLoading ? <div className="mt-2"><Spinner label={t('common.loading')} /></div> : null}
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-muted">{t('admin.outages.systems.handlers')}</div>
          <UserLookupInput
            testId="admin.outages.systems.handlers.lookup"
            value={handlerLookup}
            onChange={setHandlerLookup}
            onPick={(user) => {
              addHandler({ id: user.id, label: user.full_name || user.login || `#${user.id}` });
              setHandlerLookup('');
            }}
            placeholder={t('admin.outages.systems.handler_lookup_placeholder')}
          />
          <div className="mt-1 text-xs text-muted">{t('admin.outages.systems.handler_help')}</div>
        </div>
      </div>

      <details className="rounded-lg border border-border bg-surface p-3">
        <summary className="cursor-pointer text-sm font-semibold text-fg">{t('admin.outages.systems.custom.title')}</summary>
        <div className="mt-3 text-xs text-muted">{t('admin.outages.systems.custom.help')}</div>
        <div className="mt-2 flex gap-2">
          <Input
            testId="admin.outages.systems.custom.input"
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            placeholder={t('admin.outages.systems.custom.placeholder')}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!customName.trim()}
            testId="admin.outages.systems.custom.add"
            onClick={() => {
              const name = customName.trim();
              if (!name) return;
              addScope({ kind: 'Custom', id: null, label: name, apiName: name });
              setCustomName('');
            }}
          >{t('common.add')}</Button>
        </div>
      </details>

      <section className="rounded-lg border border-border bg-surface p-4" data-testid="admin.outages.systems.preview">
        <div className="text-sm font-semibold text-fg">{t('admin.outages.systems.preview.title')}</div>
        <div className="mt-1 text-xs text-muted">{t('admin.outages.systems.preview.help')}</div>
        <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">{t('admin.outages.systems.preview.scope')}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {props.form.scope.length ? props.form.scope.map((item, index) => (
            <ScopeChip key={`${item.kind}:${item.apiName ?? ''}:${item.id ?? ''}`} item={item} onRemove={() => removeScope(index)} />
          )) : <span className="text-sm text-muted">{t('admin.outages.systems.none_selected')}</span>}
        </div>
        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">{t('admin.outages.systems.handlers')}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {props.form.handlers.length ? props.form.handlers.map((handler) => (
            <HandlerChip
              key={handler.id}
              item={handler}
              onRemove={() => props.setForm((current) => ({ ...current, handlers: current.handlers.filter((item) => item.id !== handler.id) }))}
            />
          )) : <span className="text-sm text-muted">{t('admin.outages.empty.handlers')}</span>}
        </div>
      </section>
    </div>
  );
}
