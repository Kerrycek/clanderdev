import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppMode } from '../../../../app/appMode';
import { useI18n } from '../../../../app/i18n';

import {
  deleteMailTemplateTranslation,
  fetchMailTemplate,
  fetchMailTemplateTranslation,
  updateMailTemplateTranslation,
  type MailTemplate,
  type MailTemplateTranslation,
} from '../../../../lib/api/mailer';
import { HaveApiError, isAmbiguousMutationError } from '../../../../lib/api/haveapi';
import { DetailShell } from '../../../../components/layout/DetailShell';

import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { LoadingState } from '../../../../components/ui/LoadingState';
import { ObjectHeader } from '../../../../components/ui/ObjectHeader';

import { MailerTabs } from './MailerTabs';
import { MailTemplateTranslationActions } from './MailTemplateTranslationActions';
import { MailTemplateTranslationContent } from './MailTemplateTranslationContent';
import { MailTemplateTranslationDialogs } from './MailTemplateTranslationDialogs';
import {
  translationToForm,
  translationVersion,
  type TranslationForm,
} from './MailTemplateTranslationModel';
import { strictPositiveIntegerId } from './mailerMutationSafety';

function parsePositiveInt(v: string | undefined): number | null {
  return strictPositiveIntegerId(v);
}

