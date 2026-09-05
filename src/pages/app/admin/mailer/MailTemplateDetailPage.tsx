import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppMode } from '../../../../app/appMode';
import { useAuth } from '../../../../app/auth';
import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';

import {
  createMailTemplateTranslation,
  deleteMailTemplateRecipient,
  fetchMailTemplate,
  fetchMailTemplateRecipients,
  fetchMailTemplateTranslations,
  updateMailTemplate,
  type MailRecipient,
  type MailTemplate,
  type MailTemplateUpdateInput,
  type MailTemplateRecipient,
  type MailTemplateTranslation,
} from '../../../../lib/api/mailer';
import { fetchLanguages, type Language } from '../../../../lib/api/languages';
import { HaveApiError, isAmbiguousMutationError } from '../../../../lib/api/haveapi';
import { formatErrorMessage } from '../../../../lib/errors';
import { formatDateTime } from '../../../../lib/format';
import { resourceId, refLabel } from '../../../../lib/resources';

import { DetailShell } from '../../../../components/layout/DetailShell';

import { Alert } from '../../../../components/ui/Alert';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { LoadingState } from '../../../../components/ui/LoadingState';
import { Modal } from '../../../../components/ui/Modal';
import { ObjectHeader } from '../../../../components/ui/ObjectHeader';
import type { SelectOption } from '../../../../components/ui/Select';
import { TableCard } from '../../../../components/ui/TableCard';
import { TableRowLink } from '../../../../components/ui/TableRowLink';

import { MailerTabs } from './MailerTabs';
import {
  MailTemplateEditorModal,
  mailTemplateEditorUpdatePayload,
} from './MailTemplateEditorModal';
import { MailTemplateRecipientModal } from './MailTemplateRecipientModal';
import { MailTemplateSummaryCard } from './MailTemplateSummaryCard';
import {
  MailTemplateTranslationCreateIndeterminateGuard,
  type IndeterminateMailTemplateTranslationCreateAttempt,
} from './MailTemplateTranslationCreateIndeterminateGuard';
import {
  emptyMailTemplateTranslationDraft,
  MailTemplateTranslationDraftFields,
  type MailTemplateTranslationDraft,
} from './MailTemplateTranslationDraftFields';
import {
  clearMailTemplateTranslationCreateGuard,
  persistMailTemplateTranslationCreateGuard,
  readMailTemplateTranslationCreateGuard,
} from './mailTemplateCreateGuardStorage';
import {
  readMailRecipientCreateGuard,
  readMailTemplateRecipientGuard,
} from './mailRecipientMutationGuardStorage';
import { mailTemplateEditFingerprint, strictPositiveIntegerId } from './mailerMutationSafety';

class StaleMailTemplateEditError extends Error {
  constructor() {
    super('mail template changed on server');
    this.name = 'StaleMailTemplateEditError';
  }
}

function parsePositiveInt(v: string | undefined): number | null {
  return strictPositiveIntegerId(v);
}

const MAILER_RELATION_FETCH_LIMIT = 500;

