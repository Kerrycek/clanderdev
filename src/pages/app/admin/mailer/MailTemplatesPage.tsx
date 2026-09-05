import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppMode } from '../../../../app/appMode';
import { useAuth } from '../../../../app/auth';
import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';
import { createMailTemplate, fetchMailTemplates, type MailTemplate } from '../../../../lib/api/mailer';
import { isAmbiguousMutationError } from '../../../../lib/api/haveapi';
import { formatErrorMessage } from '../../../../lib/errors';
import { formatDateTime } from '../../../../lib/format';

import { FilterBar } from '../../../../components/layout/FilterBar';
import { ListShell } from '../../../../components/layout/ListShell';
import { PageHeader } from '../../../../components/layout/PageHeader';
import { Alert } from '../../../../components/ui/Alert';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { CopyButton } from '../../../../components/ui/CopyButton';
import { Drawer } from '../../../../components/ui/Drawer';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { FilterChip } from '../../../../components/ui/FilterChip';
import { Input } from '../../../../components/ui/Input';
import { KeysetPagination } from '../../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../../components/ui/LoadingState';
import { Select, type SelectOption } from '../../../../components/ui/Select';
import { TableCard } from '../../../../components/ui/TableCard';
import { TableRowLink } from '../../../../components/ui/TableRowLink';

import {
  MailTemplateCreateIndeterminateGuard,
  type IndeterminateMailTemplateCreateAttempt,
} from './MailTemplateCreateIndeterminateGuard';
import {
  MailTemplateEditorModal,
  mailTemplateEditorPayload,
  type MailTemplateEditorValues,
} from './MailTemplateEditorModal';
import {
  filterMailTemplates,
  MAIL_TEMPLATE_FETCH_LIMIT,
  MAIL_TEMPLATE_PAGE_LIMITS,
  normalizeMailTemplateListParam,
  parseMailTemplatePage,
  parseMailTemplatePageLimit,
  type MailTemplateListParamName,
} from './MailTemplatesModel';
import { MailerTabs } from './MailerTabs';
import {
  clearMailTemplateCreateGuard,
  persistMailTemplateCreateGuard,
  readMailTemplateCreateGuard,
} from './mailTemplateCreateGuardStorage';
import { strictPositiveIntegerId } from './mailerMutationSafety';

function visibilityBadgeVariant(value: string | undefined): 'neutral' | 'info' | 'warn' {
  if (value === 'visible') return 'info';
  if (value === 'invisible') return 'warn';
  return 'neutral';
}

function visibilityLabelKey(value: string | undefined): string {
  if (value === 'visible') return 'mailer.templates.visibility.visible';
  if (value === 'invisible') return 'mailer.templates.visibility.invisible';
  return 'mailer.templates.visibility.default';
}

