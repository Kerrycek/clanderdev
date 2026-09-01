import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CircleHelp, SlidersHorizontal } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../../../app/auth';
import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';
import { formatErrorMessage } from '../../../../lib/errors';
import { formatDurationSeconds } from '../../../../lib/format';
import { parseBoolParam, parseNonNegativeInt } from '../../../../lib/parse';
import { parseNumericToken, splitKeyValueToken, tokenizeSmartInput, unquoteSmartValue } from '../../../../lib/smartFilter';
import { createEnvironment, fetchEnvironments, setEnvironmentMaintenance, updateEnvironment, type Environment } from '../../../../lib/api/infra';
import { ClusterResourceActions } from './ClusterResourceActions';

import { FilterBar } from '../../../../components/layout/FilterBar';

import { Alert } from '../../../../components/ui/Alert';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Card, CardBody } from '../../../../components/ui/Card';
import { CopyButton } from '../../../../components/ui/CopyButton';
import { Drawer } from '../../../../components/ui/Drawer';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { FilterChip } from '../../../../components/ui/FilterChip';
import { Input } from '../../../../components/ui/Input';
import { LoadingState } from '../../../../components/ui/LoadingState';
import { Modal } from '../../../../components/ui/Modal';
import { Select, type SelectOption } from '../../../../components/ui/Select';
import { SmartFilterInput, type SmartFilterSuggestion } from '../../../../components/ui/SmartFilterInput';
import { SmartInputHelp } from '../../../../components/ui/SmartInputHelp';
import { SwitchRow } from '../../../../components/ui/SwitchRow';
import { TableCard } from '../../../../components/ui/TableCard';
import { Textarea } from '../../../../components/ui/Textarea';

function envLabel(env: Environment): string {
  const label = typeof env.label === 'string' ? env.label.trim() : '';
  return label || `#${env.id}`;
}

function fmtUnlimited(n: number | undefined | null): string {
  if (n === undefined || n === null) return '—';
  if (n === 0) return '∞';
  return String(n);
}

function fmtLifetimeSeconds(s: number | undefined | null): string {
  if (s === undefined || s === null) return '—';
  if (s === 0) return '∞';
  return formatDurationSeconds(s);
}

type EditorState =
  | null
  | {
      mode: 'create' | 'edit';
      env?: Environment;
    };

type FormState = {
  label: string;
  description: string;
  domain: string;
  canCreateVps: boolean;
  canDestroyVps: boolean;
  vpsLifetime: string;
  maxVpsCount: string;
  userIpOwnership: boolean;
};

function initForm(env?: Environment): FormState {
  const x: any = env ?? {};

  return {
    label: typeof x.label === 'string' ? x.label : '',
    description: typeof x.description === 'string' ? x.description : '',
    domain: typeof x.domain === 'string' ? x.domain : '',
    canCreateVps: typeof x.can_create_vps === 'boolean' ? x.can_create_vps : false,
    canDestroyVps: typeof x.can_destroy_vps === 'boolean' ? x.can_destroy_vps : false,
    vpsLifetime: typeof x.vps_lifetime === 'number' ? String(x.vps_lifetime) : '0',
    maxVpsCount: typeof x.max_vps_count === 'number' ? String(x.max_vps_count) : '0',
    userIpOwnership: typeof x.user_ip_ownership === 'boolean' ? x.user_ip_ownership : true,
  };
}

function buildPayload(form: FormState): { payload: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];

  const label = form.label.trim();
  const domain = form.domain.trim();
  const description = form.description.trim();

  if (!label) errors.push('label');
  if (!domain) errors.push('domain');

  const vpsLifetime = parseNonNegativeInt(form.vpsLifetime);
  if (vpsLifetime === undefined) errors.push('vps_lifetime');

  const maxVpsCount = parseNonNegativeInt(form.maxVpsCount);
  if (maxVpsCount === undefined) errors.push('max_vps_count');

  const payload: Record<string, unknown> = {
    label,
    domain,
    description: description || undefined,
    can_create_vps: form.canCreateVps,
    can_destroy_vps: form.canDestroyVps,
    vps_lifetime: vpsLifetime ?? 0,
    max_vps_count: maxVpsCount ?? 0,
    user_ip_ownership: form.userIpOwnership,
  };

  return { payload, errors };
}

