import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CircleHelp, SlidersHorizontal } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';
import { useAuth } from '../../../../app/auth';
import {
  createMailRecipient,
  fetchMailRecipients,
  type MailRecipient,
} from '../../../../lib/api/mailer';
import { isAmbiguousMutationError } from '../../../../lib/api/haveapi';

import { ListShell } from '../../../../components/layout/ListShell';
import { PageHeader } from '../../../../components/layout/PageHeader';
import { FilterBar } from '../../../../components/layout/FilterBar';

import { Button } from '../../../../components/ui/Button';
import { CopyButton } from '../../../../components/ui/CopyButton';
import { FilterChip } from '../../../../components/ui/FilterChip';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { KeysetPagination } from '../../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../../components/ui/LoadingState';
import { SmartFilterInput, type SmartFilterSuggestion } from '../../../../components/ui/SmartFilterInput';
import { SmartInputHelp } from '../../../../components/ui/SmartInputHelp';

import { MailerTabs } from './MailerTabs';
import { MailRecipientEditorModal } from './MailRecipientEditorModal';
import { MailRecipientResults } from './MailRecipientResults';
import { MailRecipientSafetyBanners } from './MailRecipientSafetyBanners';
import { MailRecipientsAdvancedFilters } from './MailRecipientsAdvancedFilters';
import {
  filterMailRecipients,
  MAIL_RECIPIENT_FETCH_LIMIT,
  MAIL_RECIPIENT_PAGE_LIMITS,
  parseMailRecipientPage,
  parseMailRecipientPageLimit,
} from './MailRecipientsModel';
import {
  clearMailRecipientCreateGuard,
  persistMailRecipientCreateGuard,
  readMailRecipientCreateGuard,
  type MailRecipientCreateGuardAttempt,
} from './mailRecipientMutationGuardStorage';
import {
  mailRecipientEditFingerprint,
  mailRecipientEditorForm,
  updateMailRecipientWithPreflight,
} from './mailRecipientEditSafety';
import { parseNumericToken, splitKeyValueToken, tokenizeSmartInput, unquoteSmartValue } from '../../../../lib/smartFilter';
import { strictPositiveIntegerId } from './mailerMutationSafety';

interface RecipientCreatePayload {
  label: string;
  to?: string;
  cc?: string;
  bcc?: string;
}

function createGuardAttempt(payload: RecipientCreatePayload): MailRecipientCreateGuardAttempt {
  return { label: payload.label, to: payload.to ?? '', cc: payload.cc ?? '', bcc: payload.bcc ?? '' };
}