export function MailTemplatesPage() {
  const { basePath } = useAppMode();
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const auth = useAuth();
  const guardScope = String(auth.user?.id ?? 'unknown');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [indeterminateCreate, setIndeterminateCreate] = useState<IndeterminateMailTemplateCreateAttempt | null>(
    () => readMailTemplateCreateGuard(guardScope),
  );

  useEffect(() => {
    setIndeterminateCreate(readMailTemplateCreateGuard(guardScope));
  }, [guardScope]);

  const qParam = searchParams.get('q') ?? '';
  const [q, setQ] = useState(qParam);
  const templateId = searchParams.get('template_id') ?? '';
  const userVisibility = searchParams.get('user_visibility') ?? '';
  const limit = parseMailTemplatePageLimit(searchParams.get('limit'));

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;
    for (const legacyParam of ['from_id', 'role', 'public', 'language']) {
      if (next.has(legacyParam)) {
        next.delete(legacyParam);
        changed = true;
      }
    }
    if (changed) setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const listQ = useQuery({
    queryKey: ['mailer', 'mail_templates', 'index', { limit: MAIL_TEMPLATE_FETCH_LIMIT }],
    queryFn: async () => (await fetchMailTemplates({ limit: MAIL_TEMPLATE_FETCH_LIMIT })).data,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const filteredRows = useMemo(
    () => filterMailTemplates(listQ.data ?? [], { q, templateId, userVisibility }),
    [listQ.data, q, templateId, userVisibility],
  );
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / limit));
  const page = parseMailTemplatePage(searchParams.get('page'), pageCount);
  const rows = filteredRows.slice((page - 1) * limit, page * limit);
  const filtersActive = Boolean(q.trim() || templateId.trim() || userVisibility.trim());
  const fetchLimitReached = (listQ.data?.length ?? 0) >= MAIL_TEMPLATE_FETCH_LIMIT;

  const visibilityOptions: SelectOption[] = useMemo(
    () => [
      { value: '', label: t('common.all') },
      { value: 'default', label: t('mailer.templates.visibility.default') },
      { value: 'visible', label: t('mailer.templates.visibility.visible') },
      { value: 'invisible', label: t('mailer.templates.visibility.invisible') },
    ],
    [t],
  );

  const setListParam = useCallback((name: MailTemplateListParamName, value: string | number) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      const normalized = normalizeMailTemplateListParam(name, value);
      if (!normalized || (name === 'page' && normalized === '1') || (name === 'limit' && normalized === '50')) {
        next.delete(name);
      } else {
        next.set(name, normalized);
      }
      if (name !== 'page') next.delete('page');
      next.delete('from_id');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    setQ(qParam);
  }, [qParam]);

  useEffect(() => {
    if (q === qParam) return;
    const timeout = window.setTimeout(() => setListParam('q', q), 150);
    return () => window.clearTimeout(timeout);
  }, [q, qParam, setListParam]);

  const clearFilters = () => {
    setQ('');
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const name of ['q', 'template_id', 'user_visibility', 'page', 'from_id']) next.delete(name);
      return next;
    }, { replace: true });
  };

  const createM = useMutation({
    mutationFn: async (values: MailTemplateEditorValues) => {
      const payload = mailTemplateEditorPayload(values);
      if (!persistMailTemplateCreateGuard(guardScope, payload)) {
        throw new Error(t('mailer.templates.create.guard_storage_error'));
      }
      const created = (await createMailTemplate(payload)).data;
      const createdId = strictPositiveIntegerId(created?.id);
      if (createdId === null) {
        throw new TypeError('Malformed mail template create response: missing id');
      }
      return { ...created, id: createdId };
    },
    onSuccess: async (template) => {
      clearMailTemplateCreateGuard(guardScope);
      await queryClient.invalidateQueries({ queryKey: ['mailer', 'mail_templates'] });
      setEditorOpen(false);
      setEditorError(null);
      setIndeterminateCreate(null);
      pushToast({ variant: 'ok', title: t('mailer.templates.create.success') });
      navigate(`${basePath}/mailer/templates/${template.id}`);
    },
    onError: (error, values) => {
      if (isAmbiguousMutationError(error)) {
        setIndeterminateCreate(mailTemplateEditorPayload(values));
        setEditorOpen(false);
        setEditorError(null);
        return;
      }
      clearMailTemplateCreateGuard(guardScope);
      const message = formatErrorMessage(error);
      setEditorError(message);
      pushToast({ variant: 'danger', title: t('mailer.templates.create.error'), body: message });
    },
  });

  const openCreate = () => {
    if (indeterminateCreate) return;
    createM.reset();
    setEditorError(null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (createM.isPending) return;
    setEditorOpen(false);
    setEditorError(null);
  };

  const renderPagination = (testId: string) => filteredRows.length > 0 ? (
    <KeysetPagination
      page={page}
      pageCount={pageCount}
      totalPagesKnown
      canPrev={page > 1}
      canNext={page < pageCount}
      onPrev={() => setListParam('page', page - 1)}
      onNext={() => setListParam('page', page + 1)}
      onGoToPage={(target) => setListParam('page', target)}
      limit={limit}
      allowedLimits={MAIL_TEMPLATE_PAGE_LIMITS}
      onLimitChange={(nextLimit) => setListParam('limit', nextLimit)}
      testId={testId}
    />
  ) : null;

  return (
    <ListShell
      testId="admin.mailer.templates.page"
      banner={fetchLimitReached ? (
        <Alert variant="warn" testId="admin.mailer.templates.fetch_limit_notice">
          {t('mailer.templates.list.fetch_limit_notice', { limit: MAIL_TEMPLATE_FETCH_LIMIT })}
        </Alert>
      ) : null}
      header={
        <div className="space-y-3">
          <PageHeader
            title={t('mailer.templates.list.title')}
            description={t('mailer.templates.list.description')}
            meta={filtersActive ? <span className="text-xs text-faint">{t('list.meta.filters_active')}</span> : null}
            actions={
              <Button
                variant="primary"
                onClick={openCreate}
                disabled={indeterminateCreate !== null}
                disabledReason={indeterminateCreate ? t('mailer.templates.create.indeterminate.body') : undefined}
                testId="admin.mailer.templates.create"
              >
                {t('mailer.templates.create.action')}
              </Button>
            }
            testId="admin.mailer.templates.header"
          />
          <MailerTabs />
        </div>
      }
      filters={
        <>
          <FilterBar testId="admin.mailer.templates.filters">
            <div className="w-full sm:max-w-xl">
              <Input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder={t('mailer.templates.filters.search.placeholder')}
                ariaLabel={t('mailer.templates.filters.search.placeholder')}
                autoComplete="off"
                testId="admin.mailer.templates.search.input"
              />
              {filtersActive ? (
                <div className="mt-2 flex flex-wrap gap-1" data-testid="admin.mailer.templates.active_filters">
                  {q.trim() ? <FilterChip label={`q:${q.trim()}`} onRemove={() => setQ('')} testId="admin.mailer.templates.chip.q" /> : null}
                  {templateId.trim() ? <FilterChip label={`template:${templateId.trim()}`} onRemove={() => setListParam('template_id', '')} testId="admin.mailer.templates.chip.template" /> : null}
                  {userVisibility.trim() ? <FilterChip label={`visibility:${userVisibility.trim()}`} onRemove={() => setListParam('user_visibility', '')} testId="admin.mailer.templates.chip.visibility" /> : null}
                </div>
              ) : null}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAdvancedOpen(true)}
              aria-label={t('filters.advanced.open')}
              title={t('filters.advanced.open')}
              testId="admin.mailer.templates.advanced.open"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              <span className="ml-2 hidden sm:inline">{t('filters.advanced.label')}</span>
            </Button>
            <CopyButton
              size="sm"
              variant="secondary"
              label={t('common.copy_link')}
              text={typeof window !== 'undefined' ? window.location.href : ''}
              testId="admin.mailer.templates.copy_link"
            />
            {filtersActive ? (
              <Button variant="secondary" size="sm" onClick={clearFilters} testId="admin.mailer.templates.filter.clear">
                {t('common.clear_filters')}
              </Button>
            ) : null}
          </FilterBar>

          <Drawer
            open={advancedOpen}
            onClose={() => setAdvancedOpen(false)}
            title={t('filters.advanced.title')}
            width="lg"
            testId="admin.mailer.templates.advanced"
            footer={
              <div className="flex items-center justify-end gap-2">
                {filtersActive ? <Button variant="secondary" size="sm" onClick={clearFilters}>{t('common.clear_filters')}</Button> : null}
                <Button variant="primary" size="sm" onClick={() => setAdvancedOpen(false)}>{t('common.close')}</Button>
              </div>
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label={t('mailer.templates.columns.template_id')}
                value={templateId}
                onChange={(event) => setListParam('template_id', event.target.value)}
                placeholder={t('mailer.templates.filters.template_id.placeholder')}
                autoComplete="off"
                testId="admin.mailer.templates.template_id.input"
              />
              <Select
                label={t('mailer.templates.columns.visibility')}
                value={userVisibility}
                onChange={(event) => setListParam('user_visibility', event.target.value)}
                options={visibilityOptions}
                testId="admin.mailer.templates.visibility.select"
              />
            </div>
          </Drawer>
        </>
      }
    >
      {indeterminateCreate ? (
        <div className="mb-4">
          <MailTemplateCreateIndeterminateGuard
            attempt={indeterminateCreate}
            onListRefresh={() => listQ.refetch()}
            onResolved={() => {
              clearMailTemplateCreateGuard(guardScope);
              setIndeterminateCreate(null);
            }}
          />
        </div>
      ) : null}

      {listQ.isLoading ? (
        <LoadingState testId="admin.mailer.templates.loading" />
      ) : listQ.isError ? (
        <ErrorState
          testId="admin.mailer.templates.error"
          title={t('mailer.templates.list.load_error')}
          error={listQ.error}
          onRetry={() => void listQ.refetch()}
          detailsExtra={{ page: 'admin.mailer.templates.list' }}
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          testId="admin.mailer.templates.empty"
          title={filtersActive ? t('empty.list.no_matches.title') : t('empty.list.empty.title')}
          body={filtersActive ? t('empty.list.no_matches.body') : t('empty.list.empty.body')}
        />
      ) : (
        <MailTemplateList
          basePath={basePath}
          rows={rows}
          mobilePagination={renderPagination('admin.mailer.templates.pagination.mobile')}
          desktopPagination={renderPagination('admin.mailer.templates.pagination.desktop')}
        />
      )}

      <MailTemplateEditorModal
        open={editorOpen}
        mode="create"
        template={null}
        error={editorError}
        saving={createM.isPending}
        onClose={closeEditor}
        onSubmit={(values) => createM.mutate(values)}
      />
    </ListShell>
  );
}

