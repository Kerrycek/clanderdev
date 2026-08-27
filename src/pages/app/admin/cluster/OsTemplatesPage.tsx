import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CircleHelp, SlidersHorizontal } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';
import { formatErrorMessage } from '../../../../lib/errors';
import {
  createOsTemplate,
  deleteOsTemplate,
  fetchOsFamilies,
  fetchOsTemplates,
  updateOsTemplate,
  type OsFamily,
  type OsTemplate,
} from '../../../../lib/api/osTemplates';
import { parseBoolParam, parsePositiveInt } from '../../../../lib/parse';
import { parseNumericToken, splitKeyValueToken, unquoteSmartValue } from '../../../../lib/smartFilter';
import { FilterBar } from '../../../../components/layout/FilterBar';
import { Alert } from '../../../../components/ui/Alert';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { CopyButton } from '../../../../components/ui/CopyButton';
import { Card, CardBody } from '../../../../components/ui/Card';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
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
function osFamilyLabel(f: OsFamily): string {
  const label = typeof (f as any).label === 'string' ? String((f as any).label).trim() : '';
  return label || `#${f.id}`;
}
function tplOsFamilyLabel(tpl: OsTemplate): string {
  const f = (tpl as any).os_family;
  if (!f) return '—';
  if (typeof f === 'string') return f;
  if (typeof f === 'number') return `#${f}`;
  if (typeof f === 'object' && typeof f.id === 'number') {
    const label = typeof (f as any).label === 'string' ? String((f as any).label).trim() : '';
    return label || `#${f.id}`;
  }
  return '—';
}
function boolBadge(v: boolean | undefined, onKey: string, offKey: string, t: (k: string) => string) {
  const b = Boolean(v);
  return {
    label: b ? t(onKey) : t(offKey),
    variant: b ? ('ok' as const) : ('warn' as const),
  };
}
type EditorState =
  | null
  | {
      mode: 'create' | 'edit';
      tpl?: OsTemplate;
    };

type FormState = {
  osFamilyId: string;

  label: string;
  info: string;
  enabled: boolean;
  supported: boolean;
  order: string;

  hypervisorType: string;
  cgroupVersion: string;

  manageHostname: boolean;
  manageDnsResolver: boolean;
  enableScript: boolean;
  enableCloudInit: boolean;

  vendor: string;
  variant: string;
  arch: string;
  distribution: string;
  version: string;

  config: string;
};

function initForm(tpl?: OsTemplate): FormState {
  const f: any = tpl ?? {};

  const osFamilyId =
    typeof f.os_family === 'number'
      ? String(f.os_family)
      : typeof f.os_family?.id === 'number'
        ? String(f.os_family.id)
        : '';

  return {
    osFamilyId,

    label: typeof f.label === 'string' ? f.label : '',
    info: typeof f.info === 'string' ? f.info : '',
    enabled: typeof f.enabled === 'boolean' ? f.enabled : true,
    supported: typeof f.supported === 'boolean' ? f.supported : true,
    order: typeof f.order === 'number' ? String(f.order) : '1',

    hypervisorType: typeof f.hypervisor_type === 'string' ? f.hypervisor_type : 'vpsadminos',
    cgroupVersion: typeof f.cgroup_version === 'string' ? f.cgroup_version : 'cgroup_any',

    manageHostname: typeof f.manage_hostname === 'boolean' ? f.manage_hostname : true,
    manageDnsResolver: typeof f.manage_dns_resolver === 'boolean' ? f.manage_dns_resolver : true,
    enableScript: typeof f.enable_script === 'boolean' ? f.enable_script : true,
    enableCloudInit: typeof f.enable_cloud_init === 'boolean' ? f.enable_cloud_init : true,

    vendor: typeof f.vendor === 'string' ? f.vendor : '',
    variant: typeof f.variant === 'string' ? f.variant : '',
    arch: typeof f.arch === 'string' ? f.arch : '',
    distribution: typeof f.distribution === 'string' ? f.distribution : '',
    version: typeof f.version === 'string' ? f.version : '',

    config: typeof f.config === 'string' ? f.config : '',
  };
}

function buildPayload(form: FormState) {
  const osFamilyId = parsePositiveInt(form.osFamilyId.trim());
  const order = parsePositiveInt(form.order.trim());

  const payload: Record<string, unknown> = {
    os_family: osFamilyId,
    label: form.label.trim(),
    info: form.info.trim() || undefined,
    enabled: form.enabled,
    supported: form.supported,
    order: order ?? 1,

    hypervisor_type: form.hypervisorType,
    cgroup_version: form.cgroupVersion,

    manage_hostname: form.manageHostname,
    manage_dns_resolver: form.manageDnsResolver,
    enable_script: form.enableScript,
    enable_cloud_init: form.enableCloudInit,

    vendor: form.vendor.trim() || undefined,
    variant: form.variant.trim() || undefined,
    arch: form.arch.trim() || undefined,
    distribution: form.distribution.trim() || undefined,
    version: form.version.trim() || undefined,

    config: form.config,
  };

  return payload;
}