export function MailTemplateDetailPage() {
  const { basePath } = useAppMode();
  const { t } = useI18n();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { pushToast } = useToasts();
  const auth = useAuth();
  const guardScope = String(auth.user?.id ?? 'unknown');

  const { mailTemplateId } = useParams();
  const id = useMemo(() => parsePositiveInt(mailTemplateId), [mailTemplateId]);

  const tplQ = useQuery({
    queryKey: ['mailer', 'mail_templates', 'show', { id }],
    enabled: id !== null,
    queryFn: async () => (await fetchMailTemplate(id as number)).data,
    staleTime: 15_000,
  });

  const recipientsQ = useQuery({
    queryKey: ['mailer', 'mail_templates', 'recipients', 'index', { id, limit: MAILER_RELATION_FETCH_LIMIT }],
    enabled: id !== null,
    queryFn: async () => (await fetchMailTemplateRecipients(id as number, { limit: MAILER_RELATION_FETCH_LIMIT })).data,
    staleTime: 10_000,
  });

  const translationsQ = useQuery({
    queryKey: ['mailer', 'mail_templates', 'translations', 'index', { id, limit: MAILER_RELATION_FETCH_LIMIT }],
    enabled: id !== null,
    queryFn: async () => (await fetchMailTemplateTranslations(id as number, { limit: MAILER_RELATION_FETCH_LIMIT })).data,
    staleTime: 10_000,
  });

  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [templateEditorError, setTemplateEditorError] = useState<string | null>(null);
  const [templateEditorBaseline, setTemplateEditorBaseline] = useState<string | null>(null);
  const [templateEditorStale, setTemplateEditorStale] = useState(false);
  const updateTemplateM = useMutation({
    mutationFn: async (payload: MailTemplateUpdateInput) => {
      if (id === null) throw new Error('invalid template id');
      if (templateEditorBaseline === null) throw new Error('missing template edit baseline');

      const latest = (await fetchMailTemplate(id)).data;
      if (strictPositiveIntegerId(latest?.id) !== id) {
        throw new TypeError('Malformed mail template readback: mismatched id');
      }
      if (mailTemplateEditFingerprint(latest) !== templateEditorBaseline) {
        qc.setQueryData(['mailer', 'mail_templates', 'show', { id }], latest);
        setTemplateEditorStale(true);
        throw new StaleMailTemplateEditError();
      }
      return (await updateMailTemplate(id, payload)).data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['mailer', 'mail_templates'] });
      setTemplateEditorOpen(false);
      setTemplateEditorError(null);
      pushToast({ variant: 'ok', title: t('mailer.templates.update.success') });
    },
    onError: (error) => {
      if (error instanceof StaleMailTemplateEditError) {
        setTemplateEditorError(null);
        return;
      }
      const message = formatErrorMessage(error);
      setTemplateEditorError(message);
      pushToast({ variant: 'danger', title: t('mailer.templates.update.error'), body: message });
    },
  });

  const associatedRecipientIds = useMemo(() => {
    const ids = new Set<number>();
    for (const r of recipientsQ.data ?? []) {
      const mr = (r as any).mail_recipient;
      const rid = resourceId(mr);
      if (rid) ids.add(rid);
    }
    return ids;
  }, [recipientsQ.data]);
  const recipientRelationsCapped = (recipientsQ.data?.length ?? 0) >= MAILER_RELATION_FETCH_LIMIT;
  const translationRelationsCapped = (translationsQ.data?.length ?? 0) >= MAILER_RELATION_FETCH_LIMIT;

  // --- Add / create recipient modal ---
  const [recipientModalOpen, setRecipientModalOpen] = useState(false);
  const [recipientRecoveryAvailable, setRecipientRecoveryAvailable] = useState(() => (
    id !== null && Boolean(
      readMailTemplateRecipientGuard(guardScope, id)
      || readMailRecipientCreateGuard(guardScope),
    )
  ));

  useEffect(() => {
    setRecipientRecoveryAvailable(
      id !== null && Boolean(
        readMailTemplateRecipientGuard(guardScope, id)
        || readMailRecipientCreateGuard(guardScope),
      ),
    );
  }, [guardScope, id]);

  const [removeRecipientId, setRemoveRecipientId] = useState<number | null>(null);
  const removeRecipientSubmitRef = useRef(false);

  const finishRecipientRemoval = async () => {
    await qc.invalidateQueries({ queryKey: ['mailer', 'mail_templates', 'recipients'] });
    await qc.invalidateQueries({ queryKey: ['mailer', 'mail_templates', 'show'] });
    await qc.invalidateQueries({ queryKey: ['mailer', 'mail_templates', 'index'] });
    setRemoveRecipientId(null);
  };

  const removeRecipientM = useMutation({
    mutationFn: async (mailRecipientId: number) => {
      if (id === null) throw new Error('invalid template id');
      return await deleteMailTemplateRecipient(id, mailRecipientId);
    },
    onSuccess: finishRecipientRemoval,
    onError: async (error, mailRecipientId) => {
      if (error instanceof HaveApiError && error.httpStatus === 404) {
        await finishRecipientRemoval();
        return;
      }
      if (!isAmbiguousMutationError(error)) return;

      const refreshed = await recipientsQ.refetch();
      const relations = refreshed.data ?? [];
      const complete = !refreshed.isError && relations.length < MAILER_RELATION_FETCH_LIMIT;
      const stillLinked = relations.some((relation) => (
        resourceId((relation as MailTemplateRecipient).mail_recipient) === mailRecipientId
      ));
      if (complete && !stillLinked) await finishRecipientRemoval();
    },
    onSettled: () => {
      removeRecipientSubmitRef.current = false;
    },
  });

  const removeRecipientTarget = useMemo(() => {
    if (removeRecipientId === null) return null;
    const relation = (recipientsQ.data ?? []).find((candidate) => (
      resourceId((candidate as MailTemplateRecipient).mail_recipient) === removeRecipientId
    ));
    const recipient = (relation as MailTemplateRecipient | undefined)?.mail_recipient;
    return {
      id: removeRecipientId,
      label: refLabel(recipient) ?? `#${removeRecipientId}`,
    };
  }, [recipientsQ.data, removeRecipientId]);

  // --- Add translation modal (guarded) ---
  const [confirmAddTranslationOpen, setConfirmAddTranslationOpen] = useState(false);
  const [translationModalOpen, setTranslationModalOpen] = useState(false);
  const [indeterminateTranslation, setIndeterminateTranslation] = useState<IndeterminateMailTemplateTranslationCreateAttempt | null>(
    () => id === null ? null : readMailTemplateTranslationCreateGuard(guardScope, id),
  );
  const createTranslationSubmitRef = useRef(false);

  useEffect(() => {
    setIndeterminateTranslation(
      id === null ? null : readMailTemplateTranslationCreateGuard(guardScope, id),
    );
  }, [guardScope, id]);

  const languagesQ = useQuery({
    queryKey: ['languages', 'index', { limit: MAILER_RELATION_FETCH_LIMIT }],
    queryFn: async () => (await fetchLanguages({ limit: MAILER_RELATION_FETCH_LIMIT })).data,
    staleTime: 60_000,
  });
  const languagesCapped = (languagesQ.data?.length ?? 0) >= MAILER_RELATION_FETCH_LIMIT;

  const usedLanguageIds = useMemo(() => {
    const ids = new Set<number>();
    for (const translation of translationsQ.data ?? []) {
      const languageId = resourceId(translation.language);
      if (languageId) ids.add(languageId);
    }
    return ids;
  }, [translationsQ.data]);

  const languageOptions: SelectOption[] = useMemo(() => {
    const opts: SelectOption[] = [{ value: '', label: t('common.select') }];
    for (const l of languagesQ.data ?? []) {
      const lid = Number((l as any).id);
      if (!Number.isFinite(lid) || lid <= 0) continue;
      if (usedLanguageIds.has(lid)) continue;
      const label = String((l as any).label ?? (l as any).code ?? `#${lid}`);
      opts.push({ value: String(lid), label });
    }
    return opts;
  }, [languagesQ.data, t, usedLanguageIds]);

  const [newTranslation, setNewTranslation] = useState<MailTemplateTranslationDraft>(
    emptyMailTemplateTranslationDraft,
  );
  const selectedLanguageAvailable = languageOptions.some((option) => (
    option.value !== '' && option.value === newTranslation.language
  ));

  const createTranslationM = useMutation({
    mutationFn: async (payload: {
      language: number;
      from: string;
      reply_to?: string | null;
      return_path?: string | null;
      subject: string;
      text_plain?: string | null;
      text_html?: string | null;
    }) => {
      if (id === null) throw new Error('invalid template id');
      const languageLabel = languageOptions.find((option) => option.value === String(payload.language))?.label
        ?? `#${payload.language}`;
      if (!persistMailTemplateTranslationCreateGuard(guardScope, id, { ...payload, languageLabel })) {
        throw new Error(t('mailer.templates.detail.translations.modal.guard_storage_error'));
      }
      const created = (await createMailTemplateTranslation(id, payload)).data;
      const createdId = strictPositiveIntegerId(created?.id);
      if (createdId === null) {
        throw new TypeError('Malformed mail template translation create response: missing id');
      }
      return { ...created, id: createdId };
    },
    onSuccess: async () => {
      clearMailTemplateTranslationCreateGuard(guardScope, id as number);
      await qc.invalidateQueries({ queryKey: ['mailer', 'mail_templates', 'translations'] });
      await qc.invalidateQueries({ queryKey: ['mailer', 'mail_templates', 'show'] });
      await qc.invalidateQueries({ queryKey: ['mailer', 'mail_templates', 'index'] });
      setTranslationModalOpen(false);
      setIndeterminateTranslation(null);
      setNewTranslation(emptyMailTemplateTranslationDraft());
    },
    onError: (error, payload) => {
      if (!isAmbiguousMutationError(error)) {
        if (id !== null) clearMailTemplateTranslationCreateGuard(guardScope, id);
        return;
      }
      const languageLabel = languageOptions.find((option) => option.value === String(payload.language))?.label
        ?? `#${payload.language}`;
      setIndeterminateTranslation({ ...payload, languageLabel });
      setTranslationModalOpen(false);
    },
    onSettled: () => {
      createTranslationSubmitRef.current = false;
    },
  });

  if (id === null) {
    return (
      <DetailShell variant="wide" testId="admin.mailer.templates.detail">
        <MailerTabs />
        <ErrorState
          testId="admin.mailer.templates.detail.invalid"
          title={t('mailer.templates.detail.invalid_title')}
          error={new Error('invalid template id')}
          detailsExtra={{ page: 'admin.mailer.templates.detail' }}
        />
      </DetailShell>
    );
  }

  const tpl = tplQ.data as MailTemplate | undefined;
  const title = String(tpl?.label ?? tpl?.name ?? `#${id}`);

  return (
    <DetailShell variant="wide" testId="admin.mailer.templates.detail">
      <MailerTabs />

      <ObjectHeader
        title={title}
        kicker={
          <Link className="text-accent hover:underline" to={`${basePath}/mailer/templates`}>
            {t('mailer.templates.list.title')}
          </Link>
        }
        meta={<span className="text-xs text-faint">#{id}</span>}
        actions={
          tpl ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setTemplateEditorBaseline(mailTemplateEditFingerprint(tpl));
                  setTemplateEditorStale(false);
                  setTemplateEditorError(null);
                  updateTemplateM.reset();
                  setTemplateEditorOpen(true);
                }}
                testId="admin.mailer.templates.detail.edit"
              >
                {t('common.edit')}
              </Button>
              <Button
                variant="danger"
                disabled
                disabledReason={t('mailer.templates.delete.blocked_body')}
                testId="admin.mailer.templates.detail.delete.blocked"
              >
                {t('common.delete')}
              </Button>
            </>
          ) : null
        }
      />

      {tplQ.isLoading ? (
        <LoadingState testId="admin.mailer.templates.detail.loading" />
      ) : tplQ.isError ? (
        <ErrorState
          testId="admin.mailer.templates.detail.error"
          title={t('mailer.templates.detail.load_error')}
          error={tplQ.error}
          onRetry={() => void tplQ.refetch()}
          detailsExtra={{ page: 'admin.mailer.templates.detail' }}
        />
      ) : !tpl ? (
        <ErrorState
          testId="admin.mailer.templates.detail.not_found"
          title={t('mailer.templates.detail.not_found_title')}
          error={new Error('not found')}
          onRetry={() => void tplQ.refetch()}
          detailsExtra={{ page: 'admin.mailer.templates.detail.not_found' }}
        />
      ) : (
        <>
          <Alert
            variant="warn"
            title={t('mailer.templates.delete.blocked_title')}
            testId="admin.mailer.templates.detail.delete_blocked"
          >
            {t('mailer.templates.delete.blocked_body')}
          </Alert>

          <MailTemplateSummaryCard template={tpl} />

          {/* Recipients */}
          <Card>
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <div className="text-sm font-semibold">{t('mailer.templates.detail.recipients.title')}</div>
                <div className="text-xs text-muted">{t('mailer.templates.detail.recipients.subtitle')}</div>
              </div>
              <Button
                variant="secondary"
                onClick={() => setRecipientModalOpen(true)}
                disabled={
                  recipientsQ.data === undefined
                  || recipientsQ.isError
                  || (recipientRelationsCapped && !recipientRecoveryAvailable)
                }
                disabledReason={recipientRelationsCapped && !recipientRecoveryAvailable
                  ? t('mailer.templates.detail.recipients.relation_fetch_limit_notice', { limit: MAILER_RELATION_FETCH_LIMIT })
                  : recipientsQ.data === undefined || recipientsQ.isError
                    ? t('mailer.templates.detail.recipients.actions_unavailable')
                    : undefined}
                testId="admin.mailer.templates.detail.recipients.add"
              >
                {t('mailer.templates.detail.recipients.add')}
              </Button>
            </div>
            <div className="p-4">
              {recipientRelationsCapped ? (
                <div className="mb-4">
                  <Alert variant="warn" testId="admin.mailer.templates.detail.recipients.fetch_limit_notice">
                    {t('mailer.templates.detail.recipients.relation_fetch_limit_notice', { limit: MAILER_RELATION_FETCH_LIMIT })}
                  </Alert>
                </div>
              ) : null}
              {recipientsQ.isLoading ? (
                <LoadingState testId="admin.mailer.templates.detail.recipients.loading" />
              ) : recipientsQ.isError ? (
                <ErrorState
                  testId="admin.mailer.templates.detail.recipients.error"
                  title={t('mailer.templates.detail.recipients.load_error')}
                  error={recipientsQ.error}
                  onRetry={() => void recipientsQ.refetch()}
                  detailsExtra={{ page: 'admin.mailer.templates.detail.recipients' }}
                />
              ) : (recipientsQ.data ?? []).length === 0 ? (
                <div className="text-sm text-muted">{t('mailer.templates.detail.recipients.empty')}</div>
              ) : (
                <TableCard minWidth="md" tableTestId="admin.mailer.templates.detail.recipients.table">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted">
                      <th className="px-4 py-2">{t('common.label')}</th>
                      <th className="px-4 py-2">{t('mailer.recipients.fields.to')}</th>
                      <th className="px-4 py-2">{t('mailer.recipients.fields.cc')}</th>
                      <th className="px-4 py-2">{t('mailer.recipients.fields.bcc')}</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {(recipientsQ.data ?? []).map((r: MailTemplateRecipient) => {
                      const mr = (r as any).mail_recipient as MailRecipient | undefined;
                      const rid = resourceId(mr);
                      const label = refLabel(mr) ?? (rid ? `#${rid}` : t('common.na'));
                      const to = String((mr as any)?.to ?? '');
                      const cc = String((mr as any)?.cc ?? '');
                      const bcc = String((mr as any)?.bcc ?? '');

                      return (
                        <tr key={rid ?? (r as any).id} className="border-b border-border">
                          <td className="px-4 py-2 text-sm">{label}</td>
                          <td className="max-w-xs truncate px-4 py-2 text-sm" title={to}>
                            {to || <span className="text-muted">{t('common.na')}</span>}
                          </td>
                          <td className="max-w-xs truncate px-4 py-2 text-sm" title={cc}>
                            {cc || <span className="text-muted">{t('common.na')}</span>}
                          </td>
                          <td className="max-w-xs truncate px-4 py-2 text-sm" title={bcc}>
                            {bcc || <span className="text-muted">{t('common.na')}</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-sm">
                            {rid ? (
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => {
                                  removeRecipientM.reset();
                                  setRemoveRecipientId(rid);
                                }}
                                testId={`admin.mailer.templates.detail.recipients.remove.${rid}`}
                              >
                                {t('common.remove')}
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableCard>
              )}
            </div>
          </Card>

          {/* Translations */}
          <Card>
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <div className="text-sm font-semibold">{t('mailer.templates.detail.translations.title')}</div>
                <div className="text-xs text-muted">{t('mailer.templates.detail.translations.subtitle')}</div>
              </div>
              <Button
                variant="secondary"
                onClick={() => setConfirmAddTranslationOpen(true)}
                disabled={
                  indeterminateTranslation !== null
                  || translationsQ.data === undefined
                  || translationsQ.isError
                  || languagesQ.data === undefined
                  || languagesQ.isError
                  || translationRelationsCapped
                  || languagesCapped
                  || languageOptions.length <= 1
                }
                disabledReason={indeterminateTranslation
                  ? t('mailer.templates.detail.translations.indeterminate.body')
                  : translationRelationsCapped || languagesCapped
                    ? t('mailer.templates.detail.translations.fetch_limit_notice', { limit: MAILER_RELATION_FETCH_LIMIT })
                  : (translationsQ.data === undefined || translationsQ.isError || languagesQ.data === undefined || languagesQ.isError)
                    ? t('mailer.templates.detail.translations.actions_unavailable')
                    : languageOptions.length <= 1
                      ? t('mailer.templates.detail.translations.no_available_languages')
                      : undefined}
                testId="admin.mailer.templates.detail.translations.add"
              >
                {t('mailer.templates.detail.translations.add')}
              </Button>
            </div>
            <div className="p-4">
              {translationRelationsCapped || languagesCapped ? (
                <div className="mb-4">
                  <Alert variant="warn" testId="admin.mailer.templates.detail.translations.fetch_limit_notice">
                    {t('mailer.templates.detail.translations.fetch_limit_notice', { limit: MAILER_RELATION_FETCH_LIMIT })}
                  </Alert>
                </div>
              ) : null}
              {indeterminateTranslation ? (
                <div className="mb-4">
                  <MailTemplateTranslationCreateIndeterminateGuard
                    templateId={id}
                    attempt={indeterminateTranslation}
                    onListRefresh={() => translationsQ.refetch()}
                    onResolved={() => {
                      clearMailTemplateTranslationCreateGuard(guardScope, id);
                      setIndeterminateTranslation(null);
                    }}
                  />
                </div>
              ) : null}
              {languagesQ.isError ? (
                <div className="mb-4">
                  <Alert
                    variant="danger"
                    title={t('mailer.templates.detail.translations.languages_load_error')}
                    testId="admin.mailer.templates.detail.translations.languages_error"
                  >
                    <Button variant="secondary" size="sm" onClick={() => void languagesQ.refetch()}>
                      {t('common.retry')}
                    </Button>
                  </Alert>
                </div>
              ) : null}
              {!languagesQ.isLoading && !languagesQ.isError && languageOptions.length <= 1 ? (
                <div className="mb-4">
                  <Alert
                    variant="info"
                    title={t('mailer.templates.detail.translations.no_available_languages')}
                    testId="admin.mailer.templates.detail.translations.no_available_languages"
                  >
                    {t('mailer.templates.detail.translations.no_available_languages_body')}
                  </Alert>
                </div>
              ) : null}
              {translationsQ.isLoading ? (
                <LoadingState testId="admin.mailer.templates.detail.translations.loading" />
              ) : translationsQ.isError ? (
                <ErrorState
                  testId="admin.mailer.templates.detail.translations.error"
                  title={t('mailer.templates.detail.translations.load_error')}
                  error={translationsQ.error}
                  onRetry={() => void translationsQ.refetch()}
                  detailsExtra={{ page: 'admin.mailer.templates.detail.translations' }}
                />
              ) : (translationsQ.data ?? []).length === 0 ? (
                <Alert variant="info" title={t('mailer.templates.detail.translations.empty_title')}>
                  {t('mailer.templates.detail.translations.empty')}
                </Alert>
              ) : (
                <TableCard minWidth="lg" tableTestId="admin.mailer.templates.detail.translations.table">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted">
                      <th className="px-4 py-2">{t('mailer.translations.columns.language')}</th>
                      <th className="px-4 py-2">{t('mailer.translations.columns.subject')}</th>
                      <th className="px-4 py-2">{t('common.updated')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(translationsQ.data ?? []).map((tr: MailTemplateTranslation) => {
                      const tid = Number((tr as any).id);
                      const lang = (tr as any).language as Language | undefined;
                      const langLabel = String((lang as any)?.label ?? (lang as any)?.code ?? t('common.na'));
                      const subject = String((tr as any).subject ?? '');

                      return (
                        <TableRowLink
                          key={tid}
                          to={`${basePath}/mailer/templates/${id}/translations/${tid}`}
                          testId={`admin.mailer.templates.detail.translation.${tid}`}
                        >
                          <td className="px-4 py-2 text-sm">{langLabel}</td>
                          <td className="px-4 py-2 text-sm">
                            {subject ? <span title={subject}>{subject}</span> : <span className="text-muted">{t('common.na')}</span>}
                          </td>
                          <td className="px-4 py-2 text-sm">{formatDateTime((tr as any).updated_at)}</td>
                        </TableRowLink>
                      );
                    })}
                  </tbody>
                </TableCard>
              )}
            </div>
          </Card>

          <Button variant="secondary" onClick={() => nav(-1)} testId="admin.mailer.templates.detail.back">
            {t('common.back')}
          </Button>

          <MailTemplateEditorModal
            open={templateEditorOpen}
            mode="edit"
            template={tpl}
            error={templateEditorError}
            saving={updateTemplateM.isPending}
            stale={templateEditorStale}
            onLoadLatest={() => {
              setTemplateEditorBaseline(mailTemplateEditFingerprint(tpl));
              setTemplateEditorStale(false);
              setTemplateEditorError(null);
              updateTemplateM.reset();
            }}
            onClose={() => {
              setTemplateEditorOpen(false);
              setTemplateEditorError(null);
              setTemplateEditorBaseline(null);
              setTemplateEditorStale(false);
              updateTemplateM.reset();
            }}
            onSubmit={(values) => updateTemplateM.mutate(mailTemplateEditorUpdatePayload(values))}
          />

          <MailTemplateRecipientModal
            key={`${guardScope}:${id}`}
            open={recipientModalOpen}
            templateId={id}
            guardScope={guardScope}
            actionsBlocked={recipientRelationsCapped}
            associatedRecipientIds={associatedRecipientIds}
            onClose={() => {
              setRecipientModalOpen(false);
              setRecipientRecoveryAvailable(Boolean(
                readMailTemplateRecipientGuard(guardScope, id)
                || readMailRecipientCreateGuard(guardScope),
              ));
            }}
          />
          {/* Remove recipient confirm */}
          <ConfirmDialog
            open={removeRecipientId !== null}
            title={t('mailer.templates.detail.recipients.remove_confirm.title')}
            description={t('mailer.templates.detail.recipients.remove_confirm.description')}
            danger
            confirmLabel={t('common.remove')}
            confirmLoading={removeRecipientM.isPending}
            onCancel={() => {
              if (!removeRecipientM.isPending) {
                setRemoveRecipientId(null);
                removeRecipientM.reset();
              }
            }}
            onConfirm={() => {
              if (!removeRecipientId || removeRecipientSubmitRef.current || removeRecipientM.isPending) return;
              removeRecipientSubmitRef.current = true;
              removeRecipientM.mutate(removeRecipientId);
            }}
            testId="admin.mailer.templates.detail.recipients.remove_confirm"
          >
            {removeRecipientTarget ? (
              <p
                className="mb-3 text-sm font-medium"
                data-testid="admin.mailer.templates.detail.recipients.remove_confirm.target"
              >
                {t('mailer.templates.detail.recipients.remove_confirm.target', removeRecipientTarget)}
              </p>
            ) : null}
            {removeRecipientM.isError ? (
              <Alert
                variant="danger"
                title={t('mailer.templates.detail.recipients.remove_error')}
                testId="admin.mailer.templates.detail.recipients.remove_error"
              >
                {formatErrorMessage(removeRecipientM.error)}
              </Alert>
            ) : null}
          </ConfirmDialog>

          {/* Confirm add translation */}
          <ConfirmDialog
            open={confirmAddTranslationOpen}
            title={t('mailer.templates.detail.translations.add_confirm.title')}
            description={t('mailer.templates.detail.translations.add_confirm.description')}
            onCancel={() => setConfirmAddTranslationOpen(false)}
            onConfirm={() => {
              setConfirmAddTranslationOpen(false);
              createTranslationM.reset();
              setNewTranslation(emptyMailTemplateTranslationDraft());
              setTranslationModalOpen(true);
            }}
            testId="admin.mailer.templates.detail.translations.add_confirm"
          />

          {/* Add translation modal */}
          <Modal
            open={translationModalOpen}
            onClose={() => {
              if (!createTranslationM.isPending) {
                setTranslationModalOpen(false);
                setNewTranslation(emptyMailTemplateTranslationDraft());
              }
            }}
            title={t('mailer.templates.detail.translations.add')}
            size="lg"
            testId="admin.mailer.templates.detail.translations.modal"
            footer={
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setTranslationModalOpen(false);
                    setNewTranslation(emptyMailTemplateTranslationDraft());
                  }}
                  disabled={createTranslationM.isPending}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  loading={createTranslationM.isPending}
                  disabled={
                    !newTranslation.from.trim() ||
                    !newTranslation.subject.trim() ||
                    !selectedLanguageAvailable
                  }
                  onClick={() => {
                    if (createTranslationSubmitRef.current || createTranslationM.isPending || indeterminateTranslation) return;
                    const lid = parsePositiveInt(newTranslation.language);
                    if (!lid || !selectedLanguageAvailable) return;
                    createTranslationSubmitRef.current = true;
                    createTranslationM.mutate({
                      language: lid,
                      from: newTranslation.from.trim(),
                      reply_to: newTranslation.reply_to.trim() || null,
                      return_path: newTranslation.return_path.trim() || null,
                      subject: newTranslation.subject.trim(),
                      text_plain: newTranslation.text_plain || undefined,
                      text_html: newTranslation.text_html || undefined,
                    });
                  }}
                  testId="admin.mailer.templates.detail.translations.modal.create"
                >
                  {t('common.create')}
                </Button>
              </div>
            }
          >
            <MailTemplateTranslationDraftFields
              draft={newTranslation}
              languageOptions={languageOptions}
              pending={createTranslationM.isPending}
              error={createTranslationM.error}
              onChange={setNewTranslation}
            />
          </Modal>
        </>
      )}
    </DetailShell>
  );
}