export function MailRecipientsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { pushToast } = useToasts();
  const auth = useAuth();
  const guardScope = String(auth.user?.id ?? 'unknown');

  const [searchParams, setSearchParams] = useSearchParams();
  const smartInputRef = useRef<HTMLInputElement | null>(null);

  const q = searchParams.get('q') ?? '';
  const labelFilter = searchParams.get('label') ?? '';
  const toFilter = searchParams.get('to') ?? '';
  const ccFilter = searchParams.get('cc') ?? '';
  const bccFilter = searchParams.get('bcc') ?? '';
  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const qTrim = useMemo(() => q.trim(), [q]);
  const labelTrim = useMemo(() => labelFilter.trim(), [labelFilter]);
  const toTrim = useMemo(() => toFilter.trim(), [toFilter]);
  const ccTrim = useMemo(() => ccFilter.trim(), [ccFilter]);
  const bccTrim = useMemo(() => bccFilter.trim(), [bccFilter]);
  const smartNeedle = useMemo(() => smart.trim(), [smart]);

  const setFilter = (name: 'q' | 'label' | 'to' | 'cc' | 'bcc', value: string) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value.trim()) next.set(name, value); else next.delete(name);
      next.delete('page');
      next.delete('from_id');
      return next;
    }, { replace: true });
  };

  const setFilters = (values: { q: string; label: string; to: string; cc: string; bcc: string }) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [name, value] of Object.entries(values)) {
        if (value.trim()) next.set(name, value); else next.delete(name);
      }
      next.delete('page');
      next.delete('from_id');
      return next;
    }, { replace: true });
  };

  const listQ = useQuery({
    queryKey: ['mailer', 'mail_recipients', 'index', { limit: MAIL_RECIPIENT_FETCH_LIMIT }],
    queryFn: async () => (await fetchMailRecipients({ limit: MAIL_RECIPIENT_FETCH_LIMIT })).data,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const filteredRows = useMemo(() => filterMailRecipients(listQ.data ?? [], {
    q,
    label: labelFilter,
    to: toFilter,
    cc: ccFilter,
    bcc: bccFilter,
  }), [bccFilter, ccFilter, labelFilter, listQ.data, q, toFilter]);
  const limit = parseMailRecipientPageLimit(searchParams.get('limit'));
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / limit));
  const page = parseMailRecipientPage(searchParams.get('page'), pageCount);
  const rows = filteredRows.slice((page - 1) * limit, page * limit);
  const canPaginate = filteredRows.length > 0;
  const fetchLimitReached = (listQ.data?.length ?? 0) >= MAIL_RECIPIENT_FETCH_LIMIT;

  const filtersActive = Boolean(qTrim || labelTrim || toTrim || ccTrim || bccTrim || smartErrors.length);

  function clearFilters() {
    setFilters({ q: '', label: '', to: '', cc: '', bcc: '' });
    setSmart('');
    setSmartErrors([]);
  }

  function applySmartText(raw: string) {
    const needle = String(raw ?? '').trim();
    if (!needle) {
      setSmart('');
      setSmartErrors([]);
      return;
    }
    if (needle === '?') {
      setHelpOpen(true);
      return;
    }

    const tokens = tokenizeSmartInput(needle);
    const nextErrors: string[] = [];
    const freeText: string[] = [];
    let nextQ = qTrim;
    let nextLabel = labelTrim;
    let nextTo = toTrim;
    let nextCc = ccTrim;
    let nextBcc = bccTrim;

    if (tokens.length === 1) {
      const firstToken = tokens[0];
      const id = firstToken ? parseNumericToken(firstToken) : null;
      if (id !== null) {
        const exact = filteredRows.find((r) => Number((r as any).id) === id);
        if (exact) {
          openEdit(exact);
          setSmart('');
          setSmartErrors([]);
          return;
        }
        nextQ = String(id);
        setFilter('q', nextQ);
        setSmart('');
        setSmartErrors([]);
        return;
      }
    }

    for (const token of tokens) {
      const kv = splitKeyValueToken(token);
      if (!kv) {
        freeText.push(unquoteSmartValue(token));
        continue;
      }
      const key = kv.rawKey.trim().toLowerCase();
      const value = unquoteSmartValue(kv.rawValue);
      if (!value) {
        nextErrors.push(t('mailer.recipients.smart.error.empty_value', { key }));
        continue;
      }
      if (['q', 'search'].includes(key)) nextQ = value;
      else if (key === 'label') nextLabel = value;
      else if (key === 'to') nextTo = value;
      else if (key === 'cc') nextCc = value;
      else if (key === 'bcc') nextBcc = value;
      else if (key === 'id') {
        const id = parseNumericToken(value);
        if (id === null) nextErrors.push(t('mailer.recipients.smart.error.id_numeric_only', { value }));
        else {
          const exact = filteredRows.find((r) => Number((r as any).id) === id);
          if (exact) {
            openEdit(exact);
            setSmart('');
            setSmartErrors([]);
            return;
          }
          nextQ = String(id);
        }
      } else {
        nextErrors.push(t('mailer.recipients.smart.error.unknown_key', { key }));
      }
    }

    const free = freeText.join(' ').trim();
    if (free) nextQ = free;

    setFilters({ q: nextQ, label: nextLabel, to: nextTo, cc: nextCc, bcc: nextBcc });
    setSmart('');
    setSmartErrors(nextErrors);
  }

  const smartSuggestions: SmartFilterSuggestion[] = useMemo(() => {
    const s: SmartFilterSuggestion[] = [];
    if (!smartNeedle) return s;
    if (smartNeedle === '?') {
      s.push({
        id: 'help',
        primary: t('filters.help.open'),
        secondary: t('mailer.recipients.smart.help.hint'),
        onPick: () => setHelpOpen(true),
        testId: 'admin.mailer.recipients.smart_filter.suggest.help',
      });
      return s;
    }
    const numeric = parseNumericToken(smartNeedle);
    if (numeric !== null) {
      const exact = filteredRows.find((r) => Number((r as any).id) === numeric);
      if (exact) {
        s.push({
          id: 'edit',
          primary: t('mailer.recipients.smart.suggest.edit', { id: String(numeric) }),
          secondary: t('mailer.recipients.smart.suggest.edit.secondary'),
          onPick: () => openEdit(exact),
          testId: 'admin.mailer.recipients.smart_filter.suggest.edit',
        });
      }
      s.push({
        id: 'search-id',
        primary: t('mailer.recipients.smart.suggest.search_id', { id: String(numeric) }),
        secondary: t('mailer.recipients.smart.suggest.search_id.secondary'),
        onPick: () => applySmartText(String(numeric)),
        testId: 'admin.mailer.recipients.smart_filter.suggest.search_id',
      });
      return s;
    }
    const kv = splitKeyValueToken(smartNeedle);
    if (kv) {
      s.push({
        id: 'apply',
        primary: t('mailer.recipients.smart.suggest.apply', { value: smartNeedle }),
        secondary: t('mailer.recipients.smart.suggest.apply.secondary'),
        onPick: () => applySmartText(smartNeedle),
        testId: 'admin.mailer.recipients.smart_filter.suggest.apply',
      });
      return s;
    }
    s.push({
      id: 'search',
      primary: t('mailer.recipients.smart.suggest.search', { value: smartNeedle }),
      secondary: t('mailer.recipients.smart.suggest.search.secondary'),
      onPick: () => applySmartText(smartNeedle),
      testId: 'admin.mailer.recipients.smart_filter.suggest.search',
    });
    return s;
  }, [filteredRows, smartNeedle, t]);

  const activeFilterChips = useMemo(() => {
    const chips: React.ReactNode[] = [];
    if (qTrim) chips.push(<FilterChip key='q' label={`q:${qTrim}`} onRemove={() => setFilter('q', '')} testId='admin.mailer.recipients.chip.q' />);
    if (labelTrim) chips.push(<FilterChip key='label' label={`label:${labelTrim}`} onRemove={() => setFilter('label', '')} testId='admin.mailer.recipients.chip.label' />);
    if (toTrim) chips.push(<FilterChip key='to' label={`to:${toTrim}`} onRemove={() => setFilter('to', '')} testId='admin.mailer.recipients.chip.to' />);
    if (ccTrim) chips.push(<FilterChip key='cc' label={`cc:${ccTrim}`} onRemove={() => setFilter('cc', '')} testId='admin.mailer.recipients.chip.cc' />);
    if (bccTrim) chips.push(<FilterChip key='bcc' label={`bcc:${bccTrim}`} onRemove={() => setFilter('bcc', '')} testId='admin.mailer.recipients.chip.bcc' />);
    smartErrors.forEach((e, idx) => chips.push(<FilterChip key={`err.${idx}`} label={e} tone='danger' onRemove={() => setSmartErrors([])} testId={`admin.mailer.recipients.chip.error.${idx}`} />));
    return chips;
  }, [bccTrim, ccTrim, labelTrim, qTrim, smartErrors, toTrim]);

  // --- editor modal ---
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<MailRecipient | null>(null);
  const [form, setForm] = useState({ label: '', to: '', cc: '', bcc: '' });
  const [editBaselineFingerprint, setEditBaselineFingerprint] = useState<string | null>(null);
  const [staleServerVersion, setStaleServerVersion] = useState<MailRecipient | null>(null);
  const [indeterminateCreate, setIndeterminateCreate] = useState<MailRecipientCreateGuardAttempt | null>(
    () => readMailRecipientCreateGuard(guardScope),
  );
  const editorSubmitRef = useRef(false);

  useEffect(() => {
    setIndeterminateCreate(readMailRecipientCreateGuard(guardScope));
  }, [guardScope]);

  const openCreate = () => {
    if (indeterminateCreate) return;
    createM.reset();
    updateM.reset();
    setEditing(null);
    setEditBaselineFingerprint(null);
    setStaleServerVersion(null);
    setForm({ label: '', to: '', cc: '', bcc: '' });
    setEditorOpen(true);
  };

  const openEdit = (r: MailRecipient) => {
    createM.reset();
    updateM.reset();
    setEditing(r);
    setEditBaselineFingerprint(mailRecipientEditFingerprint(r));
    setStaleServerVersion(null);
    setForm(mailRecipientEditorForm(r));
    setEditorOpen(true);
  };

  const createM = useMutation({
    mutationFn: async (payload: RecipientCreatePayload) => {
      const persisted = persistMailRecipientCreateGuard(guardScope, createGuardAttempt(payload));
      if (!persisted) throw new Error(t('mailer.recipients.create.guard_storage_error'));
      const created = (await createMailRecipient(payload)).data;
      const createdId = strictPositiveIntegerId(created?.id);
      if (createdId === null) {
        throw new TypeError('Malformed mail recipient create response: missing id');
      }
      return { ...created, id: createdId };
    },
    onSuccess: async (created) => {
      clearMailRecipientCreateGuard(guardScope);
      await qc.invalidateQueries({ queryKey: ['mailer', 'mail_recipients', 'index'] });
      setIndeterminateCreate(null);
      setEditorOpen(false);
      pushToast({
        variant: 'ok',
        title: t('mailer.recipients.create.success'),
        body: t('mailer.recipients.create.success_body', { id: Number(created.id) }),
      });
    },
    onError: (error, payload) => {
      if (!isAmbiguousMutationError(error)) {
        clearMailRecipientCreateGuard(guardScope);
        return;
      }
      const attempt = createGuardAttempt(payload);
      persistMailRecipientCreateGuard(guardScope, attempt);
      setIndeterminateCreate(attempt);
      setEditorOpen(false);
    },
    onSettled: () => {
      editorSubmitRef.current = false;
    },
  });

  const updateM = useMutation({
    mutationFn: async (attempt: {
      id: number;
      baselineFingerprint: string;
      payload: { label: string; to: string | null; cc: string | null; bcc: string | null };
    }) => {
      return updateMailRecipientWithPreflight(attempt);
    },
    onSuccess: async (result) => {
      if (result.status === 'stale') {
        setStaleServerVersion(result.latest);
        return;
      }
      await qc.invalidateQueries({ queryKey: ['mailer', 'mail_recipients', 'index'] });
      await qc.invalidateQueries({ queryKey: ['mailer', 'mail_templates', 'recipients'] });
      setEditBaselineFingerprint(null);
      setStaleServerVersion(null);
      setEditorOpen(false);
      pushToast({ variant: 'ok', title: t('mailer.recipients.update.success') });
    },
    onSettled: () => {
      editorSubmitRef.current = false;
    },
  });

  const editingStale = editing !== null && staleServerVersion !== null;
  const saveDisabled = !form.label.trim()
    || (!form.to.trim() && !form.cc.trim() && !form.bcc.trim())
    || editingStale
    || (editing !== null && editBaselineFingerprint === null);
  const editorPending = createM.isPending || updateM.isPending;

  const closeEditor = () => {
    if (!editorPending) setEditorOpen(false);
  };

  const submitEditor = () => {
    if (editorSubmitRef.current || editorPending || saveDisabled) return;
    editorSubmitRef.current = true;
    if (editing) {
      const recipientId = strictPositiveIntegerId(editing.id);
      if (recipientId === null || editBaselineFingerprint === null) {
        editorSubmitRef.current = false;
        return;
      }
      updateM.mutate({
        id: recipientId,
        baselineFingerprint: editBaselineFingerprint,
        payload: {
          label: form.label.trim(),
          to: form.to.trim() || null,
          cc: form.cc.trim() || null,
          bcc: form.bcc.trim() || null,
        },
      });
      return;
    }
    createM.mutate({
      label: form.label.trim(),
      to: form.to.trim() || undefined,
      cc: form.cc.trim() || undefined,
      bcc: form.bcc.trim() || undefined,
    });
  };

  const loadServerVersion = () => {
    if (editorPending || !editing || !staleServerVersion) return;
    const editingId = strictPositiveIntegerId(editing.id);
    const latestId = strictPositiveIntegerId(staleServerVersion.id);
    if (editingId === null || latestId !== editingId) return;

    updateM.reset();
    setEditing(staleServerVersion);
    setForm(mailRecipientEditorForm(staleServerVersion));
    setEditBaselineFingerprint(mailRecipientEditFingerprint(staleServerVersion));
    setStaleServerVersion(null);
  };

  const setPageParam = (name: 'page' | 'limit', value: number) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if ((name === 'page' && value <= 1) || (name === 'limit' && value === 50)) next.delete(name);
      else next.set(name, String(value));
      if (name === 'limit') next.delete('page');
      next.delete('from_id');
      return next;
    }, { replace: true });
  };

  const renderPagination = (testId: string) => canPaginate ? (
    <KeysetPagination
      page={page}
      pageCount={pageCount}
      totalPagesKnown
      canPrev={page > 1}
      canNext={page < pageCount}
      onPrev={() => setPageParam('page', page - 1)}
      onNext={() => setPageParam('page', page + 1)}
      onGoToPage={(target) => setPageParam('page', target)}
      limit={limit}
      allowedLimits={MAIL_RECIPIENT_PAGE_LIMITS}
      onLimitChange={(nextLimit) => setPageParam('limit', nextLimit)}
      testId={testId}
    />
  ) : null;

  return (
    <ListShell
      testId="admin.mailer.recipients.page"
      banner={(
        <MailRecipientSafetyBanners
          fetchLimitReached={fetchLimitReached}
          fetchLimit={MAIL_RECIPIENT_FETCH_LIMIT}
          indeterminateCreate={indeterminateCreate}
          refreshing={listQ.isFetching}
          onRefresh={() => void listQ.refetch()}
          onUnlock={() => {
            clearMailRecipientCreateGuard(guardScope);
            setIndeterminateCreate(null);
            createM.reset();
          }}
        />
      )}
      header={
        <div className="space-y-3">
          <PageHeader
            title={t('mailer.tabs.recipients')}
            description={t('mailer.recipients.list.description')}
            meta={filtersActive ? <span className="text-xs text-faint">{t('list.meta.filters_active')}</span> : null}
            actions={
              <Button
                variant="primary"
                onClick={openCreate}
                disabled={indeterminateCreate !== null}
                disabledReason={indeterminateCreate ? t('mailer.recipients.create.indeterminate.body') : undefined}
                testId="admin.mailer.recipients.create"
              >
                {t('mailer.recipients.create')}
              </Button>
            }
            testId="admin.mailer.recipients.header"
          />
          <MailerTabs />
        </div>
      }
      filters={
        <>
          <FilterBar testId="admin.mailer.recipients.filters">
            <div className="w-full sm:max-w-xl">
              <SmartFilterInput
                ref={smartInputRef}
                value={smart}
                onChange={(v) => {
                  setSmart(v);
                  if (smartErrors.length) setSmartErrors([]);
                }}
                placeholder={t('mailer.recipients.filters.search.placeholder')}
                ariaLabel={t('mailer.recipients.filters.search.placeholder')}
                testId="admin.mailer.recipients.search.input"
                suggestions={smartSuggestions}
                onSubmit={() => applySmartText(smart)}
                suffix={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 px-0"
                    onClick={() => setHelpOpen(true)}
                    aria-label={t('filters.help.open')}
                    title={t('filters.help.open')}
                    testId="admin.mailer.recipients.smart_filter.help_btn"
                  >
                    <CircleHelp className="h-4 w-4" aria-hidden />
                  </Button>
                }
              />
              {activeFilterChips.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1" data-testid="admin.mailer.recipients.active_filters">
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
              testId="admin.mailer.recipients.advanced.open"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              <span className="ml-2 hidden sm:inline">{t('filters.advanced.label')}</span>
            </Button>

            <CopyButton
              size="sm"
              variant="secondary"
              label={t('common.copy_link')}
              text={typeof window !== 'undefined' ? window.location.href : ''}
              testId="admin.mailer.recipients.copy_link"
            />

            {filtersActive ? (
              <Button variant="secondary" size="sm" onClick={clearFilters} testId="admin.mailer.recipients.filter.clear">
                {t('common.clear_filters')}
              </Button>
            ) : null}
          </FilterBar>

          <SmartInputHelp
            open={helpOpen}
            onClose={() => {
              setHelpOpen(false);
              if (smartNeedle === '?') setSmart('');
            }}
            title={t('filters.help.title')}
            intro={t('mailer.recipients.smart.help.intro')}
            examples={[
              { example: '?', description: t('mailer.recipients.smart.help.examples.help') },
              { example: 'support', description: t('mailer.recipients.smart.help.examples.search') },
              { example: 'label:Support', description: t('mailer.recipients.smart.help.examples.label') },
              { example: 'to:support@example.test', description: t('mailer.recipients.smart.help.examples.to') },
              { example: 'id:10', description: t('mailer.recipients.smart.help.examples.id') },
            ]}
            topKeys={[
              { key: 'q', description: t('mailer.recipients.smart.help.keys.q'), example: 'q:support' },
              { key: 'label', description: t('mailer.recipients.smart.help.keys.label'), example: 'label:Support' },
              { key: 'to', description: t('mailer.recipients.smart.help.keys.to'), example: 'to:support@example.test' },
              { key: 'cc', description: t('mailer.recipients.smart.help.keys.cc'), example: 'cc:team@example.test' },
              { key: 'bcc', description: t('mailer.recipients.smart.help.keys.bcc'), example: 'bcc:audit@example.test' },
              { key: 'id', description: t('mailer.recipients.smart.help.keys.id'), example: 'id:10' },
            ]}
            inference={[
              t('mailer.recipients.smart.help.inference.free_text'),
              t('mailer.recipients.smart.help.inference.numeric'),
              t('mailer.recipients.smart.help.inference.advanced'),
            ]}
            onInsertKey={(key) => {
              setSmart(`${key}:`);
              setHelpOpen(false);
              window.setTimeout(() => smartInputRef.current?.focus(), 50);
            }}
            actions={[
              { label: t('filters.advanced.open'), onClick: () => { setHelpOpen(false); setAdvancedOpen(true); }, variant: 'secondary' },
            ]}
            testId="admin.mailer.recipients.smart_help"
            keyRowTestIdPrefix="admin.mailer.recipients.smart_help.key"
          />

          <MailRecipientsAdvancedFilters
            open={advancedOpen}
            filtersActive={filtersActive}
            values={{ q, label: labelFilter, to: toFilter, cc: ccFilter, bcc: bccFilter }}
            onClose={() => setAdvancedOpen(false)}
            onClear={clearFilters}
            onChange={setFilter}
          />
        </>
      }
    >
      {listQ.isLoading ? (
        <LoadingState testId="admin.mailer.recipients.loading" />
      ) : listQ.isError ? (
        <ErrorState
          testId="admin.mailer.recipients.error"
          title={t('mailer.recipients.list.load_error')}
          error={listQ.error}
          onRetry={() => void listQ.refetch()}
          detailsExtra={{ page: 'admin.mailer.recipients.list' }}
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          testId="admin.mailer.recipients.empty"
          title={filtersActive ? t('empty.list.no_matches.title') : t('empty.list.empty.title')}
          body={filtersActive ? t('empty.list.no_matches.body') : t('empty.list.empty.body')}
        />
      ) : (
        <MailRecipientResults
          rows={rows}
          canPaginate={canPaginate}
          onEdit={openEdit}
          renderPagination={renderPagination}
        />
      )}

      <MailRecipientEditorModal
        open={editorOpen}
        editing={editing !== null}
        form={form}
        pending={editorPending}
        saveDisabled={saveDisabled}
        stale={editingStale}
        error={createM.error ?? updateM.error}
        onChange={setForm}
        onClose={closeEditor}
        onLoadServerVersion={loadServerVersion}
        onSubmit={submitEditor}
      />

    </ListShell>
  );
}
