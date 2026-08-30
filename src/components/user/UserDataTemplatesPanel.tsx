import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { useAuth } from '../../app/auth';
import { useI18n } from '../../app/i18n';
import { useToasts } from '../../app/toasts';

import {
  createVpsUserData,
  deleteVpsUserData,
  deployVpsUserData,
  fetchVpsUserDataList,
  updateVpsUserData,
  type VpsUserData,
} from '../../lib/api/vpsUserData';
import { getMetaActionStateId } from '../../lib/api/haveapi';
import { objectRef } from '../../lib/objectRef';
import { formatErrorMessage } from '../../lib/errors';
import { cursorFromDescendingPage } from '../../lib/lockIndex';
import { useKeysetPagination } from '../../lib/hooks/useKeysetPagination';
import { parseNumericToken, splitKeyValueToken, tokenizeSmartInput, unquoteSmartValue } from '../../lib/smartFilter';

import { useChrome } from '../layout/ChromeContext';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import type { SelectOption } from '../ui/Select';

import { UserDataTemplateDeployDrawer, UserDataTemplateEditorDrawer } from './UserDataTemplatesDrawers';
import { UserDataTemplatesFilters, type UserDataFilterValues } from './UserDataTemplatesFilters';
import { UserDataTemplatesList } from './UserDataTemplatesList';
import {
  buildUserDataCreatePayload,
  buildUserDataUpdatePayload,
  buildUserDataValidationHints,
  canSaveUserDataForm,
  initUserDataForm,
  resolveUserDataFormat,
  safeUserDataId,
  type UserDataEditorState,
  type UserDataFormState,
  userDataContentOverLimit,
  userDataFormatHintKey,
} from './UserDataTemplatesModel';

