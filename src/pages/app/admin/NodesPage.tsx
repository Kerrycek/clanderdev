import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useAppMode } from '../../../app/appMode';
import { useAuth } from '../../../app/auth';
import { useI18n } from '../../../app/i18n';
import { useToasts } from '../../../app/toasts';

import { ListShell } from '../../../components/layout/ListShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import type { SmartFilterSuggestion } from '../../../components/ui/SmartFilterInput';

import { fetchNodeCreateCapability, fetchNodes } from '../../../lib/api/nodes';
import { fetchPublicNodeStatus } from '../../../lib/api/public';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { parseBoolParam } from '../../../lib/parse';
import { useTierSlowIntervalMs } from '../../../lib/refreshTiers';
import { cursorFromDescendingPage } from '../../../lib/lockIndex';
import { parseNumericToken, splitKeyValueToken, tokenizeSmartInput, unquoteSmartValue } from '../../../lib/smartFilter';

import { NodesFilters } from './NodesFilters';
import { NodesListContent } from './NodesListContent';
import { NodeCreateModal } from './nodes/NodeCreateModal';
import { NodeCreateIndeterminateGuard, type IndeterminateNodeCreateAttempt } from './nodes/NodeCreateIndeterminateGuard';
import {
  buildNodeRows,
  buildStatusIndex,
  filterNodeRows,
  nodeStats,
  normalizeNodeState,
  parseIssuesValue,
  resolveNodeStateValue,
  type NodeStateFilter,
} from './NodesModel';

