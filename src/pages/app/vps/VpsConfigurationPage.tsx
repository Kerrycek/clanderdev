import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../../app/auth';
import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { useChrome } from '../../../components/layout/ChromeContext';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { Checkbox } from '../../../components/ui/Checkbox';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Input } from '../../../components/ui/Input';
import { Select, type SelectOption } from '../../../components/ui/Select';
import { Spinner } from '../../../components/ui/Spinner';
import { UserLookupInput } from '../../../components/ui/UserLookupInput';
import { fetchDnsResolvers } from '../../../lib/api/dnsResolvers';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import { fetchUserNamespaceMaps } from '../../../lib/api/userNamespaces';
import { updateVps } from '../../../lib/api/vps';
import { gateVpsMutation } from '../../../lib/gates/vps';
import { preflightVpsNotBusy } from './vpsPreflight';
import { useVps } from './VpsContext';
import {
  ADMIN_LOCK_TYPES,
  CONFIG_FIELD_META,
  START_MENU_TIMEOUT_MAX,
  buildPayload,
  createBuildErrorResult,
  currentResourceLabel,
  dnsResolverLabel,
  ensureCurrentOption,
  normalizeDraft,
  resourceId,
  userNamespaceMapLabel,
  type CgroupVersion,
  type VpsConfigDraft,
  type VpsConfigReviewKey,
} from './VpsConfigurationModel';
import { parseVpsConfigFieldErrors, type VpsConfigFieldError } from './VpsConfigurationErrors';
import { buildChangeSummaries, getReviewRequestOptionKeys } from './VpsConfigurationReviewModel';
import {
  Field,
  VpsConfigChangesList,
  VpsConfigFieldErrorsAlert,
  VpsConfigReviewPanel,
  VpsConfigSectionCard,
} from './VpsConfigurationPrimitives';

function optionLabel(options: readonly SelectOption[], value: string, fallback: string): string {
  if (!value) return fallback;
  return options.find((option) => option.value === value)?.label ?? `#${value}`;
}

function compactIdLabel(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed ? `#${trimmed}` : fallback;
}

function mergeFieldErrorMessages(args: {
  key: VpsConfigReviewKey;
  apiErrors: readonly VpsConfigFieldError[];
  validationFieldKey?: VpsConfigReviewKey;
  validationError: string | null;
}): string[] {
  const messages = args.apiErrors.filter((error) => error.key === args.key).flatMap((error) => error.messages);
  if (args.validationFieldKey === args.key && args.validationError) messages.push(args.validationError);
  return [...new Set(messages)];
}

