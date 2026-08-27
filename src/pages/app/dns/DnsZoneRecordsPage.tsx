import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';

import { useI18n } from '../../../app/i18n';
import { useChrome } from '../../../components/layout/ChromeContext';

import {
  createDnsRecord,
  deleteDnsRecord,
  fetchDnsRecords,
  updateDnsRecord,
  type DnsRecord,
} from '../../../lib/api/dns';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import { formatErrorMessage } from '../../../lib/errors';
import { gateDnsAction } from '../../../lib/gates/dns';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { cursorFromDescendingPage } from '../../../lib/lockIndex';

import { ActionButton } from '../../../components/ui/ActionButton';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Input } from '../../../components/ui/Input';
import { LoadingState } from '../../../components/ui/LoadingState';

import { useDnsZoneContext } from './DnsZoneContext';
import { DnsRecordEditorModal } from './DnsRecordEditorModal';
import { parseDnsRecordFieldErrors } from './DnsRecordErrors';
import {
  buildDnsRecordCreatePayload,
  buildDnsRecordUpdatePayload,
  defaultDnsRecordDraft,
  dnsRecordCreatePreview,
  dnsRecordUpdatePreview,
  dnsZoneLabel,
  draftFromRecord,
  recordName,
  validateDnsRecordDraft,
  validateExistingDnsRecord,
  type DnsRecordDraft,
} from './DnsRecordModel';
import { DnsRecordsList } from './DnsRecordsList';
import { isSecondaryDnsZone } from './DnsZoneModel';
import { preflightDnsZoneNotBusy } from './dnsPreflight';

function hasErrorCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== 'object') return false;
  return 'code' in error && String(error.code) === code;
}

function setMapValue<K, V>(map: ReadonlyMap<K, V>, key: K, value: V): Map<K, V> {
  const next = new Map(map);
  next.set(key, value);
  return next;
}

function deleteMapValue<K, V>(map: ReadonlyMap<K, V>, key: K): Map<K, V> {
  const next = new Map(map);
  next.delete(key);
  return next;
}

function matchesRecordSearch(record: DnsRecord, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;

  return [
    record.id,
    `#${record.id}`,
    record.name,
    record.type,
    record.content,
    record.comment,
  ].some((value) => String(value ?? '').toLocaleLowerCase().includes(needle));
}

export function DnsZoneRecordsPage() {
  const { zone } = useDnsZoneContext();
  if (isSecondaryDnsZone(zone)) return <SecondaryDnsZoneRecordsPage />;
  return <PrimaryDnsZoneRecordsPage />;
}

function SecondaryDnsZoneRecordsPage() {
  // Secondary zones have no record CRUD in HaveAPI. Keep the canonical detail
  // URL useful while landing directly on their primary-peer/transfer surface.
  return <Navigate to="transfers" replace />;
}