function MailTemplateList(props: {
  basePath: string;
  rows: MailTemplate[];
  mobilePagination: React.ReactNode;
  desktopPagination: React.ReactNode;
}) {
  const { t } = useI18n();

  return (
    <>
      <div className="grid gap-3 md:hidden">
        {props.rows.map((template) => {
          const label = String(template.label ?? template.name ?? '').trim() || `#${template.id}`;
          const name = String(template.name ?? '').trim();
          const templateId = String(template.template_id ?? '').trim();
          const visibility = String(template.user_visibility ?? '').trim();

          return (
            <Card key={template.id} className="p-4" testId={`admin.mailer.templates.card.${template.id}`}>
              <Link className="text-sm font-semibold text-accent hover:underline" to={`${props.basePath}/mailer/templates/${template.id}`}>
                {label}
              </Link>
              {name && name !== label ? <div className="mt-1 text-xs text-muted">{name}</div> : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {templateId ? <span className="font-mono text-xs">{templateId}</span> : null}
                <Badge variant={visibilityBadgeVariant(visibility)}>{t(visibilityLabelKey(visibility))}</Badge>
              </div>
              <div className="mt-3 text-xs text-faint">{formatDateTime(template.updated_at)}</div>
            </Card>
          );
        })}
        {props.mobilePagination ? <Card>{props.mobilePagination}</Card> : null}
      </div>

      <TableCard
        className="hidden md:block"
        minWidth="md"
        tableTestId="admin.mailer.templates.table"
        footer={props.desktopPagination}
      >
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="px-4 py-2">{t('mailer.templates.columns.template')}</th>
            <th className="px-4 py-2">{t('mailer.templates.columns.template_id')}</th>
            <th className="px-4 py-2">{t('mailer.templates.columns.visibility')}</th>
            <th className="px-4 py-2">{t('common.updated')}</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((template) => {
            const name = String(template.name ?? '').trim();
            const label = String(template.label ?? '').trim();
            const templateId = String(template.template_id ?? '').trim();
            const visibility = String(template.user_visibility ?? '').trim();

            return (
              <TableRowLink key={template.id} to={`${props.basePath}/mailer/templates/${template.id}`} testId={`admin.mailer.templates.row.${template.id}`}>
                <td className="px-4 py-2 align-top text-sm">
                  <div className="font-medium">{label || name || `#${template.id}`}</div>
                  {label && name ? <div className="mt-0.5 text-xs text-muted">{name}</div> : null}
                </td>
                <td className="px-4 py-2 align-top text-sm font-mono">
                  {templateId || <span className="text-muted">{t('common.na')}</span>}
                </td>
                <td className="px-4 py-2 align-top text-sm">
                  <Badge variant={visibilityBadgeVariant(visibility)}>{t(visibilityLabelKey(visibility))}</Badge>
                </td>
                <td className="px-4 py-2 align-top text-sm">{formatDateTime(template.updated_at)}</td>
              </TableRowLink>
            );
          })}
        </tbody>
      </TableCard>
    </>
  );
}