export function OsTemplatesPage() {
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const smartInputRef = useRef<HTMLInputElement | null>(null);

  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const [osFamily, setOsFamily] = useState(() => searchParams.get('os_family') ?? '');
  const [enabled, setEnabled] = useState(() => searchParams.get('enabled') ?? '');
  const [supported, setSupported] = useState(() => searchParams.get('supported') ?? '');
  const [hypervisorType, setHypervisorType] = useState(() => searchParams.get('hypervisor_type') ?? '');
  const [cgroupVersion, setCgroupVersion] = useState(() => searchParams.get('cgroup_version') ?? '');
  const [enableScript, setEnableScript] = useState(() => searchParams.get('enable_script') ?? '');
  const [enableCloudInit, setEnableCloudInit] = useState(() => searchParams.get('enable_cloud_init') ?? '');
  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Sync local state on browser navigation.
  useEffect(() => {
    const urlQ = searchParams.get('q') ?? '';
    const urlFam = searchParams.get('os_family') ?? '';
    const urlEnabled = searchParams.get('enabled') ?? '';
    const urlSupported = searchParams.get('supported') ?? '';
    const urlHv = searchParams.get('hypervisor_type') ?? '';
    const urlCg = searchParams.get('cgroup_version') ?? '';
    const urlEs = searchParams.get('enable_script') ?? '';
    const urlCi = searchParams.get('enable_cloud_init') ?? '';

    if (urlQ !== q) setQ(urlQ);
    if (urlFam !== osFamily) setOsFamily(urlFam);
    if (urlEnabled !== enabled) setEnabled(urlEnabled);
    if (urlSupported !== supported) setSupported(urlSupported);
    if (urlHv !== hypervisorType) setHypervisorType(urlHv);
    if (urlCg !== cgroupVersion) setCgroupVersion(urlCg);
    if (urlEs !== enableScript) setEnableScript(urlEs);
    if (urlCi !== enableCloudInit) setEnableCloudInit(urlCi);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const qTrim = useMemo(() => q.trim(), [q]);
  const osFamilyId = useMemo(() => parsePositiveInt(osFamily.trim()), [osFamily]);
  const enabledBool = useMemo(() => parseBoolParam(enabled), [enabled]);
  const supportedBool = useMemo(() => parseBoolParam(supported), [supported]);
  const hvTrim = useMemo(() => hypervisorType.trim(), [hypervisorType]);
  const cgTrim = useMemo(() => cgroupVersion.trim(), [cgroupVersion]);
  const enableScriptBool = useMemo(() => parseBoolParam(enableScript), [enableScript]);
  const enableCloudInitBool = useMemo(() => parseBoolParam(enableCloudInit), [enableCloudInit]);

  // Persist filters in URL (shareable).
  useEffect(() => {
    const next = new URLSearchParams(searchParams);

    if (qTrim) next.set('q', qTrim);
    else next.delete('q');

    if (osFamilyId) next.set('os_family', String(osFamilyId));
    else if (!osFamily.trim()) next.delete('os_family');

    if (enabledBool === true) next.set('enabled', 'true');
    else if (enabledBool === false) next.set('enabled', 'false');
    else next.delete('enabled');

    if (supportedBool === true) next.set('supported', 'true');
    else if (supportedBool === false) next.set('supported', 'false');
    else next.delete('supported');

    if (hvTrim) next.set('hypervisor_type', hvTrim);
    else next.delete('hypervisor_type');

    if (cgTrim) next.set('cgroup_version', cgTrim);
    else next.delete('cgroup_version');

    if (enableScriptBool === true) next.set('enable_script', 'true');
    else if (enableScriptBool === false) next.set('enable_script', 'false');
    else next.delete('enable_script');

    if (enableCloudInitBool === true) next.set('enable_cloud_init', 'true');
    else if (enableCloudInitBool === false) next.set('enable_cloud_init', 'false');
    else next.delete('enable_cloud_init');

    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [
    cgTrim,
    enableCloudInitBool,
    enableScriptBool,
    enabledBool,
    hvTrim,
    osFamilyId,
    osFamily,
    qTrim,
    searchParams,
    setSearchParams,
    supportedBool,
  ]);

  const familiesQ = useQuery({
    queryKey: ['os_families', 'index'],
    queryFn: async () => (await fetchOsFamilies({ limit: 500 })).data,
    staleTime: 60_000,
  });

  const listQ = useQuery({
    queryKey: [
      'os_templates',
      'index',
      {
        q: qTrim,
        osFamilyId,
        enabled: enabledBool,
        supported: supportedBool,
        hv: hvTrim,
        cg: cgTrim,
        enableScript: enableScriptBool,
        enableCloudInit: enableCloudInitBool,
      },
    ],
    queryFn: async () =>
      (
        await fetchOsTemplates({
          limit: 500,
          q: qTrim || undefined,
          osFamily: osFamilyId,
          enabled: enabledBool,
          supported: supportedBool,
          hypervisorType: hvTrim || undefined,
          cgroupVersion: cgTrim || undefined,
          enableScript: enableScriptBool,
          enableCloudInit: enableCloudInitBool,
        })
      ).data,
    staleTime: 15_000,
  });

  const rows: OsTemplate[] = listQ.data ?? [];
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
    setOsFamily('');
    setEnabled('');
    setSupported('');
    setHypervisorType('');
    setCgroupVersion('');
    setEnableScript('');
    setEnableCloudInit('');
  }

  function applySmart(rawInput?: string) {
    const raw = String(rawInput ?? smart).trim();
    if (!raw) return;
    if (raw === '?') {
      setHelpOpen(true);
      return;
    }

    const tokens = raw.match(/\S+/g) ?? [];
    let nextQ = qTrim;
    let nextFamily = osFamily;
    let nextEnabled = enabled;
    let nextSupported = supported;
    let nextHv = hypervisorType;
    let nextCg = cgroupVersion;
    let nextScript = enableScript;
    let nextCloudInit = enableCloudInit;
    const errors: string[] = [];

    for (const token of tokens) {
      const kv = splitKeyValueToken(token);
      if (!kv) {
        const n = parseNumericToken(token);
        if (n !== undefined) nextQ = String(n);
        else nextQ = unquoteSmartValue(token);
        continue;
      }
      const key = kv.key.trim().toLowerCase();
      const value = unquoteSmartValue(kv.value).trim();
      if (!value) {
        errors.push(t('filters.smart.error.missing_value', { key }));
        continue;
      }
      switch (key) {
        case 'q':
        case 'search':
        case 'label':
        case 'name':
          nextQ = value;
          break;
        case 'id': {
          const n = parseNumericToken(value);
          if (n === undefined) errors.push(t('filters.smart.error.numeric_only', { key, value }));
          else nextQ = String(n);
          break;
        }
        case 'family':
        case 'os_family': {
          const n = parseNumericToken(value);
          if (n === undefined) errors.push(t('filters.smart.error.numeric_only', { key, value }));
          else nextFamily = String(n);
          break;
        }
        case 'enabled': {
          const b = parseBoolParam(value);
          if (b === undefined) errors.push(t('filters.smart.error.option_unresolved', { key, value }));
          else nextEnabled = b ? 'true' : 'false';
          break;
        }
        case 'supported': {
          const b = parseBoolParam(value);
          if (b === undefined) errors.push(t('filters.smart.error.option_unresolved', { key, value }));
          else nextSupported = b ? 'true' : 'false';
          break;
        }
        case 'hv':
        case 'hypervisor':
        case 'hypervisor_type':
          nextHv = value;
          break;
        case 'cgroup':
        case 'cgroup_version':
          nextCg = value;
          break;
        case 'script':
        case 'enable_script': {
          const b = parseBoolParam(value);
          if (b === undefined) errors.push(t('filters.smart.error.option_unresolved', { key, value }));
          else nextScript = b ? 'true' : 'false';
          break;
        }
        case 'cloudinit':
        case 'enable_cloud_init': {
          const b = parseBoolParam(value);
          if (b === undefined) errors.push(t('filters.smart.error.option_unresolved', { key, value }));
          else nextCloudInit = b ? 'true' : 'false';
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
    setOsFamily(nextFamily);
    setEnabled(nextEnabled);
    setSupported(nextSupported);
    setHypervisorType(nextHv);
    setCgroupVersion(nextCg);
    setEnableScript(nextScript);
    setEnableCloudInit(nextCloudInit);
  }

  const familyOptions: SelectOption[] = useMemo(() => {
    const opts: SelectOption[] = [{ value: '', label: t('common.all') }];
    const fams = familiesQ.data ?? [];
    for (const f of fams) {
      if (typeof f.id !== 'number') continue;
      opts.push({ value: String(f.id), label: osFamilyLabel(f) });
    }
    return opts;
  }, [familiesQ.data, t]);

  const triBoolOptions: SelectOption[] = useMemo(
    () => [
      { value: '', label: t('common.all') },
      { value: 'true', label: t('common.yes') },
      { value: 'false', label: t('common.no') },
    ],
    [t]
  );

  const hypervisorOptions: SelectOption[] = useMemo(
    () => [
      { value: '', label: t('common.all') },
      { value: 'vpsadminos', label: 'vpsadminos' },
      { value: 'openvz', label: 'openvz' },
    ],
    [t]
  );

  const cgroupOptions: SelectOption[] = useMemo(
    () => [
      { value: '', label: t('common.all') },
      { value: 'cgroup_any', label: 'cgroup_any' },
      { value: 'cgroup_v1', label: 'cgroup_v1' },
      { value: 'cgroup_v2', label: 'cgroup_v2' },
    ],
    [t]
  );

  const activeChips = useMemo(() => {
    const chips: React.ReactNode[] = [];
    if (qTrim) chips.push(<FilterChip key="q" label={`q:${qTrim}`} onRemove={() => setQ('')} />);
    if (osFamilyId) chips.push(<FilterChip key="fam" label={`${t('admin.cluster.os_templates.form.os_family')}: ${osFamilyId}`} onRemove={() => setOsFamily('')} />);
    if (enabledBool === true) chips.push(<FilterChip key="en-t" label={t('common.enabled')} tone="ok" onRemove={() => setEnabled('')} />);
    if (enabledBool === false) chips.push(<FilterChip key="en-f" label={t('common.disabled')} tone="warn" onRemove={() => setEnabled('')} />);
    if (supportedBool === true) chips.push(<FilterChip key="sup-t" label={t('common.supported')} tone="ok" onRemove={() => setSupported('')} />);
    if (supportedBool === false) chips.push(<FilterChip key="sup-f" label={t('common.unsupported')} tone="warn" onRemove={() => setSupported('')} />);
    if (hvTrim) chips.push(<FilterChip key="hv" label={`hv:${hvTrim}`} onRemove={() => setHypervisorType('')} />);
    if (cgTrim) chips.push(<FilterChip key="cg" label={`cgroup:${cgTrim}`} onRemove={() => setCgroupVersion('')} />);
    if (enableScriptBool === true) chips.push(<FilterChip key="script-t" label={t('admin.cluster.os_templates.form.enable_script')} tone="info" onRemove={() => setEnableScript('')} />);
    if (enableScriptBool === false) chips.push(<FilterChip key="script-f" label={`${t('admin.cluster.os_templates.form.enable_script')}: ${t('common.no')}`} tone="warn" onRemove={() => setEnableScript('')} />);
    if (enableCloudInitBool === true) chips.push(<FilterChip key="ci-t" label={t('admin.cluster.os_templates.form.enable_cloud_init')} tone="info" onRemove={() => setEnableCloudInit('')} />);
    if (enableCloudInitBool === false) chips.push(<FilterChip key="ci-f" label={`${t('admin.cluster.os_templates.form.enable_cloud_init')}: ${t('common.no')}`} tone="warn" onRemove={() => setEnableCloudInit('')} />);
    smartErrors.forEach((msg, i) => chips.push(<FilterChip key={`err-${i}`} label={msg} tone="danger" onRemove={() => setSmartErrors((prev) => prev.filter((_, idx) => idx !== i))} />));
    return chips;
  }, [cgTrim, enableCloudInitBool, enableScriptBool, enabledBool, hvTrim, osFamilyId, qTrim, smartErrors, supportedBool, t]);

  const smartSuggestions = useMemo<SmartFilterSuggestion[]>(() => {
    const raw = smart.trim();
    if (!raw) return [];
    if (raw === '?') {
      return [{ id: 'help', primary: t('filters.help.open'), secondary: t('admin.cluster.os_templates.smart.help.intro'), onPick: () => { setHelpOpen(true); setSmart(''); } }];
    }
    const suggestions: SmartFilterSuggestion[] = [];
    const numeric = parseNumericToken(raw);
    if (numeric !== undefined) {
      suggestions.push({ id: 'id', primary: t('admin.cluster.os_templates.smart.suggestion.id', { id: numeric }), secondary: t('admin.cluster.os_templates.smart.suggestion.id_hint'), onPick: () => { setQ(String(numeric)); setSmart(''); setSmartErrors([]); } });
    }
    const kv = splitKeyValueToken(raw);
    if (kv) {
      suggestions.push({ id: 'apply', primary: t('filters.smart.suggest.apply.primary'), secondary: raw, onPick: () => applySmart(raw) });
      return suggestions;
    }
    suggestions.push({ id: 'search', primary: t('admin.cluster.os_templates.smart.suggestion.search', { value: raw }), secondary: t('admin.cluster.os_templates.smart.suggestion.search_hint'), onPick: () => { setQ(raw); setSmart(''); setSmartErrors([]); } });
    return suggestions;
  }, [smart, t]);

  const [editor, setEditor] = useState<EditorState>(null);
  const [form, setForm] = useState<FormState>(() => initForm(undefined));
  const [actionError, setActionError] = useState<string | null>(null);

  const openCreate = () => {
    setActionError(null);
    setForm(initForm(undefined));
    setEditor({ mode: 'create' });
  };

  const openEdit = (tpl: OsTemplate) => {
    setActionError(null);
    setForm(initForm(tpl));
    setEditor({ mode: 'edit', tpl });
  };

  const closeEditor = () => {
    setEditor(null);
    setActionError(null);
  };

  const saveM = useMutation({
    mutationFn: async () => {
      if (!editor) return;

      const payload = buildPayload(form);

      if (editor.mode === 'create') {
        return createOsTemplate(payload);
      }

      if (!editor.tpl || typeof editor.tpl.id !== 'number') {
        throw new Error('missing template id');
      }

      return updateOsTemplate(editor.tpl.id, payload);
    },
    onSuccess: () => {
      setActionError(null);
      closeEditor();
      void qc.invalidateQueries({ queryKey: ['os_templates', 'index'] });
    },
    onError: (err) => {
      setActionError(formatErrorMessage(err));
    },
  });

  const [confirmDelete, setConfirmDelete] = useState<null | { tpl: OsTemplate }>(null);

  const deleteM = useMutation({
    mutationFn: async () => {
      if (!confirmDelete) return;
      await deleteOsTemplate(confirmDelete.tpl.id);
    },
    onSuccess: () => {
      setConfirmDelete(null);
      void qc.invalidateQueries({ queryKey: ['os_templates', 'index'] });
    },
    onError: (err) => {
      setActionError(formatErrorMessage(err));
    },
  });

  const modalTitle = editor?.mode === 'create' ? t('admin.cluster.os_templates.create.title') : t('admin.cluster.os_templates.edit.title');

  const requiresFamily = editor?.mode === 'create';
  const osFamilyOk = !requiresFamily || Boolean(parsePositiveInt(form.osFamilyId.trim()));

  const requiredLabelOk = Boolean(form.label.trim());

  const requiredCreateOk =
    editor?.mode !== 'create'
      ? true
      : Boolean(form.vendor.trim()) && Boolean(form.variant.trim()) && Boolean(form.arch.trim()) && Boolean(form.distribution.trim()) && Boolean(form.version.trim());

  const canSave = osFamilyOk && requiredLabelOk && requiredCreateOk && !saveM.isPending;

  const rowsEmpty = rows.length === 0 && !listQ.isLoading && !listQ.isError;

  return (
    <div className="mt-4 space-y-4" data-testid="admin.cluster.os_templates.page">
      {actionError ? (
        <Alert title={t('common.error')} variant="danger">
          {actionError}
        </Alert>
      ) : null}

      <FilterBar testId="admin.cluster.os_templates.filters">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <SmartFilterInput
            ref={smartInputRef}
            testId="admin.cluster.os_templates.filter.q"
            value={smart}
            onChange={setSmart}
            onSubmit={() => applySmart()}
            placeholder={t('admin.cluster.os_templates.filter.search_placeholder')}
            ariaLabel={t('admin.cluster.os_templates.filter.search_placeholder')}
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
          <Button variant="secondary" onClick={() => setAdvancedOpen(true)} testId="admin.cluster.os_templates.advanced">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            <span>{t('filters.advanced.label')}</span>
          </Button>
          <CopyButton text={shareUrl} label={t('common.copy_link')} testId="admin.cluster.os_templates.copy_link" />
          {(qTrim || osFamily || enabled || supported || hypervisorType || cgroupVersion || enableScript || enableCloudInit || smartErrors.length > 0) ? (
            <Button variant="secondary" onClick={clearAllFilters} testId="admin.cluster.os_templates.filter.clear">{t('common.clear_filters')}</Button>
          ) : null}
          <Button testId="admin.cluster.os_templates.create" variant="primary" onClick={openCreate}>
            {t('admin.cluster.os_templates.create.button')}
          </Button>
        </div>
      </FilterBar>

      <Drawer
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        width="lg"
        title={t('filters.advanced.title')}
        testId="admin.cluster.os_templates.advanced.drawer"
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
            <Input testId="admin.cluster.os_templates.advanced.q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.cluster.os_templates.filter.search_placeholder')} />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('admin.cluster.os_templates.form.os_family')}</div>
            <Select testId="admin.cluster.os_templates.filter.os_family" value={osFamily} onChange={(e) => setOsFamily(e.target.value)} options={familyOptions} />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('admin.cluster.os_templates.form.enabled')}</div>
            <Select testId="admin.cluster.os_templates.filter.enabled" value={enabled} onChange={(e) => setEnabled(e.target.value)} options={triBoolOptions} />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('admin.cluster.os_templates.form.supported')}</div>
            <Select testId="admin.cluster.os_templates.filter.supported" value={supported} onChange={(e) => setSupported(e.target.value)} options={triBoolOptions} />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('admin.cluster.os_templates.form.hypervisor_type')}</div>
            <Select testId="admin.cluster.os_templates.filter.hypervisor" value={hypervisorType} onChange={(e) => setHypervisorType(e.target.value)} options={hypervisorOptions} />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('admin.cluster.os_templates.form.cgroup_version')}</div>
            <Select testId="admin.cluster.os_templates.filter.cgroup" value={cgroupVersion} onChange={(e) => setCgroupVersion(e.target.value)} options={cgroupOptions} />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('admin.cluster.os_templates.form.enable_script')}</div>
            <Select testId="admin.cluster.os_templates.filter.enable_script" value={enableScript} onChange={(e) => setEnableScript(e.target.value)} options={triBoolOptions} />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('admin.cluster.os_templates.form.enable_cloud_init')}</div>
            <Select testId="admin.cluster.os_templates.filter.enable_cloud_init" value={enableCloudInit} onChange={(e) => setEnableCloudInit(e.target.value)} options={triBoolOptions} />
          </div>
        </div>
      </Drawer>

      <SmartInputHelp
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={t('admin.cluster.os_templates.smart.help.title')}
        intro={t('admin.cluster.os_templates.smart.help.intro')}
        examples={[
          { example: '?', description: t('admin.cluster.os_templates.smart.help.example_help') },
          { example: 'debian', description: t('admin.cluster.os_templates.smart.help.example_search') },
          { example: 'enabled:true supported:true', description: t('admin.cluster.os_templates.smart.help.example_flags') },
          { example: 'family:1', description: t('admin.cluster.os_templates.smart.help.example_family') },
        ]}
        topKeys={[
          { key: 'q', description: t('admin.cluster.os_templates.smart.key.q'), example: 'q:debian' },
          { key: 'family', description: t('admin.cluster.os_templates.smart.key.family'), example: 'family:1' },
          { key: 'enabled', description: t('admin.cluster.os_templates.smart.key.enabled'), example: 'enabled:true' },
          { key: 'supported', description: t('admin.cluster.os_templates.smart.key.supported'), example: 'supported:true' },
          { key: 'hv', description: t('admin.cluster.os_templates.smart.key.hv'), example: 'hv:vpsadminos' },
          { key: 'cgroup', description: t('admin.cluster.os_templates.smart.key.cgroup'), example: 'cgroup:cgroup_v2' },
          { key: 'script', description: t('admin.cluster.os_templates.smart.key.script'), example: 'script:false' },
          { key: 'cloudinit', description: t('admin.cluster.os_templates.smart.key.cloudinit'), example: 'cloudinit:true' },
        ]}
        inference={[
          t('admin.cluster.os_templates.smart.help.inference.text'),
          t('admin.cluster.os_templates.smart.help.inference.number'),
          t('admin.cluster.os_templates.smart.help.inference.keyvalue'),
        ]}
        onInsertKey={insertSmartKey}
        testId="admin.cluster.os_templates.smart.help"
        keyRowTestIdPrefix="admin.cluster.os_templates.smart.help.key"
      />

      {listQ.isLoading ? <LoadingState testId="admin.cluster.os_templates.loading" /> : null}

      {listQ.isError ? (
        <ErrorState
          testId="admin.cluster.os_templates.error"
          title={t('admin.cluster.os_templates.error.title')}
          message={t('admin.cluster.os_templates.error.body')}
          onRetry={() => listQ.refetch()}
        />
      ) : null}

      {rowsEmpty ? <EmptyState title={t('admin.cluster.os_templates.empty.title')} message={t('admin.cluster.os_templates.empty.body')} /> : null}

      {!listQ.isLoading && !listQ.isError && rows.length > 0 ? (
        <TableCard testId="admin.cluster.os_templates.table">
          <thead>
            <tr>
              <th className="w-1/3">{t('admin.cluster.os_templates.col.label')}</th>
              <th className="w-48">{t('admin.cluster.os_templates.col.family')}</th>
              <th className="w-24">{t('admin.cluster.os_templates.col.enabled')}</th>
              <th className="w-24">{t('admin.cluster.os_templates.col.supported')}</th>
              <th className="w-20">{t('admin.cluster.os_templates.col.uses')}</th>
              <th className="w-20">{t('admin.cluster.os_templates.col.order')}</th>
              <th className="w-44" />
            </tr>
          </thead>
          <tbody>
            {rows.map((tpl) => {
              const label = typeof tpl.label === 'string' ? tpl.label : `#${tpl.id}`;
              const dist = typeof tpl.distribution === 'string' ? tpl.distribution : '';
              const version = typeof tpl.version === 'string' ? tpl.version : '';
              const name = typeof tpl.name === 'string' ? tpl.name : '';
              const usesCount = typeof (tpl as any).uses_count === 'number' ? (tpl as any).uses_count : undefined;

              const enabledBadge = boolBadge(tpl.enabled, 'common.enabled', 'common.disabled', t);
              const supportedBadge = boolBadge(tpl.supported, 'common.supported', 'common.unsupported', t);

              const canDelete = !usesCount || usesCount <= 0;

              return (
                <tr key={tpl.id}>
                  <td className="min-w-0">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{label}</div>
                      <div className="mt-0.5 text-xs text-muted truncate">
                        {dist && version ? `${dist} ${version}` : name || '—'}
                      </div>
                    </div>
                  </td>
                  <td>{tplOsFamilyLabel(tpl)}</td>
                  <td>
                    <Badge variant={enabledBadge.variant}>{enabledBadge.label}</Badge>
                  </td>
                  <td>
                    <Badge variant={supportedBadge.variant}>{supportedBadge.label}</Badge>
                  </td>
                  <td className="tabular-nums">{usesCount !== undefined ? usesCount : '—'}</td>
                  <td className="tabular-nums">{typeof tpl.order === 'number' ? tpl.order : '—'}</td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        testId={`admin.cluster.os_templates.row.${tpl.id}.edit`}
                        variant="secondary"
                        size="sm"
                        onClick={() => openEdit(tpl)}
                      >
                        {t('common.edit')}
                      </Button>
                      <Button
                        testId={`admin.cluster.os_templates.row.${tpl.id}.delete`}
                        variant="danger"
                        size="sm"
                        disabled={!canDelete}
                        title={!canDelete ? t('admin.cluster.os_templates.delete.blocked') : undefined}
                        onClick={() => setConfirmDelete({ tpl })}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      ) : null}

      <Modal
        open={Boolean(editor)}
        title={modalTitle}
        onClose={closeEditor}
        size="lg"
        testId="admin.cluster.os_templates.editor"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={closeEditor} disabled={saveM.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => saveM.mutate()}
              loading={saveM.isPending}
              disabled={!canSave}
              testId="admin.cluster.os_templates.editor.save"
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        {actionError ? (
          <Alert title={t('common.error')} variant="danger">
            {actionError}
          </Alert>
        ) : null}

        <div className={actionError ? 'mt-4 space-y-4' : 'space-y-4'}>
          <Card>
            <CardBody>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">{t('admin.cluster.os_templates.form.label')}</label>
                  <div className="mt-1">
                    <Input
                      testId="admin.cluster.os_templates.editor.label"
                      value={form.label}
                      onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                      placeholder={t('admin.cluster.os_templates.form.label_placeholder')}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">{t('admin.cluster.os_templates.form.os_family')}</label>
                  <div className="mt-1">
                    <Select
                      value={form.osFamilyId}
                      onChange={(e) => setForm((p) => ({ ...p, osFamilyId: e.target.value }))}
                      options={[{ value: '', label: t('common.select') }, ...familyOptions.filter((o) => o.value !== '')]}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">{t('admin.cluster.os_templates.form.order')}</label>
                  <div className="mt-1">
                    <Input
                      type="number"
                      value={form.order}
                      onChange={(e) => setForm((p) => ({ ...p, order: e.target.value }))}
                      placeholder="1"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">{t('admin.cluster.os_templates.form.hypervisor_type')}</label>
                  <div className="mt-1">
                    <Select
                      value={form.hypervisorType}
                      onChange={(e) => setForm((p) => ({ ...p, hypervisorType: e.target.value }))}
                      options={hypervisorOptions.filter((o) => o.value !== '')}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">{t('admin.cluster.os_templates.form.cgroup_version')}</label>
                  <div className="mt-1">
                    <Select
                      value={form.cgroupVersion}
                      onChange={(e) => setForm((p) => ({ ...p, cgroupVersion: e.target.value }))}
                      options={cgroupOptions.filter((o) => o.value !== '')}
                    />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="text-sm font-medium">{t('admin.cluster.os_templates.form.info')}</label>
                  <div className="mt-1">
                    <Textarea
                      value={form.info}
                      rows={3}
                      onChange={(e) => setForm((p) => ({ ...p, info: e.target.value }))}
                      placeholder={t('admin.cluster.os_templates.form.info_placeholder')}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-2">
                <SwitchRow
                  label={t('admin.cluster.os_templates.form.enabled')}
                  description={t('admin.cluster.os_templates.form.enabled_desc')}
                  checked={form.enabled}
                  onChange={(checked) => setForm((p) => ({ ...p, enabled: checked }))}
                />
                <SwitchRow
                  label={t('admin.cluster.os_templates.form.supported')}
                  description={t('admin.cluster.os_templates.form.supported_desc')}
                  checked={form.supported}
                  onChange={(checked) => setForm((p) => ({ ...p, supported: checked }))}
                />
                <SwitchRow
                  label={t('admin.cluster.os_templates.form.manage_hostname')}
                  description={t('admin.cluster.os_templates.form.manage_hostname_desc')}
                  checked={form.manageHostname}
                  onChange={(checked) => setForm((p) => ({ ...p, manageHostname: checked }))}
                />
                <SwitchRow
                  label={t('admin.cluster.os_templates.form.manage_dns_resolver')}
                  description={t('admin.cluster.os_templates.form.manage_dns_resolver_desc')}
                  checked={form.manageDnsResolver}
                  onChange={(checked) => setForm((p) => ({ ...p, manageDnsResolver: checked }))}
                />
                <SwitchRow
                  label={t('admin.cluster.os_templates.form.enable_script')}
                  description={t('admin.cluster.os_templates.form.enable_script_desc')}
                  checked={form.enableScript}
                  onChange={(checked) => setForm((p) => ({ ...p, enableScript: checked }))}
                />
                <SwitchRow
                  label={t('admin.cluster.os_templates.form.enable_cloud_init')}
                  description={t('admin.cluster.os_templates.form.enable_cloud_init_desc')}
                  checked={form.enableCloudInit}
                  onChange={(checked) => setForm((p) => ({ ...p, enableCloudInit: checked }))}
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">{t('admin.cluster.os_templates.form.vendor')}</label>
                  <div className="mt-1">
                    <Input value={form.vendor} onChange={(e) => setForm((p) => ({ ...p, vendor: e.target.value }))} />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">{t('admin.cluster.os_templates.form.variant')}</label>
                  <div className="mt-1">
                    <Input value={form.variant} onChange={(e) => setForm((p) => ({ ...p, variant: e.target.value }))} />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">{t('admin.cluster.os_templates.form.arch')}</label>
                  <div className="mt-1">
                    <Input value={form.arch} onChange={(e) => setForm((p) => ({ ...p, arch: e.target.value }))} />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">{t('admin.cluster.os_templates.form.distribution')}</label>
                  <div className="mt-1">
                    <Input
                      value={form.distribution}
                      onChange={(e) => setForm((p) => ({ ...p, distribution: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">{t('admin.cluster.os_templates.form.version')}</label>
                  <div className="mt-1">
                    <Input value={form.version} onChange={(e) => setForm((p) => ({ ...p, version: e.target.value }))} />
                  </div>
                </div>
              </div>

              {editor?.mode === 'create' ? (
                <div className="mt-3 text-xs text-muted">
                  {t('admin.cluster.os_templates.form.create_required_hint')}
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <label className="text-sm font-medium">{t('admin.cluster.os_templates.form.config')}</label>
              <div className="mt-1">
                <Textarea
                  value={form.config}
                  rows={10}
                  onChange={(e) => setForm((p) => ({ ...p, config: e.target.value }))}
                  placeholder={t('admin.cluster.os_templates.form.config_placeholder')}
                  className="font-mono text-xs"
                />
              </div>
              <div className="mt-2 text-xs text-muted">{t('admin.cluster.os_templates.form.config_hint')}</div>
            </CardBody>
          </Card>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => deleteM.mutate()}
        confirmLoading={deleteM.isPending}
        danger
        title={t('admin.cluster.os_templates.delete.title')}
        description={
          confirmDelete
            ? t('admin.cluster.os_templates.delete.desc', {
                label: typeof confirmDelete.tpl.label === 'string' ? confirmDelete.tpl.label : `#${confirmDelete.tpl.id}`,
              })
            : undefined
        }
        testId="admin.cluster.os_templates.delete"
      />
    </div>
  );
}
