import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CircleHelp, SlidersHorizontal } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';
import { formatErrorMessage } from '../../../../lib/errors';
import { parseBoolParam, parsePositiveInt } from '../../../../lib/parse';
import { safeAbsoluteHttpUrl } from '../../../../lib/safeUrl';
import { parseNumericToken, splitKeyValueToken, tokenizeSmartInput, unquoteSmartValue } from '../../../../lib/smartFilter';
import {
  createLocation,
  fetchEnvironments,
  fetchLocations,
  updateLocation,
  type Environment,
  type Location,
} from '../../../../lib/api/infra';
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

function envLabel(env: Environment | null | undefined): string {
  const e: any = env ?? {};
  const label = typeof e.label === 'string' ? e.label.trim() : '';
  return label || (typeof e.id === 'number' ? `#${e.id}` : '—');
}

function locLabel(loc: Location | null | undefined): string {
  const x: any = loc ?? {};
  const label = typeof x.label === 'string' ? x.label.trim() : '';
  return label || (typeof x.id === 'number' ? `#${x.id}` : '—');
}

type EditorState =
  | null
  | {
      mode: 'create' | 'edit';
      location?: Location;
    };

type FormState = {
  label: string;
  description: string;
  environmentId: string;
  domain: string;
  hasIpv6: boolean;
  remoteConsoleServer: string;
};

function initForm(loc?: Location): FormState {
  const x: any = loc ?? {};
  return {
    label: typeof x.label === 'string' ? x.label : '',
    description: typeof x.description === 'string' ? x.description : '',
    environmentId: typeof x.environment?.id === 'number' ? String(x.environment.id) : '',
    domain: typeof x.domain === 'string' ? x.domain : '',
    hasIpv6: typeof x.has_ipv6 === 'boolean' ? x.has_ipv6 : true,
    remoteConsoleServer: typeof x.remote_console_server === 'string' ? x.remote_console_server : '',
  };
}

function buildPayload(form: FormState): { payload: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];

  const label = form.label.trim();
  const domain = form.domain.trim();
  const description = form.description.trim();
  const remoteConsoleServer = form.remoteConsoleServer.trim();

  if (!label) errors.push('label');
  const envId = parsePositiveInt(form.environmentId);
  if (!envId) errors.push('environment');

  // `domain` may be optional on backend, but it is a core identifier for operators.
  if (!domain) errors.push('domain');

  const payload: Record<string, unknown> = {
    label,
    description: description || undefined,
    environment: envId,
    domain,
    has_ipv6: form.hasIpv6,
    remote_console_server: remoteConsoleServer || undefined,
  };

  return { payload, errors };
}