export function NodesPage() {
  const { basePath } = useAppMode();
  const auth = useAuth();
  const { t } = useI18n();
  const toasts = useToasts();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const qText = useMemo(() => String(searchParams.get('q') ?? ''), [searchParams]);
  const issuesOnly = useMemo(() => parseBoolParam(searchParams.get('issues')) === true, [searchParams]);
  const state = useMemo(() => normalizeNodeState(searchParams.get('state')), [searchParams]);

  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const smartNeedle = useMemo(() => smart.trim(), [smart]);
  const smartInputRef = useRef<HTMLInputElement>(null);

  const [helpOpen, setHelpOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [indeterminateCreate, setIndeterminateCreate] = useState<IndeterminateNodeCreateAttempt | null>(null);

  const createCapabilityQ = useQuery({
    queryKey: ['nodes', 'capability', 'create'],
    queryFn: async () => (await fetchNodeCreateCapability()).data,
    enabled: auth.role === 'admin',
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (smartNeedle === '?') setHelpOpen(true);
  }, [smartNeedle]);

  const setTextParam = useCallback(
    (key: string, value: string | undefined) => {
      const v = String(value ?? '').trim();
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        if (v) p.set(key, v);
        else p.delete(key);
        return p;
      });
    },
    [setSearchParams]
  );

  const setIssuesParam = useCallback(
    (on: boolean) => {
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        if (on) p.set('issues', '1');
        else p.delete('issues');
        return p;
      });
    },
    [setSearchParams]
  );

  const setStateParam = useCallback(
    (st: NodeStateFilter) => {
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        if (st === 'active') p.delete('state');
        else p.set('state', st);
        return p;
      });
    },
    [setSearchParams]
  );

  const filtersActive = Boolean(qText.trim() || issuesOnly || state !== 'active');

  const clearFilters = useCallback(() => {
    setSmart('');
    setSmartErrors([]);

    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('q');
      p.delete('issues');
      p.delete('state');
      return p;
    });
  }, [setSearchParams]);

  const pagination = useKeysetPagination({
    id: 'admin.nodes.list',
    filterKey: JSON.stringify({ q: qText.trim(), state, issuesOnly, scope: basePath }),
    searchParams,
    setSearchParams,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100, 200],
  });

  const tierSlowRefetchMs = useTierSlowIntervalMs();

  const nodesQ = useQuery({
    queryKey: [
      'nodes',
      'index',
      {
        limit: pagination.limit,
        fromId: pagination.fromId,
        q: qText.trim() || undefined,
        state: state === 'active' ? undefined : state,
      },
    ],
    queryFn: async () =>
      (
        await fetchNodes({
          limit: pagination.limit,
          fromId: pagination.fromId,
          q: qText.trim() || undefined,
          state: state === 'active' ? undefined : state,
        })
      ).data,
    staleTime: 15000,
    refetchInterval: tierSlowRefetchMs,
  });

  const statusQ = useQuery({
    queryKey: ['nodes', 'public_status'],
    queryFn: async () => (await fetchPublicNodeStatus()).data,
    staleTime: 15000,
    refetchInterval: tierSlowRefetchMs,
  });

  const statusIndex = useMemo(() => buildStatusIndex(statusQ.data ?? []), [statusQ.data]);
  const shareUrl = useMemo(() => (typeof window !== 'undefined' ? window.location.href : ''), [searchParams]);

  const openNode = useCallback(
    (nodeId: number) => {
      navigate(`${basePath}/nodes/${nodeId}`);
    },
    [basePath, navigate]
  );

  const applySmartText = useCallback(
    (raw: string) => {
      const input = String(raw ?? '').trim();
      if (!input) return;

      if (input === '?') {
        setHelpOpen(true);
        return;
      }

      const tokens = tokenizeSmartInput(input);

      // Fast path: numeric opens the node detail.
      if (tokens.length === 1) {
        const num = parseNumericToken(tokens[0] ?? '');
        if (num !== null) {
          openNode(num);
          setSmart('');
          setSmartErrors([]);
          return;
        }
      }

      const free: string[] = [];
      const errors: string[] = [];

      for (const tok of tokens) {
        const kv = splitKeyValueToken(tok);
        if (!kv) {
          const bare = unquoteSmartValue(tok);
          const low = bare.trim().toLowerCase();

          if (low === 'issues' || low === 'issue' || low === 'problem' || low === 'problems') {
            setIssuesParam(true);
            continue;
          }

          // Convenience: allow bare state tokens.
          const st = resolveNodeStateValue(low);
          if (st) {
            setStateParam(st);
            continue;
          }

          free.push(bare);
          continue;
        }

        const keyRaw = String(kv.rawKey ?? '').trim();
        const value = unquoteSmartValue(kv.rawValue);
        const key = keyRaw.toLowerCase();

        if (!key) {
          errors.push(t('filters.smart.error.unknown_key', { key: kv.rawKey }));
          continue;
        }

        if (key === 'id' || key === '#') {
          const id = parseNumericToken(value);
          if (id === null) {
            errors.push(t('filters.smart.error.numeric_only', { key: 'id', value }));
            continue;
          }
          openNode(id);
          setSmart('');
          setSmartErrors([]);
          return;
        }

        if (key === 'q' || key === 'search' || key === 's' || key === 'text') {
          if (!value.trim()) {
            errors.push(t('filters.smart.error.missing_value', { key: keyRaw }));
            continue;
          }
          free.push(value);
          continue;
        }

        if (key === 'state') {
          if (!value.trim()) {
            errors.push(t('filters.smart.error.missing_value', { key: keyRaw }));
            continue;
          }

          const st = resolveNodeStateValue(value);
          if (!st) {
            errors.push(t('admin.nodes.smart.error.state', { value }));
            continue;
          }

          setStateParam(st);
          continue;
        }

        if (key === 'issues') {
          const b = parseIssuesValue(value);
          if (b === null) {
            errors.push(t('admin.nodes.smart.error.issues', { value }));
            continue;
          }
          setIssuesParam(b);
          continue;
        }

        errors.push(t('filters.smart.error.unknown_key', { key: kv.rawKey }));
      }

      const q = free.join(' ').trim();
      setTextParam('q', q || undefined);

      setSmart('');
      setSmartErrors(errors);

      if (errors.length > 0) {
        toasts.pushToast({ variant: 'danger', title: errors[0] ?? t('common.unknown_error') });
      }
    },
    [openNode, setIssuesParam, setStateParam, setTextParam, t, toasts]
  );

  const smartSuggestions = useMemo<SmartFilterSuggestion[]>(() => {
    const out: SmartFilterSuggestion[] = [];
    const needle = smartNeedle;
    if (!needle) return out;

    if (needle === '?') {
      out.push({
        id: 'help',
        primary: t('filters.help.open'),
        secondary: t('filters.help.suggestion.secondary'),
        onPick: () => setHelpOpen(true),
        testId: 'admin.nodes.smart.suggest.help',
      });
      return out;
    }

    const num = parseNumericToken(needle);
    if (num !== null) {
      out.push({
        id: `open.${num}`,
        primary: t('admin.nodes.smart.suggest.open_node', { id: num }),
        secondary: t('admin.nodes.smart.suggest.open_node.secondary'),
        onPick: () => {
          openNode(num);
          setSmart('');
        },
        testId: 'admin.nodes.smart.suggest.open_node',
      });
    }

    const low = needle.toLowerCase();
    if (low === 'issues' || low === 'issue') {
      out.push({
        id: 'issues',
        primary: 'issues',
        secondary: t('admin.nodes.smart.suggest.issues'),
        onPick: () => {
          setIssuesParam(true);
          setSmart('');
        },
      });
    }

    const st = resolveNodeStateValue(low);
    if (st && st !== 'active') {
      out.push({
        id: `state.${st}`,
        primary: `state:${st}`,
        secondary: t('admin.nodes.smart.suggest.state', { state: st }),
        onPick: () => {
          setStateParam(st);
          setSmart('');
        },
      });
    }

    out.push({
      id: 'search',
      primary: t('admin.nodes.smart.suggest.search', { q: needle }),
      secondary: t('admin.nodes.smart.suggest.search.secondary'),
      onPick: () => {
        setTextParam('q', needle);
        setSmart('');
      },
      testId: 'admin.nodes.smart.suggest.search',
    });

    return out;
  }, [openNode, setIssuesParam, setStateParam, setTextParam, smartNeedle, t]);

  const pageNodes = nodesQ.data ?? [];
  const rows = useMemo(
    () =>
      buildNodeRows({
        nodes: nodesQ.data,
        nodesUnavailable: nodesQ.isError,
        publicStatus: statusQ.data,
        statusIndex,
      }),
    [nodesQ.data, nodesQ.isError, statusIndex, statusQ.data]
  );
  const filtered = useMemo(
    () => filterNodeRows(rows, { issuesOnly, qText, nodesUnavailable: nodesQ.isError }),
    [issuesOnly, nodesQ.isError, qText, rows]
  );
  const stats = useMemo(() => nodeStats(rows), [rows]);

  const pageCursor = useMemo(() => cursorFromDescendingPage(pageNodes, (node) => node.id), [pageNodes]);
  const hasMore = pageNodes.length >= pagination.limit;

  const canPaginate = nodesQ.isSuccess;
  const canNext = canPaginate && (pagination.hasForward || (hasMore && pageCursor !== null));
  const listHint = nodesQ.isError && statusQ.data ? t('admin.nodes.meta.auth_index_unavailable') : undefined;
  const statsScopeLabel = canPaginate ? t('admin.nodes.stats.scope_page') : t('admin.nodes.stats.scope_total');

  const refetchAll = useCallback(() => {
    void nodesQ.refetch();
    void statusQ.refetch();
  }, [nodesQ, statusQ]);

  const createDisabled = Boolean(indeterminateCreate) || !createCapabilityQ.isSuccess;
  const createDisabledReason = indeterminateCreate
    ? t('admin.node.editor.create.indeterminate_body')
    : !createCapabilityQ.isSuccess
      ? t('admin.node.editor.capability_unavailable.body')
      : undefined;

  return (
    <ListShell
      testId="admin.nodes.page"
      header={
        <PageHeader
          title={t('admin.nodes.title')}
          description={t('admin.nodes.subtitle')}
          meta={filtersActive ? <span className="text-xs text-faint">{listHint ?? t('list.meta.filters_active')}</span> : null}
          actions={
            auth.role === 'admin' ? (
              <Button
                variant="primary"
                disabled={createDisabled}
                loading={createCapabilityQ.isLoading}
                disabledReason={createDisabledReason}
                onClick={() => setCreateOpen(true)}
                testId="admin.nodes.create"
              >
                {t('admin.node.editor.action.create')}
              </Button>
            ) : null
          }
          testId="admin.nodes.list.header"
        />
      }
      filters={
        <NodesFilters
          t={t}
          smart={smart}
          smartErrors={smartErrors}
          smartInputRef={smartInputRef}
          smartSuggestions={smartSuggestions}
          filtersActive={filtersActive}
          shareUrl={shareUrl}
          helpOpen={helpOpen}
          advancedOpen={advancedOpen}
          qText={qText}
          state={state}
          issuesOnly={issuesOnly}
          shownCount={filtered.length}
          totalCount={rows.length}
          onSmartChange={setSmart}
          onSmartSubmit={() => applySmartText(smart)}
          onSetSmartErrors={setSmartErrors}
          onHelpOpenChange={setHelpOpen}
          onAdvancedOpenChange={setAdvancedOpen}
          onSetTextParam={setTextParam}
          onSetIssuesParam={setIssuesParam}
          onSetStateParam={setStateParam}
          onClearFilters={clearFilters}
          onRefresh={refetchAll}
        />
      }
    >
      {indeterminateCreate ? (
        <NodeCreateIndeterminateGuard
          attempt={indeterminateCreate}
          onListRefresh={() => nodesQ.refetch()}
        />
      ) : null}
      <NodesListContent
        t={t}
        basePath={basePath}
        rows={filtered}
        stats={stats}
        statsScopeLabel={statsScopeLabel}
        filtersActive={filtersActive}
        onClearFilters={clearFilters}
        onRetry={refetchAll}
        isBlockingError={nodesQ.isError && statusQ.isError && rows.length === 0}
        nodesError={nodesQ.error}
        statusError={statusQ.error}
        showAuthIndexUnavailable={nodesQ.isError && Boolean(statusQ.data)}
        showPublicStatusUnavailable={statusQ.isError && Boolean(nodesQ.data)}
        isLoading={nodesQ.isLoading && !nodesQ.data && statusQ.isLoading && !statusQ.data}
        canPaginate={canPaginate}
        canNext={canNext}
        pageCursor={pageCursor}
        pagination={pagination}
      />
      <NodeCreateModal
        open={createOpen}
        capabilityAvailable={auth.role === 'admin' && createCapabilityQ.isSuccess}
        capability={createCapabilityQ.data}
        capabilityError={createCapabilityQ.error}
        onClose={() => setCreateOpen(false)}
        onIndeterminate={(attempt) => {
          setCreateOpen(false);
          setIndeterminateCreate(attempt);
        }}
      />
    </ListShell>
  );
}
