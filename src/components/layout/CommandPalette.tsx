import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleHelp } from 'lucide-react';

import { useAuth } from '../../app/auth';
import { useAppMode } from '../../app/appMode';
import { getRuntimeConfig } from '../../app/config';
import { useI18n } from '../../app/i18n';
import { useToasts } from '../../app/toasts';
import { useObjectScope } from '../../app/objectScope';
import { clusterSearch, type ClusterSearchHit } from '../../lib/api/clusterSearch';
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue';
import {
  clusterResourceHref,
  clusterResourceKey,
  clusterResourceRefLabel,
  enrichUserSearchResults,
  normalizeClusterResource,
  parseClusterId,
} from '../../lib/search/clusterSearchResults';
import {
  searchUserObjects,
  type UserGlobalSearchGroup,
} from '../../lib/search/userGlobalSearch';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { SmartInputHelpContent } from '../ui/SmartInputHelp';
import { Spinner } from '../ui/Spinner';
import { clsx } from '../ui/clsx';

type PaletteResult = {
  key: string;
  group: 'vps' | 'users' | 'ips' | 'dns_zones' | 'tx_chains' | 'other';
  primary: string;
  secondary: string;
  href: string;
  /** Optional numeric identifier (for copy/direct-open rules). */
  id?: number;
  /** Normalized resource name (when known). */
  resource?: string;
  /** Cluster search attribute that matched (when applicable). */
  attribute?: string;
  raw: unknown;
};

type QualifierKey =
  | 'vps'
  | 'user'
  | 'node'
  | 'ip'
  | 'dns'
  | 'zone'
  | 'chain'
  | 'tx'
  | 'outage'
  | 'payment'
  | 'request'
  | 'dataset'
  | 'export'
  | 'network'
  | 'migration';