export function EnvironmentsPage() {
  const auth = useAuth();
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const smartInputRef = useRef<HTMLInputElement | null>(null);

  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const [hasHypervisor, setHasHypervisor] = useState(() => searchParams.get('has_hypervisor') ?? '');
  const [hasStorage, setHasStorage] = useState(() => searchParams.get('has_storage') ?? '');
  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Sync local state on navigation.
  useEffect(() => {
    const urlQ = searchParams.get('q') ?? '';
    const urlH = searchParams.get('has_hypervisor') ?? '';
    const urlS = searchParams.get('has_storage') ?? '';
    if (urlQ !== q) setQ(urlQ);
    if (urlH !== hasHypervisor) setHasHypervisor(urlH);
    if (urlS !== hasStorage) setHasStorage(urlS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const qTrim = useMemo(() => q.trim(), [q]);
  const hasHypervisorBool = useMemo(() => parseBoolParam(hasHypervisor), [hasHypervisor]);
  const hasStorageBool = useMemo(() => parseBoolParam(hasStorage), [hasStorage]);

  // Persist filters in URL.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);

    if (qTrim) next.set('q', qTrim);
    else next.delete('q');

    if (hasHypervisorBool === true) next.set('has_hypervisor', 'true');
    else if (hasHypervisorBool === false) next.set('has_hypervisor', 'false');
    else next.delete('has_hypervisor');

    if (hasStorageBool === true) next.set('has_storage', 'true');
    else if (hasStorageBool === false) next.set('has_storage', 'false');
    else next.delete('has_storage');

    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [hasHypervisorBool, hasStorageBool, qTrim, searchParams, setSearchParams]);

  const envQ = useQuery({
    queryKey: ['cluster.environments', { q: qTrim, hasHypervisorBool, hasStorageBool }],
    queryFn: async () =>
      (
        await fetchEnvironments({
          limit: 500,
          q: qTrim || undefined,
          hasHypervisor: hasHypervisorBool,
          hasStorage: hasStorageBool,
        })
      ).data,
    staleTime: 30_000,
  });

  const environments = envQ.data ?? [];
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  function focusSmartInput() {
    window.requestAnimationFrame(() => smartInputRef.current?.focus());
  }

  function insertSmartKey(key: string) {
    setSmart((prev) => {
      const trim = prev.trim();
      return trim ? `${trim} ${key}:` : `${key}:`;
    });
    focusSmartInput();
  }

  function clearAllFilters() {
    setSmart('');
    setSmartErrors([]);
    setQ('');
    setHasHypervisor('');
    setHasStorage('');
  }

  function applySmart(rawInput?: string) {
    const raw = String(rawInput ?? smart).trim();
    if (!raw) return;
    if (raw === '?') {
      setHelpOpen(true);
      return;
    }

    const tokens = tokenizeSmartInput(raw);
    let nextQ = qTrim;
    let nextHasHypervisor = hasHypervisor;
    let nextHasStorage = hasStorage;
    const errors: string[] = [];

    for (const token of tokens) {
      const kv = splitKeyValueToken(token);

      if (!kv) {
        const n = parseNumericToken(token);
        if (n !== null) nextQ = String(n);
        else nextQ = unquoteSmartValue(token);
        continue;
      }

      const key = kv.rawKey.trim().toLowerCase();
      const value = unquoteSmartValue(kv.rawValue).trim();

      if (!value) {
        errors.push(t('filters.smart.error.missing_value', { key }));
        continue;
      }

      switch (key) {
        case 'q':
        case 'search':
        case 'label':
        case 'name':
        case 'domain':
          nextQ = value;
          break;
        case 'id': {
          const n = parseNumericToken(value);
          if (n === null) errors.push(t('filters.smart.error.numeric_only', { key, value }));
          else nextQ = String(n);
          break;
        }
        case 'hypervisor':
        case 'has_hypervisor': {
          if (value === 'all') nextHasHypervisor = '';
          else {
            const b = parseBoolParam(value);
            if (b === undefined) errors.push(t('filters.smart.error.option_unresolved', { key, value }));
            else nextHasHypervisor = b ? 'true' : 'false';
          }
          break;
        }
        case 'storage':
        case 'has_storage': {
          if (value === 'all') nextHasStorage = '';
          else {
            const b = parseBoolParam(value);
            if (b === undefined) errors.push(t('filters.smart.error.option_unresolved', { key, value }));
            else nextHasStorage = b ? 'true' : 'false';
          }
          break;
        }
        default:
          errors.push(t('filters.smart.error.unknown_key', { key }));
      }
    }

    if (errors.length > 0) {
      setSmartErrors(errors);
      pushToast({ variant: 'danger', title: t('common.error'), body: errors[0] });
      return;
    }

    setSmart('');
    setSmartErrors([]);
    setQ(nextQ);
    setHasHypervisor(nextHasHypervisor);
    setHasStorage(nextHasStorage);
  }

  const boolOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('common.all') },
      { value: 'true', label: t('common.yes') },
      { value: 'false', label: t('common.no') },
    ],
    [t]
  );

  const activeChips = useMemo(() => {
    const chips: React.ReactNode[] = [];
    if (qTrim) chips.push(<FilterChip key="q" label={`q:${qTrim}`} onRemove={() => setQ('')} />);
    if (hasHypervisorBool === true) {
      chips.push(
        <FilterChip key="hv-yes" label={t('admin.cluster.environments.smart.chip.hypervisor_yes')} tone="info" onRemove={() => setHasHypervisor('')} />
      );
    } else if (hasHypervisorBool === false) {
      chips.push(
        <FilterChip key="hv-no" label={t('admin.cluster.environments.smart.chip.hypervisor_no')} tone="warn" onRemove={() => setHasHypervisor('')} />
      );
    }
    if (hasStorageBool === true) {
      chips.push(
        <FilterChip key="storage-yes" label={t('admin.cluster.environments.smart.chip.storage_yes')} tone="info" onRemove={() => setHasStorage('')} />
      );
    } else if (hasStorageBool === false) {
      chips.push(
        <FilterChip key="storage-no" label={t('admin.cluster.environments.smart.chip.storage_no')} tone="warn" onRemove={() => setHasStorage('')} />
      );
    }
    smartErrors.forEach((msg, i) => chips.push(<FilterChip key={`err-${i}`} label={msg} tone="danger" onRemove={() => setSmartErrors((prev) => prev.filter((_, idx) => idx !== i))} />));
    return chips;
  }, [hasHypervisorBool, hasStorageBool, qTrim, smartErrors, t]);

  const smartSuggestions = useMemo<SmartFilterSuggestion[]>(() => {
    const raw = smart.trim();
    if (!raw) return [];
    if (raw === '?') {
      return [
        {
          id: 'help',
          primary: t('filters.help.open'),
          secondary: t('admin.cluster.environments.smart.help.intro'),
          onPick: () => {
            setHelpOpen(true);
            setSmart('');
          },
        },
      ];
    }

    const suggestions: SmartFilterSuggestion[] = [];
    const numeric = parseNumericToken(raw);
    if (numeric !== null) {
      suggestions.push({
        id: 'id',
        primary: t('admin.cluster.environments.smart.suggestion.id', { id: numeric }),
        secondary: t('admin.cluster.environments.smart.suggestion.id_hint'),
        onPick: () => {
          setQ(String(numeric));
          setSmart('');
          setSmartErrors([]);
        },
      });
    }

    const kv = splitKeyValueToken(raw);
    if (kv) {
      suggestions.push({
        id: 'apply',
        primary: t('filters.smart.suggest.apply.primary'),
        secondary: raw,
        onPick: () => applySmart(raw),
      });
      return suggestions;
    }

    suggestions.push({
      id: 'search',
      primary: t('admin.cluster.environments.smart.suggestion.search', { value: raw }),
      secondary: t('admin.cluster.environments.smart.suggestion.search_hint'),
      onPick: () => {
        setQ(raw);
        setSmart('');
        setSmartErrors([]);
      },
    });

    return suggestions;
  }, [smart, t]);

  const [editor, setEditor] = useState<EditorState>(null);
  const [form, setForm] = useState<FormState>(() => initForm());
  const [formTouched, setFormTouched] = useState(false);

  const openCreate = () => {
    setEditor({ mode: 'create' });
    setForm(initForm());
    setFormTouched(false);
  };

  const openEdit = (env: Environment) => {
    setEditor({ mode: 'edit', env });
    setForm(initForm(env));
    setFormTouched(false);
  };

  const closeEditor = () => {
    setEditor(null);
    setForm(initForm());
    setFormTouched(false);
  };

  const payloadInfo = useMemo(() => buildPayload(form), [form]);
  const canSave = useMemo(() => payloadInfo.errors.length === 0, [payloadInfo.errors.length]);

  const saveM = useMutation({
    mutationFn: async () => {
      if (!editor) throw new Error('No editor');
      const { payload, errors } = payloadInfo;
      if (errors.length > 0) throw new Error('Invalid form');

      if (editor.mode === 'create') return createEnvironment(payload);
      if (!editor.env) throw new Error('Missing environment');
      return updateEnvironment(editor.env.id, payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['cluster.environments'] });
      pushToast({
        variant: 'ok',
        title: editor?.mode === 'create' ? t('admin.cluster.environments.toast.created') : t('admin.cluster.environments.toast.saved'),
      });
      closeEditor();
    },
    onError: (e) => {
      pushToast({ variant: 'danger', title: t('common.error'), body: formatErrorMessage(e) });
    },
  });

  if (envQ.isLoading) return <LoadingState testId="admin.cluster.environments.loading" />;

  if (envQ.isError) {
    return (
      <ErrorState
        title={t('admin.cluster.environments.error.title')}
        message={t('admin.cluster.environments.error.body')}
        onRetry={() => envQ.refetch()}
        testId="admin.cluster.environments.error"
      />
    );
  }

  return (
    <div className="mt-4 space-y-4" data-testid="admin.cluster.environments.page">
      <FilterBar testId="admin.cluster.environments.filters">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <SmartFilterInput
            ref={smartInputRef}
            testId="admin.cluster.environments.search.input"
            value={smart}
            onChange={(v) => {
              setSmart(v);
              if (smartErrors.length) setSmartErrors([]);
            }}
            onSubmit={() => applySmart()}
            placeholder={t('admin.cluster.environments.filter.search_placeholder')}
            ariaLabel={t('admin.cluster.environments.filter.search_placeholder')}
            suggestions={smartSuggestions}
            suffix={
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
                aria-label={t('filters.help.open')}
                title={t('filters.help.open')}
                onClick={() => setHelpOpen(true)}
              >
                <CircleHelp className="h-4 w-4" aria-hidden />
              </button>
            }
          />
          {activeChips.length > 0 ? <div className="flex flex-wrap gap-2">{activeChips}</div> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setAdvancedOpen(true)} testId="admin.cluster.environments.advanced">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            <span>{t('filters.advanced.label')}</span>
          </Button>
          <Button variant="secondary" onClick={() => envQ.refetch()}>
            {t('common.refresh')}
          </Button>
          <CopyButton text={shareUrl} label={t('common.copy_link')} testId="admin.cluster.environments.copy_link" />
          {(qTrim || hasHypervisor || hasStorage || smartErrors.length > 0) ? (
            <Button variant="secondary" onClick={clearAllFilters} testId="admin.cluster.environments.filter.clear">
              {t('common.clear_filters')}
            </Button>
          ) : null}
          <Button onClick={openCreate} testId="admin.cluster.environments.create">
            {t('admin.cluster.environments.create')}
          </Button>
        </div>
      </FilterBar>

      <Drawer
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        width="lg"
        title={t('filters.advanced.title')}
        testId="admin.cluster.environments.advanced.drawer"
        footer={
          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={clearAllFilters}>{t('common.clear_filters')}</Button>
            <Button variant="primary" onClick={() => setAdvancedOpen(false)}>{t('common.done')}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('common.search')}</div>
            <Input
              testId="admin.cluster.environments.advanced.q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('admin.cluster.environments.filter.search_placeholder')}
            />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('admin.cluster.environments.smart.key.hypervisor')}</div>
            <Select
              testId="admin.cluster.environments.filter.has_hypervisor"
              value={hasHypervisor}
              onChange={(e) => setHasHypervisor(e.target.value)}
              options={boolOptions}
            />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('admin.cluster.environments.smart.key.storage')}</div>
            <Select
              testId="admin.cluster.environments.filter.has_storage"
              value={hasStorage}
              onChange={(e) => setHasStorage(e.target.value)}
              options={boolOptions}
            />
          </div>
        </div>
      </Drawer>

      <SmartInputHelp
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={t('admin.cluster.environments.smart.help.title')}
        intro={t('admin.cluster.environments.smart.help.intro')}
        examples={[
          { example: '?', description: t('admin.cluster.environments.smart.help.example_help') },
          { example: 'production', description: t('admin.cluster.environments.smart.help.example_search') },
          { example: 'id:2', description: t('admin.cluster.environments.smart.help.example_id') },
          { example: 'hypervisor:true', description: t('admin.cluster.environments.smart.help.example_hypervisor') },
          { example: 'storage:false', description: t('admin.cluster.environments.smart.help.example_storage') },
        ]}
        topKeys={[
          { key: 'q', description: t('admin.cluster.environments.smart.key.q'), example: 'q:production' },
          { key: 'id', description: t('admin.cluster.environments.smart.key.id'), example: 'id:2' },
          { key: 'hypervisor', description: t('admin.cluster.environments.smart.key.hypervisor'), example: 'hypervisor:true' },
          { key: 'storage', description: t('admin.cluster.environments.smart.key.storage'), example: 'storage:false' },
        ]}
        inference={[
          t('admin.cluster.environments.smart.help.inference.text'),
          t('admin.cluster.environments.smart.help.inference.number'),
          t('admin.cluster.environments.smart.help.inference.keyvalue'),
        ]}
        onInsertKey={insertSmartKey}
        actions={[
          {
            label: t('filters.advanced.label'),
            onClick: () => {
              setHelpOpen(false);
              setAdvancedOpen(true);
            },
            variant: 'secondary',
          },
        ]}
        testId="admin.cluster.environments.smart_help"
        keyRowTestIdPrefix="admin.cluster.environments.smart_help.key"
      />

      {environments.length === 0 ? (
        <EmptyState
          title={t('admin.cluster.environments.empty.title')}
          message={t('admin.cluster.environments.empty.body')}
          testId="admin.cluster.environments.empty"
        />
      ) : (
        <TableCard testId="admin.cluster.environments.table" minWidth="lg">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('common.name')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('common.domain')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('admin.cluster.environments.col.create_vps')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('admin.cluster.environments.col.destroy_vps')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('admin.cluster.environments.col.max_vps')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('admin.cluster.environments.col.lifetime')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('admin.cluster.environments.col.ip_ownership')}</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-muted">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {environments.map((env) => {
              const canCreate = Boolean((env as any).can_create_vps);
              const canDestroy = Boolean((env as any).can_destroy_vps);
              const ipOwner = (env as any).user_ip_ownership;

              const desc = typeof env.description === 'string' ? env.description.trim() : '';

              return (
                <tr key={env.id} data-testid={`admin.cluster.environments.row.${env.id}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-fg">{envLabel(env)}</div>
                    {desc ? <div className="mt-0.5 text-xs text-muted">{desc}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-sm">{(env as any).domain || '—'}</td>
                  <td className="px-3 py-2">
                    <Badge variant={canCreate ? 'ok' : 'neutral'}>{canCreate ? t('common.yes') : t('common.no')}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={canDestroy ? 'warn' : 'neutral'}>{canDestroy ? t('common.yes') : t('common.no')}</Badge>
                  </td>
                  <td className="px-3 py-2 text-sm">{fmtUnlimited((env as any).max_vps_count as any)}</td>
                  <td className="px-3 py-2 text-sm">{fmtLifetimeSeconds((env as any).vps_lifetime as any)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={ipOwner === false ? 'warn' : 'ok'}>
                      {ipOwner === false ? t('common.no') : t('common.yes')}
                    </Badge>
                  </td>
                  <ClusterResourceActions
                    role={auth.role} maintenance={{ value: env.maintenance_lock, reason: env.maintenance_lock_reason, label: envLabel(env), testId: `admin.cluster.environments.row.${env.id}.maintenance`, setMaintenance: (opts) => setEnvironmentMaintenance(env.id, opts), onChanged: () => qc.invalidateQueries({ queryKey: ['cluster.environments'] }) }}
                    edit={{ label: t('common.edit'), testId: `admin.cluster.environments.row.${env.id}.edit`, onClick: () => openEdit(env) }}
                  />
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      )}

      <Modal
        open={Boolean(editor)}
        onClose={closeEditor}
        title={editor?.mode === 'create' ? t('admin.cluster.environments.editor.create_title') : t('admin.cluster.environments.editor.edit_title')}
        testId="admin.cluster.environments.editor"
        size="lg"
      >
        <div className="space-y-4">
          {formTouched && payloadInfo.errors.length > 0 ? (
            <Alert variant="warn" title={t('common.validation_error')} testId="admin.cluster.environments.editor.validation">
              {t('admin.cluster.environments.editor.validation_body')}
            </Alert>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="text-sm font-medium text-fg">{t('common.name')}</div>
              <Input
                testId="admin.cluster.environments.editor.label"
                value={form.label}
                onChange={(e) => {
                  setFormTouched(true);
                  setForm((p) => ({ ...p, label: e.target.value }));
                }}
                placeholder={t('admin.cluster.environments.editor.label_placeholder')}
              />
            </div>

            <div>
              <div className="text-sm font-medium text-fg">{t('common.domain')}</div>
              <Input
                testId="admin.cluster.environments.editor.domain"
                value={form.domain}
                onChange={(e) => {
                  setFormTouched(true);
                  setForm((p) => ({ ...p, domain: e.target.value }));
                }}
                placeholder={t('admin.cluster.environments.editor.domain_placeholder')}
              />
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-fg">{t('common.description')}</div>
            <Textarea
              testId="admin.cluster.environments.editor.description"
              value={form.description}
              onChange={(e) => {
                setFormTouched(true);
                setForm((p) => ({ ...p, description: e.target.value }));
              }}
              rows={3}
            />
          </div>

          <Card>
            <CardBody className="space-y-3">
              <SwitchRow
                testId="admin.cluster.environments.editor.can_create"
                label={t('admin.cluster.environments.editor.can_create')}
                checked={form.canCreateVps}
                onChange={(v) => {
                  setFormTouched(true);
                  setForm((p) => ({ ...p, canCreateVps: v }));
                }}
              />
              <SwitchRow
                testId="admin.cluster.environments.editor.can_destroy"
                label={t('admin.cluster.environments.editor.can_destroy')}
                checked={form.canDestroyVps}
                onChange={(v) => {
                  setFormTouched(true);
                  setForm((p) => ({ ...p, canDestroyVps: v }));
                }}
              />
              <SwitchRow
                testId="admin.cluster.environments.editor.ip_ownership"
                label={t('admin.cluster.environments.editor.ip_ownership')}
                checked={form.userIpOwnership}
                onChange={(v) => {
                  setFormTouched(true);
                  setForm((p) => ({ ...p, userIpOwnership: v }));
                }}
              />
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="text-sm font-medium text-fg">{t('admin.cluster.environments.editor.vps_lifetime')}</div>
              <Input
                testId="admin.cluster.environments.editor.vps_lifetime"
                value={form.vpsLifetime}
                onChange={(e) => {
                  setFormTouched(true);
                  setForm((p) => ({ ...p, vpsLifetime: e.target.value }));
                }}
                inputMode="numeric"
              />
              <div className="mt-1 text-xs text-muted">
                {t('admin.cluster.environments.editor.vps_lifetime_help', {
                  preview: fmtLifetimeSeconds(parseNonNegativeInt(form.vpsLifetime) ?? null),
                })}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-fg">{t('admin.cluster.environments.editor.max_vps')}</div>
              <Input
                testId="admin.cluster.environments.editor.max_vps"
                value={form.maxVpsCount}
                onChange={(e) => {
                  setFormTouched(true);
                  setForm((p) => ({ ...p, maxVpsCount: e.target.value }));
                }}
                inputMode="numeric"
              />
              <div className="mt-1 text-xs text-muted">{t('admin.cluster.environments.editor.max_vps_help')}</div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={closeEditor} disabled={saveM.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              testId="admin.cluster.environments.editor.save"
              onClick={() => {
                setFormTouched(true);
                if (canSave) saveM.mutate();
              }}
              disabled={!canSave || saveM.isPending}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