export function VpsConfigurationPage() {
  const auth = useAuth();
  const { mode } = useAppMode();
  const isAdminMode = mode === 'admin';
  const canEditAdminConfig = isAdminMode && auth.role === 'admin';
  const canMutateVps = !isAdminMode || canEditAdminConfig;
  const chrome = useChrome();
  const qc = useQueryClient();
  const { t } = useI18n();
  const { vps, refetch, refetchChains, vpsRef, busyTransaction, busyLocalLock } = useVps();
  const vpsId = Number(vps.id);
  const objectLabel = String(vps.hostname ?? '') || `#${vpsId}`;

  const baseline = useMemo(() => normalizeDraft(vps), [vps]);
  const [draft, setDraft] = useState<VpsConfigDraft | null>(null);
  const effective = draft ?? baseline;
  const [confirmOpen, setConfirmOpen] = useState(false);

  const dnsResolversQ = useQuery({
    queryKey: ['dns_resolver', 'list', { limit: 250 }],
    queryFn: async () => (await fetchDnsResolvers({ limit: 250 })).data,
    refetchOnWindowFocus: false,
  });

  const ownerId = resourceId(vps.user) ?? undefined;
  const userNamespaceMapsQ = useQuery({
    queryKey: ['user_namespace_map', 'list', { limit: 250, userId: ownerId ?? null }],
    queryFn: async () => (await fetchUserNamespaceMaps({ limit: 250, userId: ownerId })).data,
    refetchOnWindowFocus: false,
  });

  const result = useMemo(() => {
    try {
      return buildPayload({ baseline, draft: effective, isAdminMode: canEditAdminConfig, t });
    } catch (error) {
      return createBuildErrorResult(error);
    }
  }, [baseline, canEditAdminConfig, effective, t]);

  const saveM = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!canMutateVps) throw new Error(t('gate.blocked.permission.body'));
      await preflightVpsNotBusy({ vpsId, t, knownBusy: busyTransaction || busyLocalLock });
      return updateVps(vpsId, payload);
    },
    onMutate: () => {
      chrome.acquireLocalLock(vpsRef);
    },
    onSuccess: (res) => {
      setDraft(null);
      setConfirmOpen(false);
      void qc.invalidateQueries({ queryKey: ['vps', 'show', { id: vpsId }] });
      refetch();
      refetchChains();
      const asId = getMetaActionStateId(res.meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.vps.config.save.label',
          objectLabel,
          object: vpsRef,
        });
      }
    },
    onError: (e: unknown) => {
      if (e && typeof e === 'object' && 'code' in e && e.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => {
      chrome.releaseLocalLock(vpsRef);
    },
  });

  const patchDraft = (patch: Partial<VpsConfigDraft>) => {
    if (saveM.error) saveM.reset();
    setDraft((prev) => ({ ...(prev ?? baseline), ...patch }));
  };

  const busyLocal = busyLocalLock || saveM.isPending;
  const gate = gateVpsMutation({ vps, busyLocal, busyTransaction });
  const dirty = result.changedKeys.length > 0;
  const saveDisabled = !canMutateVps || !dirty || Boolean(result.validationError) || !gate.allowed || saveM.isPending;

  const dnsOptions = useMemo<SelectOption[]>(() => {
    const options: SelectOption[] = [
      { value: '', label: t('vps.config.option.dns_unmanaged') },
      ...(dnsResolversQ.data ?? []).map((resolver) => ({ value: String(resolver.id), label: dnsResolverLabel(resolver) })),
    ];
    return ensureCurrentOption(
      options,
      baseline.dnsResolver,
      currentResourceLabel(vps.dns_resolver, t('vps.config.option.current_dns_resolver'))
    );
  }, [baseline.dnsResolver, dnsResolversQ.data, t, vps.dns_resolver]);

  const userNamespaceMapOptions = useMemo<SelectOption[]>(() => {
    const listed = (userNamespaceMapsQ.data ?? []).map((map) => ({ value: String(map.id), label: userNamespaceMapLabel(map) }));
    const withCurrent = ensureCurrentOption(
      listed,
      baseline.userNamespaceMap,
      currentResourceLabel(vps.user_namespace_map, t('vps.config.option.current_user_namespace_map'))
    );
    return withCurrent.length > 0 ? withCurrent : [{ value: '', label: t('vps.config.option.no_user_namespace_maps_available') }];
  }, [baseline.userNamespaceMap, t, userNamespaceMapsQ.data, vps.user_namespace_map]);

  const labelForKey = (key: VpsConfigReviewKey) => t(CONFIG_FIELD_META[key].labelKey);

  const valueForKey = (key: VpsConfigReviewKey, item: VpsConfigDraft, rawValue: unknown): string => {
    switch (key) {
      case 'manage_hostname':
        return t(item.hostnameMode === 'managed' ? 'vps.config.option.hostname_managed' : 'vps.config.option.hostname_manual');
      case 'user':
        return item.user === baseline.user
          ? currentResourceLabel(vps.user, compactIdLabel(item.user, t('common.none')))
          : compactIdLabel(item.user, t('common.none'));
      case 'dns_resolver':
        return optionLabel(dnsOptions, item.dnsResolver, t('vps.config.option.dns_unmanaged'));
      case 'user_namespace_map':
        return optionLabel(userNamespaceMapOptions, item.userNamespaceMap, t('vps.config.option.no_user_namespace_maps_available'));
      case 'cgroup_version':
        return item.cgroupVersion === 'cgroup_any' ? t('vps.config.option.cgroup_any') : item.cgroupVersion.replace('_', ' ');
      case 'allow_admin_modifications':
      case 'admin_override':
        return rawValue === true ? t('common.yes') : t('common.no');
      case 'admin_lock_type':
        return item.adminLockType ? t(`vps.config.option.admin_lock_type.${item.adminLockType}`) : t('vps.config.option.admin_lock_type_none');
      case 'change_reason':
        return item.changeReason.trim();
      default:
        return String(rawValue ?? '').trim();
    }
  };

  const changes = useMemo(
    () =>
      buildChangeSummaries({
        changedKeys: result.changedKeys,
        requestOptionKeys: getReviewRequestOptionKeys(result.payload),
        baseline,
        draft: effective,
        labelForKey,
        valueForKey,
        emptyValueLabel: t('common.none'),
      }),
    [baseline, dnsOptions, effective, result.changedKeys, result.payload, t, userNamespaceMapOptions, vps.user]
  );

  const fieldErrors = useMemo(() => parseVpsConfigFieldErrors(saveM.error), [saveM.error]);
  const fieldMessages = (key: VpsConfigReviewKey) =>
    mergeFieldErrorMessages({
      key,
      apiErrors: fieldErrors,
      validationFieldKey: result.validationFieldKey,
      validationError: result.validationError,
    });

  const applySave = () => {
    if (saveDisabled) return;
    setConfirmOpen(true);
  };

  return (
    <div className="space-y-4">
      {!canMutateVps ? (
        <Alert variant="neutral" title={t('gate.blocked.permission.title')}>
          {t('gate.blocked.permission.body')}
        </Alert>
      ) : null}

      <fieldset disabled={!canMutateVps} className="m-0 min-w-0 border-0 p-0">
      <div className="space-y-4">
      <Card>
        <CardHeader
          title={t('vps.config.title')}
          subtitle={t(canEditAdminConfig ? 'vps.config.subtitle_admin' : 'vps.config.subtitle_user')}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft(null);
                  saveM.reset();
                  void dnsResolversQ.refetch();
                  void userNamespaceMapsQ.refetch();
                }}
                disabled={saveM.isPending}
              >
                {t('common.reset')}
              </Button>
              <ActionButton
                onClick={applySave}
                loading={saveM.isPending}
                disabled={saveDisabled}
                disabledReason={!gate.allowed ? gate.reason : undefined}
              >
                {dirty ? t('vps.config.save_changes', { n: result.changedKeys.length }) : t('vps.config.save_changes_empty')}
              </ActionButton>
            </div>
          }
        />
      </Card>

      {!gate.allowed ? (
        <Alert variant="warn" title={t(gate.reason.titleKey)}>
          {gate.reason.descriptionKey ? <p>{t(gate.reason.descriptionKey)}</p> : null}
          <Button variant="secondary" onClick={() => chrome.openTasks()}>
            {t('common.open_tasks')}
          </Button>
        </Alert>
      ) : null}

      {result.validationError && !result.validationFieldKey ? <Alert variant="danger">{result.validationError}</Alert> : null}
      <VpsConfigFieldErrorsAlert errors={fieldErrors} labelForKey={labelForKey} />
      {saveM.error && fieldErrors.length === 0 ? <Alert variant="danger">{String((saveM.error as Error)?.message ?? saveM.error)}</Alert> : null}

      <VpsConfigReviewPanel
        changes={changes}
        dirty={dirty}
        sensitive={result.sensitive}
        validationFieldKey={result.validationFieldKey}
      />

      <VpsConfigSectionCard
        title={t(canEditAdminConfig ? 'vps.config.section.identity_admin' : 'vps.config.section.identity')}
        subtitle={t(canEditAdminConfig ? 'vps.config.section.identity_help_admin' : 'vps.config.section.identity_help')}
        risks={['safe']}
        bodyClassName="grid gap-4 md:grid-cols-2"
      >
        <Field label={t('vps.config.field.hostname_mode')} help={t('vps.config.help.hostname_mode')} errors={fieldMessages('manage_hostname')}>
          <Select
            value={effective.hostnameMode}
            onChange={(e) => patchDraft({ hostnameMode: e.target.value as 'managed' | 'manual' })}
            disabled={saveM.isPending}
            options={[
              { value: 'managed', label: t('vps.config.option.hostname_managed') },
              { value: 'manual', label: t('vps.config.option.hostname_manual') },
            ]}
          />
        </Field>
        <Field label={t('vps.config.field.hostname')} help={t('vps.config.help.hostname')} errors={fieldMessages('hostname')}>
          <Input
            value={effective.hostname}
            onChange={(e) => patchDraft({ hostname: e.target.value })}
            disabled={saveM.isPending || effective.hostnameMode === 'manual'}
            autoComplete="off"
          />
        </Field>
      </VpsConfigSectionCard>

      <VpsConfigSectionCard
        title={t('vps.config.section.resources')}
        subtitle={t(canEditAdminConfig ? 'vps.config.section.resources_help_admin' : 'vps.config.section.resources_help')}
        risks={['requires_restart']}
        bodyClassName="grid gap-4 md:grid-cols-3"
      >
        <Field label={t('vps.config.field.cpu')} errors={fieldMessages('cpu')}>
          <Input value={effective.cpu} type="number" min={1} step={1} onChange={(e) => patchDraft({ cpu: e.target.value })} disabled={saveM.isPending} />
        </Field>
        <Field label={t('vps.config.field.memory')} help={t('vps.config.help.mib')} errors={fieldMessages('memory')}>
          <Input value={effective.memory} type="number" min={1} step={1} onChange={(e) => patchDraft({ memory: e.target.value })} disabled={saveM.isPending} />
        </Field>
        <Field label={t('vps.config.field.swap')} help={t('vps.config.help.mib')} errors={fieldMessages('swap')}>
          <Input value={effective.swap} type="number" min={0} step={1} onChange={(e) => patchDraft({ swap: e.target.value })} disabled={saveM.isPending} />
        </Field>
      </VpsConfigSectionCard>

      <VpsConfigSectionCard
        title={t('vps.config.section.resolvers')}
        subtitle={t('vps.config.section.resolvers_help')}
        risks={['network']}
        bodyClassName="grid gap-4 md:grid-cols-2"
      >
        <Field label={t('vps.config.field.dns_resolver')} help={t('vps.config.help.dns_resolver_nullable')} errors={fieldMessages('dns_resolver')}>
          {dnsResolversQ.isLoading ? (
            <Spinner />
          ) : dnsResolversQ.isError ? (
            <Alert variant="danger">{String((dnsResolversQ.error as Error)?.message ?? dnsResolversQ.error)}</Alert>
          ) : (
            <Select value={effective.dnsResolver} onChange={(e) => patchDraft({ dnsResolver: e.target.value })} disabled={saveM.isPending} options={dnsOptions} />
          )}
        </Field>
      </VpsConfigSectionCard>

      <VpsConfigSectionCard
        title={t('vps.config.section.namespace')}
        subtitle={t('vps.config.section.namespace_help')}
        risks={['requires_restart']}
        bodyClassName="grid gap-4 md:grid-cols-2"
      >
        <Field label={t('vps.config.field.user_namespace_map')} help={t('vps.config.help.user_namespace_map')} errors={fieldMessages('user_namespace_map')}>
          {userNamespaceMapsQ.isLoading ? (
            <Spinner />
          ) : userNamespaceMapsQ.isError ? (
            <Alert variant="danger">{String((userNamespaceMapsQ.error as Error)?.message ?? userNamespaceMapsQ.error)}</Alert>
          ) : (
            <Select
              value={effective.userNamespaceMap}
              onChange={(e) => patchDraft({ userNamespaceMap: e.target.value })}
              disabled={saveM.isPending || userNamespaceMapOptions.length === 0}
              options={userNamespaceMapOptions}
            />
          )}
        </Field>
      </VpsConfigSectionCard>

      <VpsConfigSectionCard
        title={t('vps.config.section.boot')}
        subtitle={t(canEditAdminConfig ? 'vps.config.section.boot_help' : 'vps.config.section.boot_help_user')}
        risks={['boot', 'requires_restart']}
        bodyClassName={canEditAdminConfig ? 'grid gap-4 md:grid-cols-2' : 'grid gap-4 md:grid-cols-1'}
      >
        {canEditAdminConfig ? (
          <Field label={t('vps.config.field.start_menu_timeout')} help={t('vps.config.help.start_menu_timeout')} errors={fieldMessages('start_menu_timeout')}>
            <Input
              value={effective.startMenuTimeout}
              type="number"
              min={0}
              max={START_MENU_TIMEOUT_MAX}
              step={1}
              onChange={(e) => patchDraft({ startMenuTimeout: e.target.value })}
              disabled={saveM.isPending}
            />
          </Field>
        ) : null}
        <Field label={t('vps.config.field.cgroup_version')} errors={fieldMessages('cgroup_version')}>
          <Select
            value={effective.cgroupVersion}
            onChange={(e) => patchDraft({ cgroupVersion: e.target.value as CgroupVersion })}
            disabled={saveM.isPending}
            options={[
              { value: 'cgroup_any', label: t('vps.config.option.cgroup_any') },
              { value: 'cgroup_v1', label: 'cgroup v1' },
              { value: 'cgroup_v2', label: 'cgroup v2' },
            ]}
          />
        </Field>
      </VpsConfigSectionCard>

      <VpsConfigSectionCard
        title={t('vps.config.section.admin_access')}
        subtitle={t('vps.config.section.admin_access_help')}
        risks={['safe']}
        bodyClassName="grid gap-4 md:grid-cols-2"
      >
        <div className="flex items-end">
          <Checkbox
            checked={effective.allowAdminModifications}
            onChange={(checked) => patchDraft({ allowAdminModifications: checked })}
            label={t('vps.config.field.allow_admin_modifications')}
            description={t('vps.config.help.allow_admin_modifications')}
            disabled={saveM.isPending}
          />
        </div>
      </VpsConfigSectionCard>

      {canEditAdminConfig ? (
        <VpsConfigSectionCard
          title={t('vps.config.section.admin')}
          subtitle={t('vps.config.section.admin_help')}
          risks={['admin_only']}
          bodyClassName="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          <Field label={t('vps.config.field.owner')} help={t('vps.config.help.owner')} errors={fieldMessages('user')}>
            <UserLookupInput
              value={effective.user}
              onChange={(value) => patchDraft({ user: value })}
              placeholder={t('vps.create.placeholder.user')}
              disabled={saveM.isPending}
              allowRawId
            />
          </Field>
          <Field label={t('vps.config.field.cpu_limit')} help={t('vps.config.help.cpu_limit_nullable')} errors={fieldMessages('cpu_limit')}>
            <Input value={effective.cpuLimit} type="number" min={0} step={1} onChange={(e) => patchDraft({ cpuLimit: e.target.value })} disabled={saveM.isPending} />
          </Field>
          <Field label={t('vps.config.field.autostart_priority')} help={t('vps.config.help.autostart_priority')} errors={fieldMessages('autostart_priority')}>
            <Input
              value={effective.autostartPriority}
              type="number"
              min={0}
              step={1}
              onChange={(e) => patchDraft({ autostartPriority: e.target.value })}
              disabled={saveM.isPending}
            />
          </Field>
          <Field label={t('vps.config.field.change_reason')} help={t('vps.config.help.change_reason')} errors={fieldMessages('change_reason')}>
            <Input value={effective.changeReason} onChange={(e) => patchDraft({ changeReason: e.target.value })} disabled={saveM.isPending} autoComplete="off" />
          </Field>
          <Field label={t('vps.config.field.admin_lock_type')} help={t('vps.config.help.admin_lock_type')} errors={fieldMessages('admin_lock_type')}>
            <Select
              value={effective.adminLockType}
              onChange={(e) => patchDraft({ adminLockType: e.target.value })}
              disabled={saveM.isPending}
              options={[
                { value: '', label: t('vps.config.option.admin_lock_type_none') },
                ...ADMIN_LOCK_TYPES.map((lockType) => ({ value: lockType, label: t(`vps.config.option.admin_lock_type.${lockType}`) })),
              ]}
            />
          </Field>
          <div className="flex items-end">
            <Checkbox
              checked={effective.adminOverride}
              onChange={(checked) => patchDraft({ adminOverride: checked })}
              label={t('vps.config.field.admin_override')}
              description={t('vps.config.help.admin_override')}
              disabled={saveM.isPending}
            />
          </div>
        </VpsConfigSectionCard>
      ) : null}

      {dirty ? <Alert variant="info">{t('vps.config.unsaved', { n: result.changedKeys.length })}</Alert> : null}

      <ConfirmDialog
        open={confirmOpen}
        title={t('vps.config.confirm.title')}
        description={t('vps.config.confirm.description', { n: changes.length })}
        confirmLabel={t('common.save')}
        confirmLoading={saveM.isPending}
        confirmDisabled={saveDisabled}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => saveM.mutate(result.payload)}
      >
        <VpsConfigChangesList changes={changes} compact />
      </ConfirmDialog>
      </div>
      </fieldset>
    </div>
  );
}