export function LocationsPage() {
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const smartInputRef = useRef<HTMLInputElement | null>(null);

  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const [environment, setEnvironment] = useState(() => searchParams.get('environment') ?? '');
  const [hasHypervisor, setHasHypervisor] = useState(() => searchParams.get('has_hypervisor') ?? '');
  const [hasStorage, setHasStorage] = useState(() => searchParams.get('has_storage') ?? '');
  const [hypervisorType, setHypervisorType] = useState(() => searchParams.get('hypervisor_type') ?? '');
  const [sharesWith, setSharesWith] = useState(() => searchParams.get('shares_with') ?? '');
  const [sharesVer, setSharesVer] = useState(() => searchParams.get('shares_ver') ?? '');
  const [sharesPrimary, setSharesPrimary] = useState(() => searchParams.get('shares_primary') ?? '');
  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Sync local state on navigation.
  useEffect(() => {
    const urlQ = searchParams.get('q') ?? '';
    const urlE = searchParams.get('environment') ?? '';
    const urlH = searchParams.get('has_hypervisor') ?? '';
    const urlS = searchParams.get('has_storage') ?? '';
    const urlT = searchParams.get('hypervisor_type') ?? '';
    const urlW = searchParams.get('shares_with') ?? '';
    const urlV = searchParams.get('shares_ver') ?? '';
    const urlP = searchParams.get('shares_primary') ?? '';

    if (urlQ !== q) setQ(urlQ);
    if (urlE !== environment) setEnvironment(urlE);
    if (urlH !== hasHypervisor) setHasHypervisor(urlH);
    if (urlS !== hasStorage) setHasStorage(urlS);
    if (urlT !== hypervisorType) setHypervisorType(urlT);
    if (urlW !== sharesWith) setSharesWith(urlW);
    if (urlV !== sharesVer) setSharesVer(urlV);
    if (urlP !== sharesPrimary) setSharesPrimary(urlP);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const qTrim = useMemo(() => q.trim(), [q]);
  const environmentId = useMemo(() => parsePositiveInt(environment), [environment]);
  const hasHypervisorBool = useMemo(() => parseBoolParam(hasHypervisor), [hasHypervisor]);
  const hasStorageBool = useMemo(() => parseBoolParam(hasStorage), [hasStorage]);
  const hvTrim = useMemo(() => hypervisorType.trim(), [hypervisorType]);
  const sharesWithId = useMemo(() => parsePositiveInt(sharesWith), [sharesWith]);
  const sharesPrimaryBool = useMemo(() => parseBoolParam(sharesPrimary), [sharesPrimary]);

  const sharesVersion = useMemo(() => {
    const s = sharesVer.trim();
    if (s === '4') return 4 as const;
    if (s === '6') return 6 as const;
    return 'any' as const;
  }, [sharesVer]);

  // Persist filters in URL.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);

    if (qTrim) next.set('q', qTrim);
    else next.delete('q');

    if (environmentId) next.set('environment', String(environmentId));
    else next.delete('environment');

    if (hasHypervisorBool === true) next.set('has_hypervisor', 'true');
    else if (hasHypervisorBool === false) next.set('has_hypervisor', 'false');
    else next.delete('has_hypervisor');

    if (hasStorageBool === true) next.set('has_storage', 'true');
    else if (hasStorageBool === false) next.set('has_storage', 'false');
    else next.delete('has_storage');

    if (hvTrim) next.set('hypervisor_type', hvTrim);
    else next.delete('hypervisor_type');

    if (sharesWithId) next.set('shares_with', String(sharesWithId));
    else next.delete('shares_with');

    if (sharesWithId) {
      if (sharesVersion === 4) next.set('shares_ver', '4');
      else if (sharesVersion === 6) next.set('shares_ver', '6');
      else next.delete('shares_ver');

      if (sharesPrimaryBool === true) next.set('shares_primary', 'true');
      else if (sharesPrimaryBool === false) next.set('shares_primary', 'false');
      else next.delete('shares_primary');
    } else {
      next.delete('shares_ver');
      next.delete('shares_primary');
    }

    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [
    environmentId,
    hasHypervisorBool,
    hasStorageBool,
    hvTrim,
    qTrim,
    searchParams,
    setSearchParams,
    sharesPrimaryBool,
    sharesVersion,
    sharesWithId,
  ]);

  const envQ = useQuery({
    queryKey: ['cluster.environments.lookup'],
    queryFn: async () => (await fetchEnvironments({ limit: 500 })).data,
    staleTime: 60_000,
  });

  const allLocQ = useQuery({
    queryKey: ['cluster.locations.lookup'],
    queryFn: async () => (await fetchLocations({ limit: 500 })).data,
    staleTime: 60_000,
  });

  const locQ = useQuery({
    queryKey: [
      'cluster.locations',
      {
        q: qTrim,
        environmentId,
        hasHypervisorBool,
        hasStorageBool,
        hvTrim,
        sharesWithId,
        sharesVersion,
        sharesPrimaryBool,
      },
    ],
    queryFn: async () =>
      (
        await fetchLocations({
          limit: 500,
          q: qTrim || undefined,
          environmentId,
          hasHypervisor: hasHypervisorBool,
          hasStorage: hasStorageBool,
          hypervisorType: hvTrim || undefined,
          sharesNetworksWithLocationId: sharesWithId,
          sharesNetworksWithVersion: sharesWithId ? sharesVersion : undefined,
          sharesNetworksPrimary: sharesWithId ? sharesPrimaryBool : undefined,
        })
      ).data,
    staleTime: 30_000,
  });

  const environments = envQ.data ?? [];
  const locations = locQ.data ?? [];
  const shareLocations = allLocQ.data ?? locations;
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  const envOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [{ value: '', label: t('common.all') }];
    for (const e of environments) opts.push({ value: String(e.id), label: envLabel(e) });
    return opts;
  }, [environments, t]);

  const boolOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('common.all') },
      { value: 'true', label: t('common.yes') },
      { value: 'false', label: t('common.no') },
    ],
    [t]
  );

  const hvTypeOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('common.all') },
      { value: 'vpsadminos', label: 'vpsAdminOS' },
    ],
    [t]
  );

  const sharesVerOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('admin.cluster.locations.filter.shares_any') },
      { value: '4', label: t('admin.cluster.locations.filter.shares_ipv4') },
      { value: '6', label: t('admin.cluster.locations.filter.shares_ipv6') },
    ],
    [t]
  );

  const sharesWithOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [{ value: '', label: t('common.select') }];
    for (const l of shareLocations) opts.push({ value: String(l.id), label: locLabel(l) });
    return opts;
  }, [shareLocations, t]);

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
    setEnvironment('');
    setHasHypervisor('');
    setHasStorage('');
    setHypervisorType('');
    setSharesWith('');
    setSharesVer('');
    setSharesPrimary('');
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
    let nextEnvironment = environment;
    let nextHasHypervisor = hasHypervisor;
    let nextHasStorage = hasStorage;
    let nextHypervisorType = hypervisorType;
    let nextSharesWith = sharesWith;
    let nextSharesVer = sharesVer;
    let nextSharesPrimary = sharesPrimary;
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
        case 'description':
          nextQ = value;
          break;
        case 'id': {
          const n = parseNumericToken(value);
          if (n === null) errors.push(t('filters.smart.error.numeric_only', { key, value }));
          else nextQ = String(n);
          break;
        }
        case 'environment':
        case 'env': {
          const n = parseNumericToken(value);
          if (n === null) errors.push(t('filters.smart.error.numeric_only', { key, value }));
          else nextEnvironment = String(n);
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
        case 'hv':
        case 'hypervisor_type':
        case 'type':
          nextHypervisorType = value;
          break;
        case 'share':
        case 'shares_with': {
          const n = parseNumericToken(value);
          if (n === null) errors.push(t('filters.smart.error.numeric_only', { key, value }));
          else nextSharesWith = String(n);
          break;
        }
        case 'ver':
        case 'version':
        case 'shares_ver': {
          if (!nextSharesWith && !sharesWithId) {
            errors.push(t('admin.cluster.locations.smart.error.share_required'));
          } else if (value === 'any' || value === 'all') nextSharesVer = '';
          else if (value === '4' || value === '6') nextSharesVer = value;
          else errors.push(t('filters.smart.error.option_unresolved', { key, value }));
          break;
        }
        case 'primary':
        case 'shares_primary': {
          if (!nextSharesWith && !sharesWithId) {
            errors.push(t('admin.cluster.locations.smart.error.share_required'));
          } else if (value === 'all') nextSharesPrimary = '';
          else {
            const b = parseBoolParam(value);
            if (b === undefined) errors.push(t('filters.smart.error.option_unresolved', { key, value }));
            else nextSharesPrimary = b ? 'true' : 'false';
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
    setEnvironment(nextEnvironment);
    setHasHypervisor(nextHasHypervisor);
    setHasStorage(nextHasStorage);
    setHypervisorType(nextHypervisorType);
    setSharesWith(nextSharesWith);
    setSharesVer(nextSharesVer);
    setSharesPrimary(nextSharesPrimary);
  }

  const activeChips = useMemo(() => {
    const chips: React.ReactNode[] = [];
    if (qTrim) chips.push(<FilterChip key="q" label={`q:${qTrim}`} onRemove={() => setQ('')} />);
    if (environmentId) chips.push(<FilterChip key="env" label={`${t('common.environment')}: ${environmentId}`} onRemove={() => setEnvironment('')} />);
    if (hasHypervisorBool === true) chips.push(<FilterChip key="hv-yes" label={t('admin.cluster.locations.smart.chip.hypervisor_yes')} tone="info" onRemove={() => setHasHypervisor('')} />);
    else if (hasHypervisorBool === false) chips.push(<FilterChip key="hv-no" label={t('admin.cluster.locations.smart.chip.hypervisor_no')} tone="warn" onRemove={() => setHasHypervisor('')} />);
    if (hasStorageBool === true) chips.push(<FilterChip key="st-yes" label={t('admin.cluster.locations.smart.chip.storage_yes')} tone="info" onRemove={() => setHasStorage('')} />);
    else if (hasStorageBool === false) chips.push(<FilterChip key="st-no" label={t('admin.cluster.locations.smart.chip.storage_no')} tone="warn" onRemove={() => setHasStorage('')} />);
    if (hvTrim) chips.push(<FilterChip key="hvt" label={`hv:${hvTrim}`} onRemove={() => setHypervisorType('')} />);
    if (sharesWithId) chips.push(<FilterChip key="share" label={`${t('admin.cluster.locations.smart.key.share')}: ${locLabel(shareLocations.find((l) => l.id === sharesWithId))}`} onRemove={() => { setSharesWith(''); setSharesVer(''); setSharesPrimary(''); }} />);
    if (sharesWithId && sharesVersion !== 'any') chips.push(<FilterChip key="ver" label={`${t('admin.cluster.locations.smart.key.ver')}: ${sharesVersion}`} onRemove={() => setSharesVer('')} />);
    if (sharesWithId && sharesPrimaryBool === true) chips.push(<FilterChip key="primary-yes" label={t('admin.cluster.locations.smart.chip.primary_yes')} tone="info" onRemove={() => setSharesPrimary('')} />);
    else if (sharesWithId && sharesPrimaryBool === false) chips.push(<FilterChip key="primary-no" label={t('admin.cluster.locations.smart.chip.primary_no')} tone="warn" onRemove={() => setSharesPrimary('')} />);
    smartErrors.forEach((msg, i) => chips.push(<FilterChip key={`err-${i}`} label={msg} tone="danger" onRemove={() => setSmartErrors((prev) => prev.filter((_, idx) => idx !== i))} />));
    return chips;
  }, [environmentId, hasHypervisorBool, hasStorageBool, hvTrim, qTrim, shareLocations, sharesPrimaryBool, sharesVersion, sharesWithId, smartErrors, t]);

  const smartSuggestions = useMemo<SmartFilterSuggestion[]>(() => {
    const raw = smart.trim();
    if (!raw) return [];
    if (raw === '?') {
      return [{
        id: 'help',
        primary: t('filters.help.open'),
        secondary: t('admin.cluster.locations.smart.help.intro'),
        onPick: () => {
          setHelpOpen(true);
          setSmart('');
        },
      }];
    }

    const suggestions: SmartFilterSuggestion[] = [];
    const numeric = parseNumericToken(raw);
    if (numeric !== null) {
      suggestions.push({
        id: 'id',
        primary: t('admin.cluster.locations.smart.suggestion.id', { id: numeric }),
        secondary: t('admin.cluster.locations.smart.suggestion.id_hint'),
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
      primary: t('admin.cluster.locations.smart.suggestion.search', { value: raw }),
      secondary: t('admin.cluster.locations.smart.suggestion.search_hint'),
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

  const openEdit = (loc: Location) => {
    setEditor({ mode: 'edit', location: loc });
    setForm(initForm(loc));
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
      if (editor.mode === 'create') return createLocation(payload);
      if (!editor.location) throw new Error('Missing location');
      return updateLocation(editor.location.id, payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['cluster.locations'] });
      await qc.invalidateQueries({ queryKey: ['cluster.locations.lookup'] });
      pushToast({
        variant: 'ok',
        title: editor?.mode === 'create' ? t('admin.cluster.locations.toast.created') : t('admin.cluster.locations.toast.saved'),
      });
      closeEditor();
    },
    onError: (e) => {
      pushToast({ variant: 'danger', title: t('common.error'), body: formatErrorMessage(e) });
    },
  });

  if (envQ.isLoading || allLocQ.isLoading || locQ.isLoading) {
    return <LoadingState testId="admin.cluster.locations.loading" />;
  }

  if (envQ.isError || allLocQ.isError || locQ.isError) {
    return (
      <ErrorState
        title={t('admin.cluster.locations.error.title')}
        message={t('admin.cluster.locations.error.body')}
        onRetry={() => {
          void envQ.refetch();
          void allLocQ.refetch();
          void locQ.refetch();
        }}
        testId="admin.cluster.locations.error"
      />
    );
  }

  return (
    <div className="mt-4 space-y-4" data-testid="admin.cluster.locations.page">
      <FilterBar testId="admin.cluster.locations.filters">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <SmartFilterInput
            ref={smartInputRef}
            testId="admin.cluster.locations.search.input"
            value={smart}
            onChange={(v) => {
              setSmart(v);
              if (smartErrors.length) setSmartErrors([]);
            }}
            onSubmit={() => applySmart()}
            placeholder={t('admin.cluster.locations.filter.search_placeholder')}
            ariaLabel={t('admin.cluster.locations.filter.search_placeholder')}
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
          <Button variant="secondary" onClick={() => setAdvancedOpen(true)} testId="admin.cluster.locations.advanced">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            <span>{t('filters.advanced.label')}</span>
          </Button>
          <Button variant="secondary" onClick={() => locQ.refetch()}>
            {t('common.refresh')}
          </Button>
          <CopyButton text={shareUrl} label={t('common.copy_link')} testId="admin.cluster.locations.copy_link" />
          {(qTrim || environment || hasHypervisor || hasStorage || hypervisorType || sharesWith || sharesVer || sharesPrimary || smartErrors.length > 0) ? (
            <Button variant="secondary" onClick={clearAllFilters} testId="admin.cluster.locations.filter.clear">
              {t('common.clear_filters')}
            </Button>
          ) : null}
          <Button onClick={openCreate} testId="admin.cluster.locations.create">
            {t('admin.cluster.locations.create')}
          </Button>
        </div>
      </FilterBar>

      <Drawer
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        width="lg"
        title={t('filters.advanced.title')}
        testId="admin.cluster.locations.advanced.drawer"
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
              testId="admin.cluster.locations.advanced.q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('admin.cluster.locations.filter.search_placeholder')}
            />
          </div>

          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('common.environment')}</div>
            <Select
              testId="admin.cluster.locations.filter.environment"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              options={envOptions}
            />
          </div>

          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('admin.cluster.locations.smart.key.hypervisor')}</div>
            <Select
              testId="admin.cluster.locations.filter.has_hypervisor"
              value={hasHypervisor}
              onChange={(e) => setHasHypervisor(e.target.value)}
              options={boolOptions}
            />
          </div>

          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('admin.cluster.locations.smart.key.storage')}</div>
            <Select
              testId="admin.cluster.locations.filter.has_storage"
              value={hasStorage}
              onChange={(e) => setHasStorage(e.target.value)}
              options={boolOptions}
            />
          </div>

          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('admin.cluster.locations.smart.key.hv')}</div>
            <Select
              testId="admin.cluster.locations.filter.hypervisor_type"
              value={hypervisorType}
              onChange={(e) => setHypervisorType(e.target.value)}
              options={hvTypeOptions}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <div className="mb-1 text-sm font-medium text-fg">{t('admin.cluster.locations.smart.key.share')}</div>
              <Select
                testId="admin.cluster.locations.filter.shares_with"
                value={sharesWith}
                onChange={(e) => setSharesWith(e.target.value)}
                options={sharesWithOptions}
              />
            </div>
            <div>
              <div className="mb-1 text-sm font-medium text-fg">{t('admin.cluster.locations.smart.key.ver')}</div>
              <Select
                testId="admin.cluster.locations.filter.shares_ver"
                value={sharesVer}
                onChange={(e) => setSharesVer(e.target.value)}
                options={sharesVerOptions}
                disabled={!sharesWithId}
              />
            </div>
            <div>
              <div className="mb-1 text-sm font-medium text-fg">{t('admin.cluster.locations.smart.key.primary')}</div>
              <Select
                testId="admin.cluster.locations.filter.shares_primary"
                value={sharesPrimary}
                onChange={(e) => setSharesPrimary(e.target.value)}
                options={boolOptions}
                disabled={!sharesWithId}
              />
            </div>
          </div>
        </div>
      </Drawer>

      <SmartInputHelp
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={t('admin.cluster.locations.smart.help.title')}
        intro={t('admin.cluster.locations.smart.help.intro')}
        examples={[
          { example: '?', description: t('admin.cluster.locations.smart.help.example_help') },
          { example: 'prg', description: t('admin.cluster.locations.smart.help.example_search') },
          { example: 'environment:1', description: t('admin.cluster.locations.smart.help.example_environment') },
          { example: 'hypervisor:true hv:vpsadminos', description: t('admin.cluster.locations.smart.help.example_hv') },
          { example: 'share:2 ver:4 primary:true', description: t('admin.cluster.locations.smart.help.example_share') },
        ]}
        topKeys={[
          { key: 'q', description: t('admin.cluster.locations.smart.key.q'), example: 'q:prg' },
          { key: 'id', description: t('admin.cluster.locations.smart.key.id'), example: 'id:2' },
          { key: 'environment', description: t('admin.cluster.locations.smart.key.environment'), example: 'environment:1' },
          { key: 'hypervisor', description: t('admin.cluster.locations.smart.key.hypervisor'), example: 'hypervisor:true' },
          { key: 'storage', description: t('admin.cluster.locations.smart.key.storage'), example: 'storage:false' },
          { key: 'hv', description: t('admin.cluster.locations.smart.key.hv'), example: 'hv:vpsadminos' },
        ]}
        moreKeys={[
          { key: 'share', description: t('admin.cluster.locations.smart.key.share'), example: 'share:2' },
          { key: 'ver', description: t('admin.cluster.locations.smart.key.ver'), example: 'ver:4' },
          { key: 'primary', description: t('admin.cluster.locations.smart.key.primary'), example: 'primary:true' },
        ]}
        inference={[
          t('admin.cluster.locations.smart.help.inference.text'),
          t('admin.cluster.locations.smart.help.inference.number'),
          t('admin.cluster.locations.smart.help.inference.keyvalue'),
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
        testId="admin.cluster.locations.smart_help"
        keyRowTestIdPrefix="admin.cluster.locations.smart_help.key"
      />

      {locations.length === 0 ? (
        <EmptyState
          title={t('admin.cluster.locations.empty.title')}
          message={t('admin.cluster.locations.empty.body')}
          testId="admin.cluster.locations.empty"
        />
      ) : (
        <TableCard testId="admin.cluster.locations.table" minWidth="lg">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('common.name')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('common.environment')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('common.domain')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('admin.cluster.locations.col.ipv6')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('admin.cluster.locations.col.remote_console')}</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-muted">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((loc) => {
              const desc = typeof loc.description === 'string' ? loc.description.trim() : '';
              const remote = typeof (loc as any).remote_console_server === 'string' ? String((loc as any).remote_console_server).trim() : '';
              const remoteHref = safeAbsoluteHttpUrl(remote);
              const hasIpv6 = Boolean((loc as any).has_ipv6);
              return (
                <tr key={loc.id} data-testid={`admin.cluster.locations.row.${loc.id}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-fg">{locLabel(loc)}</div>
                    {desc ? <div className="mt-0.5 text-xs text-muted">{desc}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-sm">{envLabel((loc as any).environment)}</td>
                  <td className="px-3 py-2 text-sm">{(loc as any).domain || '—'}</td>
                  <td className="px-3 py-2">
                    <Badge variant={hasIpv6 ? 'ok' : 'neutral'}>{hasIpv6 ? t('common.yes') : t('common.no')}</Badge>
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {remoteHref ? (
                      <a className="text-link hover:underline" href={remoteHref} target="_blank" rel="noopener noreferrer">
                        {t('admin.cluster.locations.remote_console_link')}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openEdit(loc)}
                      testId={`admin.cluster.locations.row.${loc.id}.edit`}
                    >
                      {t('common.edit')}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      )}

      <Modal
        open={Boolean(editor)}
        onClose={closeEditor}
        title={editor?.mode === 'create' ? t('admin.cluster.locations.editor.create_title') : t('admin.cluster.locations.editor.edit_title')}
        testId="admin.cluster.locations.editor"
        size="lg"
      >
        <div className="space-y-4">
          {formTouched && payloadInfo.errors.length > 0 ? (
            <Alert variant="warn" title={t('common.validation_error')} testId="admin.cluster.locations.editor.validation">
              {t('admin.cluster.locations.editor.validation_body')}
            </Alert>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="text-sm font-medium text-fg">{t('common.name')}</div>
              <Input
                testId="admin.cluster.locations.editor.label"
                value={form.label}
                onChange={(e) => {
                  setFormTouched(true);
                  setForm((p) => ({ ...p, label: e.target.value }));
                }}
                placeholder={t('admin.cluster.locations.editor.label_placeholder')}
              />
            </div>

            <div>
              <div className="text-sm font-medium text-fg">{t('common.environment')}</div>
              <Select
                testId="admin.cluster.locations.editor.environment"
                value={form.environmentId}
                onChange={(e) => {
                  setFormTouched(true);
                  setForm((p) => ({ ...p, environmentId: e.target.value }));
                }}
                options={[{ value: '', label: t('common.select') }, ...environments.map((e) => ({ value: String(e.id), label: envLabel(e) }))]}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="text-sm font-medium text-fg">{t('common.domain')}</div>
              <Input
                testId="admin.cluster.locations.editor.domain"
                value={form.domain}
                onChange={(e) => {
                  setFormTouched(true);
                  setForm((p) => ({ ...p, domain: e.target.value }));
                }}
                placeholder={t('admin.cluster.locations.editor.domain_placeholder')}
              />
              <div className="mt-1 text-xs text-muted">{t('admin.cluster.locations.editor.domain_help')}</div>
            </div>

            <div>
              <div className="text-sm font-medium text-fg">{t('admin.cluster.locations.editor.remote_console')}</div>
              <Input
                testId="admin.cluster.locations.editor.remote_console"
                value={form.remoteConsoleServer}
                onChange={(e) => {
                  setFormTouched(true);
                  setForm((p) => ({ ...p, remoteConsoleServer: e.target.value }));
                }}
                placeholder="https://…"
              />
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-fg">{t('common.description')}</div>
            <Textarea
              testId="admin.cluster.locations.editor.description"
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
                testId="admin.cluster.locations.editor.has_ipv6"
                label={t('admin.cluster.locations.editor.has_ipv6')}
                checked={form.hasIpv6}
                onChange={(v) => {
                  setFormTouched(true);
                  setForm((p) => ({ ...p, hasIpv6: v }));
                }}
              />
            </CardBody>
          </Card>

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={closeEditor} disabled={saveM.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              testId="admin.cluster.locations.editor.save"
              onClick={() => {
                setFormTouched(true);
                if (canSave) saveM.mutate();
              }}
              disabled={!canSave || saveM.isPending}
            >
              {t('common.save')}
            </Button>
          </div>

          {saveM.isError ? (
            <Alert variant="danger" title={t('common.error')}>
              {formatErrorMessage(saveM.error)}
            </Alert>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