function parseIdToken(raw: string): number | null {
  const q = String(raw ?? '').trim();
  if (!q) return null;
  const m = q.match(/^#?(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function stripOuterQuotes(value: string): string {
  const s = value.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
  return s;
}

function parseQualifier(raw: string): { key: QualifierKey | null; value: string } {
  const s = String(raw ?? '').trim();
  if (!s) return { key: null, value: '' };
  const m = s.match(/^([a-zA-Z_]+)\s*:\s*(.*)$/);
  if (!m) return { key: null, value: s };
  const k = String(m[1] ?? '').trim().toLowerCase();
  const v = stripOuterQuotes(String(m[2] ?? '').trim());

  const allowed: Record<string, QualifierKey> = {
    vps: 'vps',
    user: 'user',
    node: 'node',
    ip: 'ip',
    dns: 'dns',
    zone: 'zone',
    chain: 'chain',
    tx: 'tx',
    outage: 'outage',
    payment: 'payment',
    request: 'request',
    dataset: 'dataset',
    export: 'export',
    network: 'network',
    migration: 'migration',
  };

  const key = allowed[k];
  if (!key) return { key: null, value: s };
  return { key, value: v };
}

function resourceAllowlistForQualifier(key: QualifierKey | null): string[] | null {
  if (!key) return null;
  if (key === 'vps') return ['Vps'];
  if (key === 'user') return ['User'];
  if (key === 'node') return ['Node'];
  if (key === 'ip') return ['IpAddress'];
  if (key === 'dns' || key === 'zone') return ['DnsZone'];
  if (key === 'chain') return ['TransactionChain'];
  if (key === 'tx') return ['Transaction'];
  if (key === 'dataset') return ['Dataset'];
  if (key === 'migration') return ['MigrationPlan'];
  if (key === 'network') return ['Network'];
  // The rest are plugin/domain entities not covered by cluster.search in all deployments.
  return null;
}

function pickDirectOpenCandidate(idToken: number, rows: PaletteResult[]): PaletteResult | null {
  if (!Number.isFinite(idToken) || idToken <= 0) return null;

  const idMatches = rows.filter((r) => {
    if (r.id !== idToken) return false;
    const attr = String(r.attribute ?? '').toLowerCase();
    // Prefer exact ID matches when available; tolerate unknown (e.g. results built from show actions).
    return !attr || attr === 'id';
  });
  if (idMatches.length === 0) return null;

  const prio: Record<string, number> = {
    Vps: 1,
    TransactionChain: 2,
    Transaction: 3,
    Outage: 4,
    User: 5,
    IpAddress: 6,
    Dataset: 7,
    DnsZone: 8,
    MigrationPlan: 9,
    Node: 10,
    Network: 11,
  };

  const sorted = [...idMatches].sort((a, b) => {
    const pa = prio[String(a.resource ?? '')] ?? 999;
    const pb = prio[String(b.resource ?? '')] ?? 999;
    if (pa !== pb) return pa - pb;
    return String(a.key).localeCompare(String(b.key));
  });

  return sorted[0] ?? null;
}

function buildHrefWithBasename(path: string): string {
  const cfg = getRuntimeConfig();
  const base = (cfg.routerBasename ?? '').replace(/\/$/, '');
  if (!base) return path;
  return `${base}${path}`;
}

function resultsFromClusterSearch(
  hits: ClusterSearchHit[],
  basePath: string,
  t: (key: string, vars?: Record<string, unknown>) => string
): PaletteResult[] {
  const out: PaletteResult[] = [];

  for (const h of hits ?? []) {
    const resource = normalizeClusterResource((h as any)?.resource);
    const id = parseClusterId((h as any)?.id);
    if (!resource || id === null) continue;
    if (resource === 'ActionState') continue;

    const href = clusterResourceHref(basePath, resource, id);
    if (!href) continue;

    const fallbackRef = clusterResourceRefLabel(t, resource, id);
    const primary = String((h as any)?.value ?? (h as any)?.label ?? fallbackRef).trim();
    const attr = String((h as any)?.attribute ?? '').trim();
    const secondary = attr ? `${fallbackRef} · ${attr}` : fallbackRef;
    const group =
      resource === 'Vps'
        ? 'vps'
        : resource === 'User'
          ? 'users'
          : resource === 'IpAddress'
            ? 'ips'
            : resource === 'TransactionChain'
              ? 'tx_chains'
              : 'other';

    out.push({
      key: clusterResourceKey(resource, id),
      group,
      primary,
      secondary,
      href,
      id,
      resource,
      attribute: attr || undefined,
      raw: h,
    });
  }

  return out;
}

function groupLabel(group: PaletteResult['group'], t: (k: any) => string): string {
  if (group === 'vps') return t('palette.group.vps');
  if (group === 'users') return t('palette.group.users');
  if (group === 'ips') return t('palette.group.ip_addresses');
  if (group === 'dns_zones') return t('palette.group.dns_zones');
  if (group === 'tx_chains') return t('palette.group.transaction_chains');
  return t('palette.group.other');
}

function userKindsForQualifier(key: QualifierKey | null): UserGlobalSearchGroup[] | undefined {
  if (!key) return undefined;
  if (key === 'vps') return ['vps'];
  if (key === 'ip') return ['ips'];
  if (key === 'dns' || key === 'zone') return ['dns_zones'];
  return [];
}

export function CommandPalette(props: { open: boolean; onClose: () => void }) {
  const auth = useAuth();
  const { basePath, mode } = useAppMode();
  const scope = useObjectScope();
  const { t } = useI18n();
  const toasts = useToasts();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PaletteResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [manualSelection, setManualSelection] = useState(false);
  const [helpOpenManual, setHelpOpenManual] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebouncedValue(query.trim(), 200);
  const helpFromQuery = query.trim() === '?';
  const helpOpen = helpFromQuery || helpOpenManual;

  // Reset state when the palette opens.
  useEffect(() => {
    if (!props.open) return;
    setQuery('');
    setError(null);
    setResults([]);
    setSelected(0);
    setManualSelection(false);
    setHelpOpenManual(false);

    // Focus input on open.
    const tId = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(tId);
  }, [props.open]);

  const canUseClusterSearch = auth.canUseAdminUi && mode === 'admin';

  useEffect(() => {
    if (!props.open) return;

    // Help mode should not issue API calls.
    if (helpOpen) {
      setLoading(false);
      setError(null);
      setResults([]);
      return;
    }

    const q = debouncedQuery;
    if (!q) {
      setLoading(false);
      setError(null);
      setResults([]);
      return;
    }

    // GitHub-like minimal qualifier support: key:value.
    const parsedQualifier = parseQualifier(q);
    const allowlist = resourceAllowlistForQualifier(parsedQualifier.key);
    const searchValue = parsedQualifier.key ? parsedQualifier.value.trim() : q;
    // If the qualifier has no value yet ("user:"), treat as empty.
    if (parsedQualifier.key && !searchValue) {
      setLoading(false);
      setError(null);
      setResults([]);
      return;
    }

    const ac = new AbortController();
    let alive = true;
    setLoading(true);
    setError(null);

    const run = async () => {
      try {
        if (canUseClusterSearch) {
          const res = await clusterSearch({ query: searchValue, signal: ac.signal });
          let parsed = resultsFromClusterSearch(res.data ?? [], basePath, t);

          if (allowlist && allowlist.length > 0) {
            const allowed = new Set(allowlist);
            parsed = parsed.filter((r) => (r.resource ? allowed.has(r.resource) : false));
          }

          parsed = await enrichUserSearchResults(parsed, t, ac.signal);

          if (!alive || ac.signal.aborted) return;
          setResults(parsed);
        } else {
          const kinds = userKindsForQualifier(parsedQualifier.key);
          const parsed = kinds?.length === 0 ? [] : await searchUserObjects({
            basePath,
            query: searchValue,
            t,
            scopeUserId: scope.mineUserId,
            expectedUserId: typeof auth.user?.id === 'number' ? auth.user.id : undefined,
            kinds,
            limitPerGroup: 5,
            signal: ac.signal,
          });
          if (!alive || ac.signal.aborted) return;
          setResults(parsed);
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        if (!alive || ac.signal.aborted) return;
        setError(String(e?.message ?? e));
        setResults([]);
      } finally {
        if (!alive || ac.signal.aborted) return;
        setLoading(false);
      }
    };

    void run();
    return () => {
      alive = false;
      ac.abort();
    };
  }, [auth.user?.id, basePath, canUseClusterSearch, debouncedQuery, helpOpen, props.open, scope.mineUserId, t]);

  const visibleResults = results;

  // Reset manual selection when the search changes.
  useEffect(() => {
    if (!props.open) return;
    setManualSelection(false);
    setSelected(0);
  }, [debouncedQuery, props.open]);

  // Clamp selected index when results change.
  useEffect(() => {
    setSelected((prev) => {
      const max = Math.max(0, visibleResults.length - 1);
      return Math.min(Math.max(0, prev), max);
    });
  }, [visibleResults.length]);

  const grouped = useMemo(() => {
    const map = new Map<PaletteResult['group'], PaletteResult[]>();
    for (const r of visibleResults) {
      const g = r.group;
      const arr = map.get(g) ?? [];
      arr.push(r);
      map.set(g, arr);
    }

    const order: PaletteResult['group'][] = ['vps', 'users', 'ips', 'dns_zones', 'tx_chains', 'other'];
    return order
      .map((g) => ({ group: g, rows: map.get(g) ?? [] }))
      .filter((x) => x.rows.length > 0);
  }, [visibleResults]);

  const flattened = visibleResults;
  const indexByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < flattened.length; i++) {
      const r = flattened[i];
      if (r) m.set(r.key, i);
    }
    return m;
  }, [flattened]);

  const openResult = (r: PaletteResult, opts?: { newTab?: boolean }) => {
    if (opts?.newTab) {
      window.open(buildHrefWithBasename(r.href), '_blank', 'noopener');
    } else {
      navigate(r.href);
    }
    props.onClose();
  };

  const copySelected = async () => {
    const r = flattened[selected];
    if (!r) return;
    try {
      const rel = buildHrefWithBasename(r.href);
      const url = typeof window !== 'undefined' ? `${window.location.origin}${rel}` : rel;
      await navigator.clipboard.writeText(url);
      toasts.pushToast({ variant: 'ok', title: t('toast.copied.title'), body: url });
    } catch {
      toasts.pushToast({ variant: 'warn', title: t('toast.copied_failed.title') });
    }
  };

  const copySelectedId = async () => {
    const r = flattened[selected];
    const id = typeof r?.id === 'number' && Number.isFinite(r.id) ? r.id : null;
    if (!r || id === null) return;
    try {
      const txt = `#${id}`;
      await navigator.clipboard.writeText(txt);
      toasts.pushToast({ variant: 'ok', title: t('toast.copied.title'), body: txt });
    } catch {
      toasts.pushToast({ variant: 'warn', title: t('toast.copied_failed.title') });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setManualSelection(true);
      setSelected((prev) => Math.min(prev + 1, Math.max(0, flattened.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setManualSelection(true);
      setSelected((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      if (helpOpen) {
        e.preventDefault();
        setHelpOpenManual(false);
        if (helpFromQuery) setQuery('');
        return;
      }

      // When the user typed a pure ID token and did not explicitly navigate,
      // pick a sensible direct-open target (admin scope only).
      if (!manualSelection && canUseClusterSearch) {
        const idToken = parseIdToken(debouncedQuery);
        if (idToken !== null) {
          const cand = pickDirectOpenCandidate(idToken, flattened);
          if (cand) {
            const newTab = e.metaKey || e.ctrlKey;
            e.preventDefault();
            openResult(cand, { newTab });
            return;
          }
        }
      }

      const r = flattened[selected];
      if (!r) return;
      const newTab = e.metaKey || e.ctrlKey;
      e.preventDefault();
      openResult(r, { newTab });
    } else if ((e.key === 'c' || e.key === 'C') && (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey) {
      // Ctrl/Cmd+Shift+C copies the selected entity URL.
      e.preventDefault();
      void copySelected();
    } else if ((e.key === 'i' || e.key === 'I') && (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey) {
      // Ctrl/Cmd+Shift+I copies the selected entity ID.
      e.preventDefault();
      void copySelectedId();
    }
  };

  const helpKeysTop = useMemo(() => {
    if (canUseClusterSearch) {
      return [
        { key: 'vps', description: t('palette.help.keys.vps'), example: 'vps:123' },
        { key: 'user', description: t('palette.help.keys.user'), example: 'user:alice' },
        { key: 'ip', description: t('palette.help.keys.ip'), example: 'ip:1.2.3.4' },
        { key: 'node', description: t('palette.help.keys.node'), example: 'node:node15' },
        { key: 'dns', description: t('palette.help.keys.dns'), example: 'dns:example.com' },
        { key: 'chain', description: t('palette.help.keys.chain'), example: 'chain:123' },
      ];
    }

    return [
      { key: 'vps', description: t('palette.help.keys.vps'), example: 'vps3' },
      { key: 'ip', description: t('palette.help.keys.ip'), example: 'ip:1.2.3.4' },
      { key: 'dns', description: t('palette.help.keys.dns'), example: 'dns:example.com' },
    ];
  }, [canUseClusterSearch, t]);

  const helpKeysMore = useMemo(() => {
    if (!canUseClusterSearch) return [];
    return [
      { key: 'tx', description: t('palette.help.keys.tx'), example: 'tx:123' },
      { key: 'dataset', description: t('palette.help.keys.dataset'), example: 'dataset:123' },
      { key: 'migration', description: t('palette.help.keys.migration'), example: 'migration:123' },
      { key: 'network', description: t('palette.help.keys.network'), example: 'network:123' },
    ];
  }, [canUseClusterSearch, t]);

  const helpExamples = useMemo(() => {
    const shared = [
      { example: '?', description: t('palette.help.examples.help') },
      { example: '123', description: t('palette.help.examples.id') },
      { example: '#123', description: t('palette.help.examples.hash_id') },
    ];
    if (!canUseClusterSearch) {
      return [
        ...shared,
        { example: 'vps3', description: t('palette.help.examples.vps') },
        { example: '1.2.3.4', description: t('palette.help.examples.ip') },
        { example: 'example.com', description: t('palette.help.examples.domain') },
      ];
    }
    return [
      ...shared,
      { example: 'node15', description: t('palette.help.examples.node') },
      { example: '1.2.3.4', description: t('palette.help.examples.ip') },
      { example: 'example.com', description: t('palette.help.examples.domain') },
      { example: 'alice', description: t('palette.help.examples.user') },
    ];
  }, [canUseClusterSearch, t]);

  const helpInference = useMemo(
    () => [
      t('palette.help.inference.free_text'),
      t('palette.help.inference.id_tokens'),
      t('palette.help.inference.qualifiers'),
    ],
    [t]
  );

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      mobileFullScreen
      size="lg"
      testId="palette.modal"
    >
      <div className="flex h-full flex-col" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2">
          <div className="relative w-full">
            <Input
              ref={inputRef}
              testId="palette.input"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (helpOpenManual) setHelpOpenManual(false);
              }}
              placeholder={canUseClusterSearch ? t('palette.placeholder.admin') : t('palette.placeholder.user')}
              className="h-11 pr-11"
            />

            <div className="absolute inset-y-0 right-0 flex items-center pr-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 px-0"
                onClick={() => setHelpOpenManual(true)}
                ariaLabel={t('filters.help.open')}
                title={t('filters.help.open')}
                testId="palette.help.open"
              >
                <CircleHelp className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>

          <Button variant="secondary" onClick={props.onClose}>
            {t('common.close')}
          </Button>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto">
          {helpOpen ? (
            <div data-testid="palette.help">
              <div className="text-sm font-semibold">{t('palette.help.title')}</div>
              <div className="mt-3">
                <SmartInputHelpContent
                  intro={t('palette.help.intro')}
                  examples={helpExamples}
                  topKeys={helpKeysTop}
                  moreKeys={helpKeysMore}
                  inference={helpInference}
                  onInsertKey={(key) => {
                    setQuery(`${key}:`);
                    setHelpOpenManual(false);
                    window.setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                  onClose={() => {
                    setHelpOpenManual(false);
                    if (helpFromQuery) setQuery('');
                    window.setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                  closeLabel={t('palette.help.back')}
                  showCloseButton
                />
              </div>
            </div>
          ) : !query.trim() ? (
            <div className="text-sm text-muted" data-testid="palette.empty">
              {t('palette.empty.type_to_search')}
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 text-sm text-muted" data-testid="palette.loading">
              <Spinner />
              {t('palette.loading')}
            </div>
          ) : error ? (
            <div className="text-sm text-danger" data-testid="palette.error">
              {t('palette.error_prefix')}: {error}
            </div>
          ) : flattened.length === 0 ? (
            <div className="text-sm text-muted" data-testid="palette.no_results">
              {t('palette.empty.no_results')}
            </div>
          ) : (
            <div className="space-y-4" data-testid="palette.results">
              {grouped.map((g) => (
                <div key={g.group}>
                  <div className="text-xs font-semibold text-muted">{groupLabel(g.group, t)}</div>
                  <div className="mt-2 rounded-md border border-border">
                    {g.rows.map((r) => {
                      const idx = indexByKey.get(r.key);
                      if (idx === undefined) return null;
                      const isSel = idx === selected;
                      return (
                        <button
                          key={r.key}
                          type="button"
                          className={clsx(
                            'flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm',
                            'hover:bg-surface-2',
                            isSel ? 'bg-surface-2' : 'bg-surface',
                            'border-b border-border last:border-b-0'
                          )}
                          onMouseEnter={() => {
                            setSelected(idx);
                            setManualSelection(true);
                          }}
                          onClick={() => openResult(r)}
                          data-testid={`palette.result.${idx}`}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{r.primary}</div>
                            <div className="truncate text-xs text-muted">{r.secondary}</div>
                          </div>

                          <div className="shrink-0 text-xs text-faint">↵</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-border pt-3 text-xs text-muted">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>{t('palette.hint.navigate')}</span>
            <span>{t('palette.hint.open')}</span>
            <span>{t('palette.hint.copy')}</span>
            <span>{t('palette.hint.copy_id')}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
