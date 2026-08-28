import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { useToasts } from '../../../app/toasts';

import { createUser } from '../../../lib/api/users';
import { parseBoolParam, parseNonNegativeInt } from '../../../lib/parse';
import { parseNumericToken, splitKeyValueToken, tokenizeSmartInput, unquoteSmartValue } from '../../../lib/smartFilter';

import { ListShell } from '../../../components/layout/ListShell';
import { PageHeader } from '../../../components/layout/PageHeader';

import { type SmartFilterSuggestion } from '../../../components/ui/SmartFilterInput';

import { UsersCreateModal } from './users/UsersCreateModal';
import { UsersFilters } from './users/UsersFilters';
import { UsersListContent } from './users/UsersListContent';
import {
  buildCreateUserPayload,
  canonicalUserSmartKey,
  initialCreateUserDraft,
  normalizeRole,
  parseBoolToken,
  resolveRoleValue,
  type CreateUserDraft,
} from './users/UsersModel';
import { useUsersListPaging } from './users/useUsersListPaging';

const validationErrorMessage = 'validation';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function UsersPage() {
  const { basePath } = useAppMode();
  const { t } = useI18n();
  const toasts = useToasts();
  const navigate = useNavigate();

  const [sp, setSp] = useSearchParams();

  const qText = useMemo(() => String(sp.get('q') ?? ''), [sp]);
  const role = useMemo(() => normalizeRole(sp.get('role')), [sp]);
  const level = useMemo(() => parseNonNegativeInt(sp.get('level')), [sp]);

  const mailerEnabled = useMemo(() => parseBoolParam(sp.get('mailer')), [sp]);
  const lockout = useMemo(() => parseBoolParam(sp.get('lockout')), [sp]);
  const passwordReset = useMemo(() => parseBoolParam(sp.get('password_reset')), [sp]);
  const mfa = useMemo(() => parseBoolParam(sp.get('mfa')), [sp]);

  const setTextParam = useCallback(
    (key: string, value: string | undefined) => {
      const v = String(value ?? '').trim();
      setSp((prev) => {
        const p = new URLSearchParams(prev);
        if (v) p.set(key, v);
        else p.delete(key);
        return p;
      });
    },
    [setSp]
  );

  const setBoolParamInUrl = useCallback(
    (key: string, value: boolean | undefined) => {
      setSp((prev) => {
        const p = new URLSearchParams(prev);
        if (value === true) p.set(key, '1');
        else if (value === false) p.set(key, '0');
        else p.delete(key);
        return p;
      });
    },
    [setSp]
  );

  const filtersActive = Boolean(
    qText.trim() || role || level !== undefined || mailerEnabled !== undefined || lockout !== undefined || passwordReset !== undefined || mfa !== undefined
  );

  const {
    pagination,
    listQ,
    users: pageData,
    pageCursor,
    pageCount,
    totalPagesKnown,
    canNext,
    goToPage,
    maxDirectPage,
    isJumping,
    canPaginate,
    compatScanActive,
  } = useUsersListPaging({
    basePath,
    filters: {
      q: qText.trim() || undefined,
      role: role || undefined,
      level,
      mailerEnabled,
      lockout,
      passwordReset,
      enableMfa: mfa,
    },
    searchParams: sp,
    setSearchParams: setSp,
  });
  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const smartNeedle = smart.trim();
  const smartInputRef = useRef<HTMLInputElement>(null);

  const [helpOpen, setHelpOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateUserDraft>(initialCreateUserDraft);
  const [createError, setCreateError] = useState<string | null>(null);

  const clearFilters = useCallback(() => {
    setSmart('');
    setSmartErrors([]);

    setSp((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('q');
      p.delete('role');
      p.delete('level');
      p.delete('mailer');
      p.delete('lockout');
      p.delete('password_reset');
      p.delete('mfa');
      return p;
    });
  }, [setSp]);

  const setCreateField = <K extends keyof CreateUserDraft>(key: K, value: CreateUserDraft[K]) => {
    setCreateDraft((prev) => ({ ...prev, [key]: value }));
    if (createError) setCreateError(null);
  };

  const buildCreatePayload = () => {
    const review = buildCreateUserPayload(createDraft);
    if (!review.ok) {
      setCreateError(t(review.errorKey));
      return null;
    }

    return review.payload;
  };

  const createM = useMutation({
    mutationFn: async () => {
      const payload = buildCreatePayload();
      if (!payload) throw new Error(validationErrorMessage);
      return createUser(payload);
    },
    onSuccess: (res) => {
      const id = Number(res.data?.id);
      setCreateOpen(false);
      setCreateDraft(initialCreateUserDraft);
      setCreateError(null);
      void listQ.refetch();
      toasts.pushToast({ variant: 'ok', title: t('admin.users.create.toast.created') });
      if (Number.isFinite(id) && id > 0) navigate(`${basePath}/users/${id}`);
    },
    onError: (err) => {
      if (errorMessage(err) === validationErrorMessage) return;
      setCreateError(errorMessage(err));
    },
  });

  useEffect(() => {
    if (smartNeedle === '?') setHelpOpen(true);
  }, [smartNeedle]);

  const openUser = useCallback(
    (userId: number) => {
      navigate(`${basePath}/users/${userId}`);
    },
    [basePath, navigate]
  );

  const applySmartText = (raw: string) => {
    const input = String(raw ?? '').trim();
    if (!input) return;

    if (input === '?') {
      setHelpOpen(true);
      return;
    }

    const tokens = tokenizeSmartInput(input);

    if (tokens.length === 1) {
      const num = parseNumericToken(tokens[0] ?? '');
      if (num) {
        openUser(num);
        setSmart('');
        setSmartErrors([]);
        return;
      }
    }

    const plain: string[] = [];
    const errors: string[] = [];

    tokens.forEach((tok) => {
      const kv = splitKeyValueToken(tok);
      if (!kv) {
        plain.push(unquoteSmartValue(tok));
        return;
      }

      const key = canonicalUserSmartKey(kv.rawKey);
      const valueRaw = unquoteSmartValue(kv.rawValue);

      if (!key) {
        errors.push(t('filters.smart.error.unknown_key', { key: kv.rawKey }));
        return;
      }

      if (!valueRaw.trim()) {
        errors.push(t('filters.smart.error.missing_value', { key: kv.rawKey.trim() }));
        return;
      }

      if (key === 'id') {
        const id = parseNumericToken(valueRaw);
        if (!id) {
          errors.push(t('admin.users.smart.error.id', { value: valueRaw }));
          return;
        }
        openUser(id);
        return;
      }

      if (key === 'q') {
        setTextParam('q', valueRaw);
        return;
      }

      if (key === 'role') {
        const r = resolveRoleValue(valueRaw);
        if (r === null) {
          errors.push(t('admin.users.smart.error.role', { value: valueRaw }));
          return;
        }
        setTextParam('role', r || undefined);
        return;
      }

      if (key === 'level') {
        const lv = parseNonNegativeInt(valueRaw);
        if (lv === undefined) {
          errors.push(t('admin.users.smart.error.level', { value: valueRaw }));
          return;
        }
        setTextParam('level', String(lv));
        return;
      }

      if (key === 'mailer') {
        const b = parseBoolToken(valueRaw);
        if (b === null) {
          errors.push(t('admin.users.smart.error.bool', { key: 'mailer', value: valueRaw }));
          return;
        }
        setBoolParamInUrl('mailer', b);
        return;
      }

      if (key === 'lockout') {
        const b = parseBoolToken(valueRaw);
        if (b === null) {
          errors.push(t('admin.users.smart.error.bool', { key: 'lockout', value: valueRaw }));
          return;
        }
        setBoolParamInUrl('lockout', b);
        return;
      }

      if (key === 'password_reset') {
        const b = parseBoolToken(valueRaw);
        if (b === null) {
          errors.push(t('admin.users.smart.error.bool', { key: 'password_reset', value: valueRaw }));
          return;
        }
        setBoolParamInUrl('password_reset', b);
        return;
      }

      if (key === 'mfa') {
        const b = parseBoolToken(valueRaw);
        if (b === null) {
          errors.push(t('admin.users.smart.error.bool', { key: 'mfa', value: valueRaw }));
          return;
        }
        setBoolParamInUrl('mfa', b);
      }
    });

    const q = plain.join(' ').trim();
    if (q) setTextParam('q', q);

    setSmart('');
    setSmartErrors(errors);

    if (errors.length > 0) {
      toasts.pushToast({ variant: 'danger', title: errors[0] ?? t('common.unknown_error') });
    }
  };

  const smartSuggestions: SmartFilterSuggestion[] = useMemo(() => {
    const out: SmartFilterSuggestion[] = [];
    const needle = smartNeedle;
    if (!needle) return out;

    if (needle === '?') {
      out.push({
        id: 'help',
        primary: t('filters.help.open'),
        secondary: t('filters.help.suggestion.secondary'),
        onPick: () => setHelpOpen(true),
        testId: 'admin.users.smart.suggest.help',
      });
      return out;
    }

    const num = parseNumericToken(needle);
    if (num) {
      out.push({
        id: `open.${num}`,
        primary: t('admin.users.smart.suggest.open_user', { id: num }),
        secondary: t('admin.users.smart.suggest.open_user.secondary'),
        onPick: () => {
          openUser(num);
          setSmart('');
        },
        testId: 'admin.users.smart.suggest.open_user',
      });
    }

    const low = needle.toLowerCase();
    if (low === 'admins' || low === 'admin') {
      out.push({
        id: 'role.admin',
        primary: 'role:admin',
        secondary: t('admin.users.smart.suggest.role_admin'),
        onPick: () => {
          setTextParam('role', 'admin');
          setSmart('');
        },
      });
    }

    out.push({
      id: 'search',
      primary: t('admin.users.smart.suggest.search', { q: needle }),
      secondary: t('admin.users.smart.suggest.search.secondary'),
      onPick: () => {
        setTextParam('q', needle);
        setSmart('');
      },
      testId: 'admin.users.smart.suggest.search',
    });

    return out;
  }, [openUser, setTextParam, smartNeedle, t]);

  const shareUrl = useMemo(() => (typeof window !== 'undefined' ? window.location.href : ''), [sp]);
  const na = t('common.na');

  return (
    <ListShell
      testId="admin.users.page"
      header={
        <PageHeader
          title={t('admin.users.title')}
          description={t('admin.users.subtitle')}
          meta={<span className="text-xs text-faint">{t(compatScanActive ? 'list.meta.filters_progressive' : 'admin.users.filter_hint')}</span>}
          testId="admin.users.list.header"
        />
      }
      filters={
        <>
          <UsersFilters
            t={t}
            smart={smart}
            smartNeedle={smartNeedle}
            smartErrors={smartErrors}
            smartInputRef={smartInputRef}
            smartSuggestions={smartSuggestions}
            filtersActive={filtersActive}
            shareUrl={shareUrl}
            helpOpen={helpOpen}
            advancedOpen={advancedOpen}
            qText={qText}
            role={role}
            level={level}
            mailerEnabled={mailerEnabled}
            lockout={lockout}
            passwordReset={passwordReset}
            mfa={mfa}
            onSmartChange={setSmart}
            onSmartSubmit={() => applySmartText(smart)}
            onSetSmartErrors={setSmartErrors}
            onHelpOpenChange={setHelpOpen}
            onAdvancedOpenChange={setAdvancedOpen}
            onCreateOpen={() => setCreateOpen(true)}
            onClearFilters={clearFilters}
            onSetTextParam={setTextParam}
            onSetBoolParam={setBoolParamInUrl}
          />

          <UsersCreateModal
            open={createOpen}
            draft={createDraft}
            error={createError}
            pending={createM.isPending}
            t={t}
            onChange={setCreateField}
            onClose={() => {
              setCreateOpen(false);
              setCreateError(null);
            }}
            onCancel={() => {
              setCreateOpen(false);
              setCreateError(null);
            }}
            onSubmit={() => createM.mutate()}
          />
        </>
      }
    >
      <UsersListContent
        users={pageData}
        isLoading={listQ.isLoading}
        isError={listQ.isError}
        error={listQ.error}
        onRetry={() => void listQ.refetch()}
        filtersActive={filtersActive}
        onClearFilters={clearFilters}
        basePath={basePath}
        t={t}
        na={na}
        pagination={pagination}
        pageCount={pageCount}
        totalPagesKnown={totalPagesKnown}
        onGoToPage={goToPage}
        maxDirectPage={maxDirectPage}
        jumpPending={isJumping}
        canPaginate={canPaginate}
        canNext={canNext}
        pageCursor={pageCursor}
      />
    </ListShell>
  );
}