function PrimaryDnsZoneRecordsPage() {
  const { t } = useI18n();
  const chrome = useChrome();
  const { zone, refetch: refetchZone, refetchChains, zoneRef, busyLocalLock, busyTransaction, concernClasses } =
    useDnsZoneContext();

  const zoneLabelForToast = dnsZoneLabel(zone);

  const [searchParams, setSearchParams] = useSearchParams();
  const [qstr, setQstr] = useState(() => searchParams.get('q') ?? '');

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const trimmed = qstr.trim();
    if (trimmed) next.set('q', trimmed);
    else next.delete('q');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [qstr, searchParams, setSearchParams]);

  const pagination = useKeysetPagination({
    id: 'dns.records.list',
    filterKey: JSON.stringify({ zoneId: zone.id, q: qstr.trim() }),
    searchParams,
    setSearchParams,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100],
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<DnsRecordDraft>(() => defaultDnsRecordDraft());
  const [edit, setEdit] = useState<DnsRecord | null>(null);
  const [editDraft, setEditDraft] = useState<DnsRecordDraft>(() => defaultDnsRecordDraft());
  const [confirmDelete, setConfirmDelete] = useState<DnsRecord | null>(null);
  const [rowErrors, setRowErrors] = useState<Map<number, string>>(() => new Map());

  const recordsQ = useQuery({
    queryKey: ['dns_records', 'index', { dns_zone: zone.id, limit: pagination.limit, fromId: pagination.fromId }],
    queryFn: async () =>
      fetchDnsRecords({
        dns_zone: zone.id,
        limit: pagination.limit,
        fromId: pagination.fromId,
      }),
  });

  const pageData = recordsQ.data?.data ?? [];
  const totalCount =
    typeof recordsQ.data?.meta?.['total_count'] === 'number' ? Number(recordsQ.data.meta['total_count']) : pageData.length;
  const rows = useMemo(
    () => pageData.filter((record) => matchesRecordSearch(record, qstr)),
    [pageData, qstr]
  );

  const pageCursor = useMemo(() => cursorFromDescendingPage(pageData), [pageData]);
  const hasMore = pageData.length >= pagination.limit;
  const filtersActive = Boolean(qstr.trim());

  const validationById = useMemo(() => {
    return new Map(rows.map((record) => [record.id, validateExistingDnsRecord(record, pageData)]));
  }, [pageData, rows]);

  const createValidation = useMemo(() => validateDnsRecordDraft(createDraft, pageData), [createDraft, pageData]);
  const editValidation = useMemo(
    () => validateDnsRecordDraft(editDraft, pageData, { editingRecordId: edit?.id }),
    [edit?.id, editDraft, pageData]
  );
  const createPreview = useMemo(() => dnsRecordCreatePreview(createDraft), [createDraft]);
  const editPreview = useMemo(() => (edit ? dnsRecordUpdatePreview(edit, editDraft) : []), [edit, editDraft]);

  const busyLocal = busyLocalLock || false;
  const createBusyLocal = busyLocal || false;
  const updateBusyLocal = busyLocal || false;
  const deleteBusyLocal = busyLocal || false;

  const createM = useMutation({
    mutationFn: async () => {
      const validation = validateDnsRecordDraft(createDraft, pageData);
      if (validation.hasErrors) throw new Error(t('dns.zone.records.validation.local_failed'));
      await preflightDnsZoneNotBusy({ zoneId: zone.id, t, concernClasses, knownBusy: busyTransaction || busyLocalLock });
      return createDnsRecord(buildDnsRecordCreatePayload(zone.id, createDraft));
    },
    onMutate: () => {
      chrome.acquireLocalLock(zoneRef);
    },
    onSuccess: (result) => {
      const asId = getMetaActionStateId(result.meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.dns.record.create.label',
          objectLabel: zoneLabelForToast,
          object: zoneRef,
        });
      }
      setCreateOpen(false);
      setCreateDraft(defaultDnsRecordDraft());
      pagination.goToPage(1);
      recordsQ.refetch();
      refetchZone();
      refetchChains();
    },
    onSettled: () => {
      chrome.releaseLocalLock(zoneRef);
    },
    onError: (err) => {
      if (hasErrorCode(err, 'BUSY')) chrome.openTasks();
    },
  });

  const updateM = useMutation({
    mutationFn: async () => {
      if (!edit) throw new Error('No record selected');
      const validation = validateDnsRecordDraft(editDraft, pageData, { editingRecordId: edit.id });
      if (validation.hasErrors) throw new Error(t('dns.zone.records.validation.local_failed'));
      await preflightDnsZoneNotBusy({ zoneId: zone.id, t, concernClasses, knownBusy: busyTransaction || busyLocalLock });
      return updateDnsRecord(edit.id, buildDnsRecordUpdatePayload(editDraft));
    },
    onMutate: () => {
      chrome.acquireLocalLock(zoneRef);
    },
    onSuccess: (result) => {
      const asId = getMetaActionStateId(result.meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.dns.record.update.label',
          objectLabel: zoneLabelForToast,
          object: zoneRef,
        });
      }
      if (edit) setRowErrors((current) => deleteMapValue(current, edit.id));
      setEdit(null);
      recordsQ.refetch();
      refetchZone();
      refetchChains();
    },
    onSettled: () => {
      chrome.releaseLocalLock(zoneRef);
    },
    onError: (err) => {
      if (hasErrorCode(err, 'BUSY')) chrome.openTasks();
      if (edit) setRowErrors((current) => setMapValue(current, edit.id, formatErrorMessage(err)));
    },
  });

  const deleteM = useMutation({
    mutationFn: async () => {
      if (!confirmDelete) throw new Error('No record selected');
      await preflightDnsZoneNotBusy({ zoneId: zone.id, t, concernClasses, knownBusy: busyTransaction || busyLocalLock });
      return deleteDnsRecord(confirmDelete.id);
    },
    onMutate: () => {
      chrome.acquireLocalLock(zoneRef);
    },
    onSuccess: (result) => {
      const asId = getMetaActionStateId(result.meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.dns.record.delete.label',
          objectLabel: zoneLabelForToast,
          object: zoneRef,
        });
      }
      if (confirmDelete) setRowErrors((current) => deleteMapValue(current, confirmDelete.id));
      setConfirmDelete(null);
      recordsQ.refetch();
      refetchZone();
      refetchChains();
    },
    onSettled: () => {
      chrome.releaseLocalLock(zoneRef);
    },
    onError: (err) => {
      if (hasErrorCode(err, 'BUSY')) chrome.openTasks();
      if (confirmDelete) setRowErrors((current) => setMapValue(current, confirmDelete.id, formatErrorMessage(err)));
    },
  });

  const createGate = gateDnsAction('record.create', { busyLocal: createBusyLocal || createM.isPending, busyTransaction });
  const updateGate = gateDnsAction('record.update', { busyLocal: updateBusyLocal || updateM.isPending, busyTransaction });
  const deleteGate = gateDnsAction('record.delete', { busyLocal: deleteBusyLocal || deleteM.isPending, busyTransaction });

  const openCreate = () => {
    createM.reset();
    setCreateDraft(defaultDnsRecordDraft());
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    createM.reset();
  };

  const openEdit = (record: DnsRecord) => {
    updateM.reset();
    setRowErrors((current) => deleteMapValue(current, record.id));
    setEdit(record);
    setEditDraft(draftFromRecord(record));
  };

  const closeEdit = () => {
    setEdit(null);
    updateM.reset();
  };

  const openDelete = (record: DnsRecord) => {
    deleteM.reset();
    setConfirmDelete(record);
  };

  return (
    <div className="space-y-6" data-testid="dns.records.list">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-fg">{t('dns.zone.records.page.title')}</h2>
          <p className="mt-1 text-sm text-muted">{t('dns.zone.records.page.description')}</p>
          {filtersActive ? <p className="mt-1 text-xs text-faint">{t('list.meta.filters_active')}</p> : null}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="w-full sm:w-72">
            <Input
              value={qstr}
              onChange={(e) => setQstr(e.target.value)}
              placeholder={t('dns.zone.records.search.placeholder')}
              autoComplete="off"
              testId="dns.records.search.input"
            />
          </div>
          <div className="whitespace-nowrap text-xs text-faint">
            {t('common.showing_n_of_m', { shown: rows.length, total: totalCount })}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => recordsQ.refetch()}
              disabled={recordsQ.isFetching}
              testId="dns.records.refresh"
            >
              {t('common.refresh')}
            </Button>
            <ActionButton
              onClick={openCreate}
              disabled={!createGate.allowed}
              disabledReason={!createGate.allowed ? createGate.reason : undefined}
              testId="dns.records.create.open"
            >
              {t('dns.zone.records.action.add')}
            </ActionButton>
          </div>
        </div>
      </div>

      {recordsQ.isLoading ? (
        <Card>
          <LoadingState testId="dns.records.loading" />
        </Card>
      ) : recordsQ.isError ? (
        <ErrorState
          testId="dns.records.error"
          title={t('dns.zone.records.load_failed')}
          error={recordsQ.error}
          onRetry={() => void recordsQ.refetch()}
          showBack={false}
          detailsExtra={{ page: 'dns.records', zoneId: zone.id }}
        />
      ) : (
        <DnsRecordsList
          rows={rows}
          validationById={validationById}
          rowErrors={rowErrors}
          updateGate={updateGate}
          deleteGate={deleteGate}
          page={pagination.page}
          pageCount={pagination.stack.length}
          canPrev={pagination.canPrev}
          canNext={hasMore}
          pageCursor={pageCursor}
          limit={pagination.limit}
          allowedLimits={pagination.allowedLimits}
          onLimitChange={pagination.setLimit}
          onPrev={pagination.goPrev}
          onNext={pagination.goNext}
          onGoToPage={pagination.goToPage}
          onEdit={openEdit}
          onDelete={openDelete}
        />
      )}

      <DnsRecordEditorModal
        mode="create"
        open={createOpen}
        draft={createDraft}
        validation={createValidation}
        preview={createPreview}
        apiFieldErrors={parseDnsRecordFieldErrors(createM.error)}
        mutationError={createM.isError ? createM.error : null}
        mutationErrorTitleKey="dns.zone.records.modal.create.failed"
        pending={createM.isPending}
        gateAllowed={createGate.allowed}
        gateReason={!createGate.allowed ? createGate.reason : undefined}
        onDraftChange={(patch) => setCreateDraft((current) => ({ ...current, ...patch }))}
        onCancel={closeCreate}
        onSubmit={() => createM.mutate()}
      />

      <DnsRecordEditorModal
        mode="edit"
        open={edit !== null}
        draft={editDraft}
        validation={editValidation}
        preview={editPreview}
        apiFieldErrors={parseDnsRecordFieldErrors(updateM.error)}
        mutationError={updateM.isError ? updateM.error : null}
        mutationErrorTitleKey="dns.zone.records.modal.edit.failed"
        pending={updateM.isPending}
        gateAllowed={updateGate.allowed}
        gateReason={!updateGate.allowed ? updateGate.reason : undefined}
        onDraftChange={(patch) => setEditDraft((current) => ({ ...current, ...patch }))}
        onCancel={closeEdit}
        onSubmit={() => updateM.mutate()}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        testId="dns.records.delete_confirm"
        title={t('dns.zone.records.delete_confirm.title')}
        description={t('dns.zone.records.delete_confirm.description')}
        confirmLabel={t('common.delete')}
        danger
        confirmDisabled={!deleteGate.allowed}
        confirmLoading={deleteM.isPending}
        cancelDisabled={deleteM.isPending}
        onCancel={() => {
          setConfirmDelete(null);
          deleteM.reset();
        }}
        onConfirm={() => deleteM.mutate()}
      >
        {confirmDelete ? (
          <div className="text-sm text-muted">
            {t('dns.zone.records.delete_confirm.prompt', {
              name: recordName(confirmDelete),
              type: String(confirmDelete.type ?? t('common.na')),
            })}
          </div>
        ) : null}

        {!deleteGate.allowed ? (
          <Alert title={t(deleteGate.reason.titleKey)} variant="warn">
            {deleteGate.reason.descriptionKey ? t(deleteGate.reason.descriptionKey) : null}
          </Alert>
        ) : null}
        {deleteM.isError ? (
          <Alert title={t('dns.zone.records.delete_confirm.failed')} variant="danger">
            {formatErrorMessage(deleteM.error)}
          </Alert>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
