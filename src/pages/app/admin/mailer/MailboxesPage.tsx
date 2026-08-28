import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CircleHelp, SlidersHorizontal } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppMode } from '../../../../app/appMode';
import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';
import { createMailbox, type Mailbox } from '../../../../lib/api/mailer';
import { formatDateTime } from '../../../../lib/format';
import { useKeysetPagination } from '../../../../lib/hooks/useKeysetPagination';
import { ListShell } from '../../../../components/layout/ListShell';
import { PageHeader } from '../../../../components/layout/PageHeader';
import { FilterBar } from '../../../../components/layout/FilterBar';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Checkbox } from '../../../../components/ui/Checkbox';
import { CopyButton } from '../../../../components/ui/CopyButton';
import { Drawer } from '../../../../components/ui/Drawer';
import { FilterChip } from '../../../../components/ui/FilterChip';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { Input } from '../../../../components/ui/Input';
import { LoadingState } from '../../../../components/ui/LoadingState';
import { Modal } from '../../../../components/ui/Modal';
import { SmartFilterInput, type SmartFilterSuggestion } from '../../../../components/ui/SmartFilterInput';
import { SmartInputHelp } from '../../../../components/ui/SmartInputHelp';
import { Select } from '../../../../components/ui/Select';
import { TableCard } from '../../../../components/ui/TableCard';
import { TableRowLink } from '../../../../components/ui/TableRowLink';
import { MailerTabs } from './MailerTabs';
import { MailboxListPagination } from './MailboxListPagination';
import { useMailboxPageNavigation } from './useMailboxPageNavigation';
import { parseNumericToken, splitKeyValueToken, tokenizeSmartInput, unquoteSmartValue } from '../../../../lib/smartFilter';