export function UserDataTemplatesPanel(props: {
  /** When provided and the viewer is admin, the list is scoped to this user. */
  userIdForAdmin?: number;

  /** When provided and the viewer is admin, creates templates for this user. */
  createForUserId?: number;

  testIdPrefix: string;
}) {
  const auth = useAuth();
  const isAdmin = auth.role === 'admin';

  const { t } = useI18n();
  const toasts = useToasts();
  const chrome = useChrome();
  const qc = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();

  const qRaw = searchParams.get('q') ?? '';
  const qTrim = qRaw.trim();
  const formatFilter = (searchParams.get('format') ?? '').trim();

  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const filtersActive = Boolean(qTrim) || Boolean(formatFilter) || smartErrors.length > 0;
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  function setFilters(nextVals: UserDataFilterValues) {
    const next = new URLSearchParams(searchParams);
    if (nextVals.q && nextVals.q.trim()) next.set('q', nextVals.q.trim());
    else next.delete('q');
    if (nextVals.format && nextVals.format.trim()) next.set('format', nextVals.format.trim());
    else next.delete('format');
    next.delete('from');
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    setFilters({ q: '', format: '' });
    setSmart('');
    setSmartErrors([]);
  }

  function applySmart(rawInput?: string) {
    const raw = String(rawInput ?? smart).trim();
    if (!raw || raw === '?') return;

    const tokens = tokenizeSmartInput(raw);
    let nextQ = qTrim;
    let nextFormat = formatFilter;
    const errors: string[] = [];

    for (const token of tokens) {
      const kv = splitKeyValueToken(token);
      if (!kv) {
        const n = parseNumericToken(token);
        nextQ = n !== null ? String(n) : unquoteSmartValue(token);
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
          nextQ = value;
          break;
        case 'id': {
          const n = parseNumericToken(value);
          if (n === null) errors.push(t('filters.smart.error.numeric_only', { key, value }));
          else nextQ = String(n);
          break;
        }
        case 'format':
        case 'f': {
          const match = resolveUserDataFormat(value);
          if (match === null) errors.push(t('filters.smart.error.option_unresolved', { key, value }));
          else nextFormat = match;
          break;
        }
        default:
          errors.push(t('filters.smart.error.unknown_key', { key }));
      }
    }

    setSmartErrors(errors);
    if (errors.length > 0) return;
    setFilters({ q: nextQ, format: nextFormat });
    setSmart('');
  }

  // Keep URL clean (trim/normalize).
  React.useEffect(() => {
    const next = new URLSearchParams(searchParams);

    if (qTrim) next.set('q', qTrim);
    else next.delete('q');

    if (formatFilter) next.set('format', formatFilter);
    else next.delete('format');

    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [formatFilter, qTrim, searchParams, setSearchParams]);

  const pagination = useKeysetPagination({
    id: props.testIdPrefix,
    filterKey: JSON.stringify({ q: qTrim, f: formatFilter, u: props.userIdForAdmin ?? null }),
    searchParams,
    setSearchParams,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100, 200],
  });

  const listQ = useQuery({
    queryKey: [
      'vps_user_data',
      'list',
      {
        limit: pagination.limit,
        fromId: pagination.fromId,
        q: qTrim,
        format: formatFilter,
        user: isAdmin ? props.userIdForAdmin ?? null : null,
      },
    ],
    queryFn: async () =>
      (
        await fetchVpsUserDataList({
          limit: pagination.limit,
          fromId: pagination.fromId,
          q: qTrim || undefined,
          format: formatFilter || undefined,
          user: isAdmin ? props.userIdForAdmin : undefined,
        })
      ).data,
    staleTime: 10_000,
  });

  const rows = listQ.data ?? [];
  const canNext = rows.length >= pagination.limit;
  const cursor = useMemo(() => cursorFromDescendingPage(rows, (row) => row.id), [rows]);

  const formatOptions = useMemo<SelectOption[]>(() => [
    { value: '', label: t('common.all') },
    { value: 'script', label: t('user_data.format.script') },
    { value: 'cloudinit_config', label: t('user_data.format.cloudinit_config') },
    { value: 'cloudinit_script', label: t('user_data.format.cloudinit_script') },
    { value: 'nixos_configuration', label: t('user_data.format.nixos_configuration') },
    { value: 'nixos_flake_configuration', label: t('user_data.format.nixos_flake_configuration') },
    { value: 'nixos_flake_uri', label: t('user_data.format.nixos_flake_uri') },
  ], [t]);

  const [editor, setEditor] = useState<UserDataEditorState>(null);
  const [form, setForm] = useState<UserDataFormState>(() => initUserDataForm());

  const openCreate = () => {
    setForm(initUserDataForm());
    setEditor({ mode: 'create' });
  };

  const openEdit = (item: VpsUserData) => {
    setForm(initUserDataForm(item));
    setEditor({ mode: 'edit', item });
  };

  const closeEditor = () => setEditor(null);

  const validationHints = useMemo(() => buildUserDataValidationHints(form), [form]);
  const canSave = canSaveUserDataForm(form);
  const contentOverLimit = userDataContentOverLimit(form.content);
  const hintKey = userDataFormatHintKey(form.format);

  const createM = useMutation({
    mutationFn: async () => createVpsUserData(buildUserDataCreatePayload(form, isAdmin ? props.createForUserId : undefined)),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['vps_user_data'] });
      closeEditor();
      toasts.pushToast({ variant: 'ok', title: t('user_data.toast.created') });
    },
    onError: (e) =>
      toasts.pushToast({ variant: 'danger', title: t('common.error'), body: formatErrorMessage(e), autoDismissMs: false }),
  });

  const updateM = useMutation({
    mutationFn: async () => {
      if (!editor || editor.mode !== 'edit') throw new Error('Missing template');
      const id = safeUserDataId(editor.item.id);
      if (!id) throw new Error('Missing template');
      return updateVpsUserData(id, buildUserDataUpdatePayload(form));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['vps_user_data'] });
      closeEditor();
      toasts.pushToast({ variant: 'ok', title: t('user_data.toast.saved') });
    },
    onError: (e) =>
      toasts.pushToast({ variant: 'danger', title: t('common.error'), body: formatErrorMessage(e), autoDismissMs: false }),
  });

  const [deleteTarget, setDeleteTarget] = useState<VpsUserData | null>(null);

  const deleteM = useMutation({
    mutationFn: async (id: number) => deleteVpsUserData(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['vps_user_data'] });
      setDeleteTarget(null);
      toasts.pushToast({ variant: 'ok', title: t('user_data.toast.deleted') });
    },
    onError: (e) =>
      toasts.pushToast({ variant: 'danger', title: t('common.error'), body: formatErrorMessage(e), autoDismissMs: false }),
  });

  const [deployVpsId, setDeployVpsId] = useState<number | null>(null);

  const openDeploy = (item: VpsUserData) => {
    setDeployVpsId(null);
    setEditor({ mode: 'deploy', item });
  };

  const deployM = useMutation({
    mutationFn: async (variables: { templateId: number; vpsId: number }) => {
      return deployVpsUserData(variables.templateId, variables.vpsId);
    },
    onMutate: async (variables) => {
      const ref = objectRef('Vps', variables.vpsId);
      const mutationGeneration = await chrome.acquireLocalLock(ref, { durable: true });
      return { lockRef: ref, mutationGeneration };
    },
    onSettled: (_data, error, _vars, ctx) => {
      if (ctx?.lockRef) chrome.settleLocalLock(ctx.lockRef, error, ctx.mutationGeneration);
    },
    onSuccess: (res, variables, ctx) => {
      const asId = getMetaActionStateId(res.meta);
      if (asId) {
        chrome.trackActionState(asId, {
          actionLabelKey: 'user_data.deploy.action',
          objectLabel: `#${variables.vpsId}`,
          object: ctx?.lockRef,
          mutationGeneration: ctx?.mutationGeneration,
          blockUi: true,
          progressTitleKey: 'modal.progress.deploy_user_data.title',
        });
      }

      closeEditor();
      toasts.pushToast({
        variant: 'ok',
        title: t('user_data.deploy.toast.started'),
        action: {
          label: t('common.open_tasks'),
          onClick: () => chrome.openTasks(),
        },
      });
    },
    onError: (e) =>
      toasts.pushToast({ variant: 'danger', title: t('common.error'), body: formatErrorMessage(e), autoDismissMs: false }),
  });

  const busy = createM.isPending || updateM.isPending || deleteM.isPending || deployM.isPending;
  const prefix = props.testIdPrefix;
  const editorMode = editor?.mode === 'create' || editor?.mode === 'edit' ? editor.mode : null;
  const deployItem = editor?.mode === 'deploy' ? editor.item : null;

  return (
    <>
      <div className="space-y-4" data-testid={`${prefix}.panel`}>
        <UserDataTemplatesFilters
          prefix={prefix}
          qRaw={qRaw}
          qTrim={qTrim}
          formatFilter={formatFilter}
          smart={smart}
          smartErrors={smartErrors}
          filtersActive={filtersActive}
          shareUrl={shareUrl}
          formatOptions={formatOptions}
          setSmart={setSmart}
          onApplySmart={applySmart}
          onRemoveSmartError={(idx) => setSmartErrors((cur) => cur.filter((_, i) => i !== idx))}
          onSetFilters={setFilters}
          onClearFilters={clearFilters}
          onCreate={openCreate}
        />

        <UserDataTemplatesList
          prefix={prefix}
          rows={rows}
          isLoading={listQ.isLoading}
          isError={listQ.isError}
          error={listQ.error}
          filtersActive={filtersActive}
          limit={pagination.limit}
          canPrev={pagination.canPrev}
          canNext={canNext}
          onPrev={() => pagination.goPrev()}
          onNext={() => pagination.goNext(cursor)}
          onLimitChange={(n) => pagination.setLimit(n)}
          onCreate={openCreate}
          onDeploy={openDeploy}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
      </div>

      <UserDataTemplateEditorDrawer
        prefix={prefix}
        open={Boolean(editorMode)}
        mode={editorMode}
        form={form}
        setForm={setForm}
        formatOptions={formatOptions}
        validationHints={validationHints}
        hintKey={hintKey}
        contentOverLimit={contentOverLimit}
        canSave={canSave}
        busy={busy}
        createPending={createM.isPending}
        updatePending={updateM.isPending}
        onClose={closeEditor}
        onCreate={() => createM.mutate()}
        onUpdate={() => updateM.mutate()}
      />

      <UserDataTemplateDeployDrawer
        prefix={prefix}
        item={deployItem}
        deployVpsId={deployVpsId}
        isAdmin={isAdmin}
        userIdForAdmin={props.userIdForAdmin}
        pending={deployM.isPending}
        onChangeVpsId={setDeployVpsId}
        onClose={closeEditor}
        onSubmit={() => {
          const templateId = safeUserDataId(deployItem?.id);
          if (!templateId) return;
          if (!deployVpsId) {
            toasts.pushToast({
              variant: 'danger',
              title: t('common.error'),
              body: t('user_data.deploy.validation.vps_required'),
              autoDismissMs: false,
            });
            return;
          }
          deployM.mutate(Object.freeze({ templateId, vpsId: deployVpsId }));
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('user_data.delete.title')}
        description={t('user_data.delete.body')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        danger
        confirmLoading={deleteM.isPending}
        onConfirm={() => {
          const id = safeUserDataId(deleteTarget?.id);
          if (id) deleteM.mutate(id);
        }}
        onCancel={() => setDeleteTarget(null)}
        testId={`${prefix}.delete.confirm`}
      />
    </>
  );
}