export function MailTemplateTranslationPage() {
  const { basePath } = useAppMode();
  const { t } = useI18n();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { mailTemplateId, translationId } = useParams();
  const tplId = useMemo(() => parsePositiveInt(mailTemplateId), [mailTemplateId]);
  const trId = useMemo(() => parsePositiveInt(translationId), [translationId]);
  const translationShowQueryKey = useMemo(
    () => ['mailer', 'mail_templates', 'translations', 'show', { tplId, trId }] as const,
    [tplId, trId],
  );

  const tplQ = useQuery({
    queryKey: ['mailer', 'mail_templates', 'show', { id: tplId }],
    enabled: tplId !== null,
    queryFn: async () => (await fetchMailTemplate(tplId as number)).data,
    staleTime: 30_000,
  });

  const trQ = useQuery({
    queryKey: translationShowQueryKey,
    enabled: tplId !== null && trId !== null,
    queryFn: async () => (await fetchMailTemplateTranslation(tplId as number, trId as number)).data,
    staleTime: 15_000,
  });

  const [tab, setTab] = useState<'plain' | 'html'>('plain');
  const [showRawHtml, setShowRawHtml] = useState(false);

  const [editingEnabled, setEditingEnabled] = useState(false);
  const [confirmEnableEditingOpen, setConfirmEnableEditingOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editVersion, setEditVersion] = useState<string | null>(null);
  const saveSubmitRef = useRef(false);
  const deleteSubmitRef = useRef(false);

  const [form, setForm] = useState<TranslationForm>({
    from: '',
    reply_to: '',
    return_path: '',
    subject: '',
    text_plain: '',
    text_html: '',
  });

  useEffect(() => {
    if (!trQ.data || editingEnabled) return;
    setForm(translationToForm(trQ.data));
    setEditVersion(null);
  }, [editingEnabled, trQ.data]);

  const saveM = useMutation({
    mutationFn: async () => {
      if (tplId === null || trId === null) throw new Error('invalid id');
      if (editVersion === null) throw new Error(t('mailer.translations.detail.stale.body'));

      const latest = (await fetchMailTemplateTranslation(tplId, trId)).data;
      if (strictPositiveIntegerId(latest?.id) !== trId) {
        throw new TypeError('Malformed mail template translation readback: mismatched id');
      }
      if (!latest || translationVersion(latest) !== editVersion) {
        if (latest) qc.setQueryData(translationShowQueryKey, latest);
        throw new Error(t('mailer.translations.detail.stale.body'));
      }
      return (
        await updateMailTemplateTranslation(tplId, trId, {
          from: form.from.trim(),
          reply_to: form.reply_to.trim() || null,
          return_path: form.return_path.trim() || null,
          subject: form.subject.trim(),
          text_plain: form.text_plain || null,
          text_html: form.text_html || null,
        })
      ).data;
    },
    onSuccess: async (saved) => {
      if (saved) {
        qc.setQueryData(translationShowQueryKey, saved);
        setForm(translationToForm(saved));
        setEditVersion(translationVersion(saved));
      }
      await qc.invalidateQueries({ queryKey: ['mailer', 'mail_templates', 'translations'] });
      await qc.invalidateQueries({ queryKey: ['mailer', 'mail_templates', 'show'] });
      await qc.invalidateQueries({ queryKey: ['mailer', 'mail_templates', 'index'] });
    },
    onSettled: () => {
      saveSubmitRef.current = false;
    },
  });

  const finishTranslationDeletion = async () => {
    qc.removeQueries({ queryKey: translationShowQueryKey, exact: true });
    setConfirmDeleteOpen(false);
    nav(`${basePath}/mailer/templates/${tplId}`);
    await qc.invalidateQueries({
      queryKey: ['mailer', 'mail_templates', 'translations', 'index'],
    });
  };

  const deleteM = useMutation({
    mutationFn: async () => {
      if (tplId === null || trId === null) throw new Error('invalid id');
      return await deleteMailTemplateTranslation(tplId, trId);
    },
    onSuccess: finishTranslationDeletion,
    onError: async (error) => {
      if (error instanceof HaveApiError && error.httpStatus === 404) {
        await finishTranslationDeletion();
        return;
      }
      if (!isAmbiguousMutationError(error)) return;
      if (tplId === null || trId === null) return;

      try {
        const refreshed = (await fetchMailTemplateTranslation(tplId, trId)).data;
        if (strictPositiveIntegerId(refreshed?.id) === trId) {
          qc.setQueryData(translationShowQueryKey, refreshed);
        }
      } catch (readbackError) {
        if (readbackError instanceof HaveApiError && readbackError.httpStatus === 404) {
          await finishTranslationDeletion();
        }
      }
    },
    onSettled: () => {
      deleteSubmitRef.current = false;
    },
  });

  if (tplId === null || trId === null) {
    return (
      <DetailShell variant="wide" testId="admin.mailer.templates.translation.detail">
        <MailerTabs />
        <ErrorState
          testId="admin.mailer.templates.translation.detail.invalid"
          title={t('mailer.translations.detail.invalid_title')}
          error={new Error('invalid id')}
          detailsExtra={{ page: 'admin.mailer.templates.translation.detail', mailTemplateId, translationId }}
        />
      </DetailShell>
    );
  }

  const tpl = tplQ.data as MailTemplate | undefined;
  const tr = trQ.data as MailTemplateTranslation | undefined;
  const editingStale = Boolean(
    editingEnabled && editVersion !== null && tr && translationVersion(tr) !== editVersion,
  );

  const tplLabel = String((tpl as any)?.label ?? (tpl as any)?.name ?? `#${tplId}`);
  const lang = (tr as any)?.language;
  const langLabel = String((lang as any)?.label ?? (lang as any)?.code ?? t('common.na'));

  const canSave = editingEnabled
    && editVersion !== null
    && !editingStale
    && Boolean(form.from.trim())
    && Boolean(form.subject.trim())
    && !saveM.isPending;

  const resetToLatest = () => {
    if (!tr || saveM.isPending) return;
    setForm(translationToForm(tr));
    setEditVersion(translationVersion(tr));
    saveM.reset();
  };

  return (
    <DetailShell variant="wide" testId="admin.mailer.templates.translation.detail">
      <MailerTabs />

      <ObjectHeader
        title={t('mailer.translations.detail.title', { lang: langLabel })}
        kicker={
          <Link className="text-accent hover:underline" to={`${basePath}/mailer/templates/${tplId}`}>
            {tplLabel}
          </Link>
        }
        badges={<Badge variant="neutral">#{trId}</Badge>}
        meta={
          <span>
            {t('mailer.translations.detail.meta', {
              templateId: tplId,
              language: langLabel,
            })}
          </span>
        }
        actions={tr && tpl && !trQ.isError && !tplQ.isError ? (
          <MailTemplateTranslationActions
            editingEnabled={editingEnabled}
            canSave={canSave}
            savePending={saveM.isPending}
            deletePending={deleteM.isPending}
            onSave={() => {
              if (saveSubmitRef.current || !canSave) return;
              saveSubmitRef.current = true;
              saveM.mutate();
            }}
            onReset={resetToLatest}
            onDelete={() => setConfirmDeleteOpen(true)}
            onEnableEditing={() => setConfirmEnableEditingOpen(true)}
          />
        ) : null}
      />

      {trQ.isLoading || tplQ.isLoading ? (
        <LoadingState testId="admin.mailer.templates.translation.detail.loading" />
      ) : tplQ.isError ? (
        <ErrorState
          testId="admin.mailer.templates.translation.detail.template_error"
          title={t('mailer.templates.detail.load_error')}
          error={tplQ.error}
          onRetry={() => void tplQ.refetch()}
          detailsExtra={{ page: 'admin.mailer.templates.translation.detail.template', tplId, trId }}
        />
      ) : !tpl ? (
        <ErrorState
          testId="admin.mailer.templates.translation.detail.template_not_found"
          kindOverride="not_found"
          title={t('mailer.templates.detail.not_found_title')}
          backTo={`${basePath}/mailer/templates`}
          showStatusLink={false}
          showDetails={false}
          detailsExtra={{ page: 'admin.mailer.templates.translation.detail.template_not_found', tplId, trId }}
        />
      ) : trQ.isError ? (
        <ErrorState
          testId="admin.mailer.templates.translation.detail.error"
          title={t('mailer.translations.detail.load_error')}
          error={trQ.error}
          onRetry={() => void trQ.refetch()}
          detailsExtra={{ page: 'admin.mailer.templates.translation.detail', tplId, trId }}
        />
      ) : !tr ? (
        <ErrorState
          testId="admin.mailer.templates.translation.detail.not_found"
          kindOverride="not_found"
          title={t('mailer.translations.detail.not_found_title')}
          body={t('mailer.translations.detail.not_found_body')}
          backTo={`${basePath}/mailer/templates/${tplId}`}
          showStatusLink={false}
          showDetails={false}
          detailsExtra={{ page: 'admin.mailer.templates.translation.detail', tplId, trId }}
        />
      ) : (
        <>
          <MailTemplateTranslationContent
            translation={tr}
            editingEnabled={editingEnabled}
            editingStale={editingStale}
            savePending={saveM.isPending}
            saveError={saveM.error}
            form={form}
            tab={tab}
            showRawHtml={showRawHtml}
            onFormChange={setForm}
            onTabChange={setTab}
            onRawHtmlChange={setShowRawHtml}
            onResetStale={resetToLatest}
          />

          <Button variant="secondary" onClick={() => nav(`${basePath}/mailer/templates/${tplId}`)} testId="admin.mailer.templates.translation.detail.back">
            {t('common.back')}
          </Button>

          <MailTemplateTranslationDialogs
            enableEditingOpen={confirmEnableEditingOpen}
            deleteOpen={confirmDeleteOpen}
            deletePending={deleteM.isPending}
            deleteError={deleteM.error}
            onCancelEnableEditing={() => setConfirmEnableEditingOpen(false)}
            onConfirmEnableEditing={() => {
              setConfirmEnableEditingOpen(false);
              if (tr) {
                setForm(translationToForm(tr));
                setEditVersion(translationVersion(tr));
              }
              setEditingEnabled(true);
            }}
            onCancelDelete={() => {
              if (!deleteM.isPending) setConfirmDeleteOpen(false);
            }}
            onConfirmDelete={() => {
              if (deleteSubmitRef.current || deleteM.isPending) return;
              deleteSubmitRef.current = true;
              deleteM.mutate();
            }}
          />
        </>
      )}
    </DetailShell>
  );
}