function parsePositiveInt(v: string): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function MailboxesPage() {
  const { basePath } = useAppMode();
  const { t } = useI18n();
  const qc = useQueryClient();
  const { pushToast } = useToasts();
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const smartInputRef = useRef<HTMLInputElement | null>(null);
  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const [serverFilter, setServerFilter] = useState(() => searchParams.get('server') ?? '');
  const [userFilter, setUserFilter] = useState(() => searchParams.get('user') ?? '');
  const [sslFilter, setSslFilter] = useState(() => searchParams.get('enable_ssl') ?? '');
  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    const urlQ = searchParams.get('q') ?? '';
    const urlServer = searchParams.get('server') ?? '';
    const urlUser = searchParams.get('user') ?? '';
    const urlSsl = searchParams.get('enable_ssl') ?? '';
    if (urlQ !== q) setQ(urlQ);
    if (urlServer !== serverFilter) setServerFilter(urlServer);
    if (urlUser !== userFilter) setUserFilter(urlUser);
    if (urlSsl !== sslFilter) setSslFilter(urlSsl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const qTrim = useMemo(() => q.trim(), [q]);
  const serverTrim = useMemo(() => serverFilter.trim(), [serverFilter]);
  const userTrim = useMemo(() => userFilter.trim(), [userFilter]);
  const sslValue = useMemo(() => {
    const s = sslFilter.trim().toLowerCase();
    if (!s) return undefined;
    if (['1', 'true', 'yes', 'on'].includes(s)) return true;
    if (['0', 'false', 'no', 'off'].includes(s)) return false;
    return undefined;
  }, [sslFilter]);
  const smartNeedle = useMemo(() => smart.trim(), [smart]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (qTrim) next.set('q', qTrim); else next.delete('q');
    if (serverTrim) next.set('server', serverTrim); else next.delete('server');
    if (userTrim) next.set('user', userTrim); else next.delete('user');
    if (sslValue === true) next.set('enable_ssl', 'true');
    else if (sslValue === false) next.set('enable_ssl', 'false');
    else next.delete('enable_ssl');
    if (next.toString() != searchParams.toString()) setSearchParams(next, { replace: true });
  }, [qTrim, searchParams, setSearchParams, serverTrim, sslValue, userTrim]);

  const pagination = useKeysetPagination({
    id: 'admin.mailer.mailboxes.list',
    filterKey: JSON.stringify({ q: qTrim, server: serverTrim, user: userTrim, ssl: sslValue }),
    searchParams,
    setSearchParams,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100],
  });

  const mailboxPage = useMailboxPageNavigation({
    pagination,
    filters: useMemo(() => ({ q: qTrim, server: serverTrim, user: userTrim, enableSsl: sslValue }), [qTrim, serverTrim, sslValue, userTrim]),
  });
  const {
    canPaginate,
    rows,
    listQ,
  } = mailboxPage;

  const filtersActive = Boolean(qTrim || serverTrim || userTrim || sslValue !== undefined || smartErrors.length);

  function clearFilters() {
    setQ('');
    setServerFilter('');
    setUserFilter('');
    setSslFilter('');
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
    let nextServer = serverTrim;
    let nextUser = userTrim;
    let nextSsl = sslFilter;

    if (tokens.length === 1) {
      const firstToken = tokens[0];
      const id = firstToken ? parseNumericToken(firstToken) : null;
      if (id !== null) {
        navigate(`${basePath}/mailer/mailboxes/${id}`);
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
        nextErrors.push(t('mailer.mailboxes.smart.error.empty_value', { key }));
        continue;
      }
      if (['q', 'search'].includes(key)) nextQ = value;
      else if (key === 'server') nextServer = value;
      else if (key === 'user') nextUser = value;
      else if (['ssl', 'enable_ssl'].includes(key)) {
        const s = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(s)) nextSsl = 'true';
        else if (['0', 'false', 'no', 'off'].includes(s)) nextSsl = 'false';
        else nextErrors.push(t('mailer.mailboxes.smart.error.invalid_ssl', { value }));
      } else if (key === 'id') {
        const id = parseNumericToken(value);
        if (id === null) nextErrors.push(t('mailer.mailboxes.smart.error.id_numeric_only', { value }));
        else {
          navigate(`${basePath}/mailer/mailboxes/${id}`);
          setSmart('');
          setSmartErrors([]);
          return;
        }
      } else {
        nextErrors.push(t('mailer.mailboxes.smart.error.unknown_key', { key }));
      }
    }

    const free = freeText.join(' ').trim();
    if (free) nextQ = free;

    setQ(nextQ);
    setServerFilter(nextServer);
    setUserFilter(nextUser);
    setSslFilter(nextSsl);
    setSmart('');
    setSmartErrors(nextErrors);
  }

  const smartSuggestions: SmartFilterSuggestion[] = useMemo(() => {
    const s: SmartFilterSuggestion[] = [];
    if (!smartNeedle) return s;
    if (smartNeedle === '?') {
      s.push({ id: 'help', primary: t('filters.help.open'), secondary: t('mailer.mailboxes.smart.help.hint'), onPick: () => setHelpOpen(true), testId: 'admin.mailer.mailboxes.smart_filter.suggest.help' });
      return s;
    }
    const numeric = parseNumericToken(smartNeedle);
    if (numeric !== null) {
      s.push({ id: 'open', primary: t('mailer.mailboxes.smart.suggest.open', { id: String(numeric) }), secondary: t('mailer.mailboxes.smart.suggest.open.secondary'), onPick: () => navigate(`${basePath}/mailer/mailboxes/${numeric}`), testId: 'admin.mailer.mailboxes.smart_filter.suggest.open' });
      s.push({ id: 'search-id', primary: t('mailer.mailboxes.smart.suggest.search', { value: String(numeric) }), secondary: t('mailer.mailboxes.smart.suggest.search.secondary'), onPick: () => applySmartText(String(numeric)), testId: 'admin.mailer.mailboxes.smart_filter.suggest.search' });
      return s;
    }
    const kv = splitKeyValueToken(smartNeedle);
    if (kv) {
      s.push({ id: 'apply', primary: t('mailer.mailboxes.smart.suggest.apply', { value: smartNeedle }), secondary: t('mailer.mailboxes.smart.suggest.apply.secondary'), onPick: () => applySmartText(smartNeedle), testId: 'admin.mailer.mailboxes.smart_filter.suggest.apply' });
      return s;
    }
    s.push({ id: 'search', primary: t('mailer.mailboxes.smart.suggest.search', { value: smartNeedle }), secondary: t('mailer.mailboxes.smart.suggest.search.secondary'), onPick: () => applySmartText(smartNeedle), testId: 'admin.mailer.mailboxes.smart_filter.suggest.search' });
    return s;
  }, [basePath, navigate, smartNeedle, t]);

  const activeFilterChips = useMemo(() => {
    const chips: React.ReactNode[] = [];
    if (qTrim) chips.push(<FilterChip key='q' label={`q:${qTrim}`} onRemove={() => setQ('')} testId='admin.mailer.mailboxes.chip.q' />);
    if (serverTrim) chips.push(<FilterChip key='server' label={`server:${serverTrim}`} onRemove={() => setServerFilter('')} testId='admin.mailer.mailboxes.chip.server' />);
    if (userTrim) chips.push(<FilterChip key='user' label={`user:${userTrim}`} onRemove={() => setUserFilter('')} testId='admin.mailer.mailboxes.chip.user' />);
    if (sslValue !== undefined) chips.push(<FilterChip key='ssl' label={`ssl:${sslValue ? 'on' : 'off'}`} onRemove={() => setSslFilter('')} testId='admin.mailer.mailboxes.chip.ssl' />);
    smartErrors.forEach((e, idx) => chips.push(<FilterChip key={`err.${idx}`} label={e} tone='danger' onRemove={() => setSmartErrors([])} testId={`admin.mailer.mailboxes.chip.error.${idx}`} />));
    return chips;
  }, [qTrim, serverTrim, smartErrors, sslValue, userTrim]);

  // --- Create modal ---
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    label: '',
    server: '',
    port: '993',
    user: '',
    password: '',
    enable_ssl: true,
  });

  const canSave = useMemo(() => {
    const label = form.label.trim();
    const server = form.server.trim();
    const user = form.user.trim();
    const password = form.password.trim();
    const port = parsePositiveInt(form.port.trim());
    return Boolean(label && server && user && password && port);
  }, [form]);

  const createM = useMutation({
    mutationFn: async () => {
      const label = form.label.trim();
      const server = form.server.trim();
      const user = form.user.trim();
      const password = form.password;
      const port = parsePositiveInt(form.port.trim());
      if (!label || !server || !user || !password.trim() || !port) throw new Error('invalid form');

      return (
        await createMailbox({
          label,
          server,
          port,
          user,
          password,
          enable_ssl: form.enable_ssl,
        })
      ).data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['mailer', 'mailboxes', 'index'] });
      setCreateOpen(false);
      pushToast({ variant: 'ok', title: t('mailer.mailboxes.create_success') });
    },
    onError: (err: any) => {
      pushToast({
        variant: 'danger',
        title: t('mailer.mailboxes.create_error'),
        body: String(err?.message ?? err ?? ''),
      });
    },
  });

  const resetCreate = () => {
    setForm({ label: '', server: '', port: '993', user: '', password: '', enable_ssl: true });
  };

  const openCreate = () => {
    resetCreate();
    setCreateOpen(true);
  };

  return (
    <ListShell
      testId="admin.mailer.mailboxes.page"
      header={
        <div className="space-y-3">
          <PageHeader
            title={t('mailer.tabs.mailboxes')}
            description={t('mailer.mailboxes.list.description')}
            meta={filtersActive ? <span className="text-xs text-faint">{t('list.meta.filters_progressive')}</span> : null}
            actions={
              <Button variant="primary" onClick={openCreate} testId="admin.mailer.mailboxes.create">
                {t('mailer.mailboxes.create')}
              </Button>
            }
          />
          <MailerTabs />
        </div>
      }
      filters={
        <>
          <FilterBar testId="admin.mailer.mailboxes.filters">
            <div className="w-full sm:max-w-xl">
              <SmartFilterInput
                ref={smartInputRef}
                value={smart}
                onChange={(v) => {
                  setSmart(v);
                  if (smartErrors.length) setSmartErrors([]);
                }}
                placeholder={t('mailer.mailboxes.filters.search.placeholder')}
                ariaLabel={t('mailer.mailboxes.filters.search.placeholder')}
                testId="admin.mailer.mailboxes.search.input"
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
                    testId="admin.mailer.mailboxes.smart_filter.help_btn"
                  >
                    <CircleHelp className="h-4 w-4" aria-hidden />
                  </Button>
                }
              />
              {activeFilterChips.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1" data-testid="admin.mailer.mailboxes.active_filters">
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
              testId="admin.mailer.mailboxes.advanced.open"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              <span className="ml-2 hidden sm:inline">{t('filters.advanced.label')}</span>
            </Button>
            <CopyButton size="sm" variant="secondary" label={t('common.copy_link')} text={typeof window !== 'undefined' ? window.location.href : ''} testId="admin.mailer.mailboxes.copy_link" />
            {filtersActive ? (
              <Button variant="secondary" size="sm" onClick={clearFilters} testId="admin.mailer.mailboxes.filter.clear">
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
            intro={t('mailer.mailboxes.smart.help.intro')}
            examples={[
              { example: '?', description: t('mailer.mailboxes.smart.help.examples.help') },
              { example: '123', description: t('mailer.mailboxes.smart.help.examples.id') },
              { example: 'imap', description: t('mailer.mailboxes.smart.help.examples.search') },
              { example: 'server:imap.example.test', description: t('mailer.mailboxes.smart.help.examples.server') },
              { example: 'ssl:on', description: t('mailer.mailboxes.smart.help.examples.ssl') },
            ]}
            topKeys={[
              { key: 'q', description: t('mailer.mailboxes.smart.help.keys.q'), example: 'q:imap' },
              { key: 'server', description: t('mailer.mailboxes.smart.help.keys.server'), example: 'server:imap.example.test' },
              { key: 'user', description: t('mailer.mailboxes.smart.help.keys.user'), example: 'user:support@example.test' },
              { key: 'ssl', description: t('mailer.mailboxes.smart.help.keys.ssl'), example: 'ssl:on' },
              { key: 'id', description: t('mailer.mailboxes.smart.help.keys.id'), example: 'id:20' },
            ]}
            inference={[
              t('mailer.mailboxes.smart.help.inference.free_text'),
              t('mailer.mailboxes.smart.help.inference.numeric'),
              t('mailer.mailboxes.smart.help.inference.advanced'),
            ]}
            onInsertKey={(key) => {
              setSmart(`${key}:`);
              setHelpOpen(false);
              window.setTimeout(() => smartInputRef.current?.focus(), 50);
            }}
            actions={[{ label: t('filters.advanced.open'), onClick: () => { setHelpOpen(false); setAdvancedOpen(true); }, variant: 'secondary' }]}
            testId="admin.mailer.mailboxes.smart_help"
            keyRowTestIdPrefix="admin.mailer.mailboxes.smart_help.key"
          />

          <Drawer
            open={advancedOpen}
            onClose={() => setAdvancedOpen(false)}
            title={t('filters.advanced.title')}
            width="lg"
            testId="admin.mailer.mailboxes.advanced"
            footer={<div className='flex items-center justify-end gap-2'>{filtersActive ? <Button variant='secondary' size='sm' onClick={clearFilters}>{t('common.clear_filters')}</Button> : null}<Button variant='primary' size='sm' onClick={() => setAdvancedOpen(false)}>{t('common.close')}</Button></div>}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm font-medium">{t('common.search')}</div>
                <div className="mt-1"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('mailer.mailboxes.filters.search.placeholder')} autoComplete="off" testId="admin.mailer.mailboxes.advanced.q" /></div>
              </div>
              <div>
                <div className="text-sm font-medium">{t('mailer.mailboxes.fields.server')}</div>
                <div className="mt-1"><Input value={serverFilter} onChange={(e) => setServerFilter(e.target.value)} placeholder={t('mailer.mailboxes.fields.server')} autoComplete="off" testId="admin.mailer.mailboxes.advanced.server" /></div>
              </div>
              <div>
                <div className="text-sm font-medium">{t('mailer.mailboxes.fields.user')}</div>
                <div className="mt-1"><Input value={userFilter} onChange={(e) => setUserFilter(e.target.value)} placeholder={t('mailer.mailboxes.fields.user')} autoComplete="off" testId="admin.mailer.mailboxes.advanced.user" /></div>
              </div>
              <div>
                <div className="text-sm font-medium">{t('mailer.mailboxes.fields.enable_ssl')}</div>
                <div className="mt-1">
                  <Select
                    testId="admin.mailer.mailboxes.advanced.enable_ssl"
                    value={sslFilter}
                    onChange={(e) => setSslFilter(e.target.value)}
                    options={[
                      { value: '', label: t('common.all') },
                      { value: 'true', label: t('mailer.mailboxes.ssl.on') },
                      { value: 'false', label: t('mailer.mailboxes.ssl.off') },
                    ]}
                  />
                </div>
              </div>
            </div>
          </Drawer>
        </>
      }
    >
      {listQ.isLoading ? (
        <LoadingState testId="admin.mailer.mailboxes.loading" />
      ) : listQ.isError ? (
        <ErrorState
          testId="admin.mailer.mailboxes.error"
          title={t('mailer.mailboxes.list.load_error')}
          error={listQ.error}
          onRetry={() => void listQ.refetch()}
          detailsExtra={{ page: 'admin.mailer.mailboxes.list' }}
        />
      ) : rows.length === 0 ? (
        <div className="space-y-2">
          <EmptyState
            testId="admin.mailer.mailboxes.empty"
            title={filtersActive ? t('empty.list.no_matches.title') : t('empty.list.empty.title')}
            body={filtersActive ? t('empty.list.no_matches.body') : t('empty.list.empty.body')}
          />
          {canPaginate ? (
            <MailboxListPagination {...mailboxPage} pagination={pagination} />
          ) : null}
        </div>
      ) : (
        <>
          <TableCard
            testId="admin.mailer.mailboxes.table"
            minWidth="md"
            footer={
              canPaginate ? (
                <MailboxListPagination {...mailboxPage} pagination={pagination} variant="inCard" />
              ) : null
            }
          >
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('mailer.mailboxes.fields.label')}</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('mailer.mailboxes.fields.server')}</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('mailer.mailboxes.fields.user')}</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('mailer.mailboxes.fields.enable_ssl')}</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-muted">{t('mailer.mailboxes.fields.handlers')}</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-muted">{t('mailer.mailboxes.fields.updated_at')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((mb) => {
                const id = Number((mb as any).id);
                const label = String((mb as any).label ?? `#${id}`);
                const server = String((mb as any).server ?? '');
                const port = Number((mb as any).port ?? 0);
                const user = String((mb as any).user ?? '');
                const ssl = Boolean((mb as any).enable_ssl);
                const handlers = Number((mb as any).handlers_count ?? 0);
                const updatedAt = (mb as any).updated_at;

                return (
                  <TableRowLink
                    key={id}
                    to={`${basePath}/mailer/mailboxes/${id}`}
                    testId={`admin.mailer.mailboxes.row.${id}`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{label}</span>
                        <span className="text-xs text-faint">#{id}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-muted">
                        {server}
                        {port ? `:${port}` : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {user ? <span className="font-mono text-xs text-muted">{user}</span> : <span className="text-faint">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={ssl ? 'ok' : 'warn'}>{ssl ? t('mailer.mailboxes.ssl.on') : t('mailer.mailboxes.ssl.off')}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="font-medium">{handlers}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {updatedAt ? (
                        <span className="text-xs text-muted">{formatDateTime(String(updatedAt))}</span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </TableRowLink>
                );
              })}
            </tbody>
          </TableCard>

          <div className="mt-3 text-xs text-muted">
            <Link to={`${basePath}/mailer/log`} className="hover:underline">
              {t('mailer.mailboxes.hint.log_link')}
            </Link>
          </div>
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('mailer.mailboxes.create.title')}
        testId="admin.mailer.mailboxes.create.modal"
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={createM.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => createM.mutate()}
              loading={createM.isPending}
              disabled={!canSave}
              testId="admin.mailer.mailboxes.create.modal.save"
            >
              {t('common.create')}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <div>
            <div className="text-xs font-semibold text-muted">{t('mailer.mailboxes.fields.label')}</div>
            <div className="mt-1">
              <Input
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                placeholder={t('mailer.mailboxes.placeholders.label')}
                autoComplete="off"
                testId="admin.mailer.mailboxes.create.label"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <div className="text-xs font-semibold text-muted">{t('mailer.mailboxes.fields.server')}</div>
              <div className="mt-1">
                <Input
                  value={form.server}
                  onChange={(e) => setForm((p) => ({ ...p, server: e.target.value }))}
                  placeholder={t('mailer.mailboxes.placeholders.server')}
                  autoComplete="off"
                  testId="admin.mailer.mailboxes.create.server"
                />
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted">{t('mailer.mailboxes.fields.port')}</div>
              <div className="mt-1">
                <Input
                  value={form.port}
                  onChange={(e) => setForm((p) => ({ ...p, port: e.target.value }))}
                  placeholder="993"
                  autoComplete="off"
                  testId="admin.mailer.mailboxes.create.port"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-muted">{t('mailer.mailboxes.fields.user')}</div>
              <div className="mt-1">
                <Input
                  value={form.user}
                  onChange={(e) => setForm((p) => ({ ...p, user: e.target.value }))}
                  placeholder={t('mailer.mailboxes.placeholders.user')}
                  autoComplete="off"
                  testId="admin.mailer.mailboxes.create.user"
                />
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted">{t('mailer.mailboxes.fields.password')}</div>
              <div className="mt-1">
                <Input
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder={t('mailer.mailboxes.placeholders.password')}
                  autoComplete="new-password"
                  type="password"
                  testId="admin.mailer.mailboxes.create.password"
                />
                <div className="mt-1 text-xs text-faint">{t('mailer.mailboxes.password.hidden')}</div>
              </div>
            </div>
          </div>

          <Checkbox
            checked={form.enable_ssl}
            onChange={(checked) => setForm((p) => ({ ...p, enable_ssl: checked }))}
            label={t('mailer.mailboxes.enable_ssl.label')}
            description={t('mailer.mailboxes.enable_ssl.description')}
            testId="admin.mailer.mailboxes.create.enable_ssl"
          />
        </div>
      </Modal>
    </ListShell>
  );
}
