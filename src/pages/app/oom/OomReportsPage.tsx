import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CircleHelp, SlidersHorizontal } from 'lucide-react';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { useObjectScope } from '../../../app/objectScope';
import { useToasts } from '../../../app/toasts';
import { FilterBar } from '../../../components/layout/FilterBar';
import { ListShell } from '../../../components/layout/ListShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { fetchNodes } from '../../../lib/api/nodes';
import { searchUsers } from '../../../lib/api/users';
import { fetchEnvironments, fetchLocations, fetchOomReports, type OomReport } from '../../../lib/api/oom';
import { localInputToIso } from '../../../lib/datetimeLocal';
import { compactText, formatDateTime } from '../../../lib/format';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import {
  parseNumericToken,
  splitKeyValueToken,
  tokenizeSmartInput,
  unquoteSmartValue,
} from '../../../lib/smartFilter';

import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { ChipLink, MiniLink } from '../../../components/ui/ChipLink';
import { CopyButton } from '../../../components/ui/CopyButton';
import { Drawer } from '../../../components/ui/Drawer';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { FilterChip } from '../../../components/ui/FilterChip';
import { Input } from '../../../components/ui/Input';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../components/ui/LoadingState';
import { Select } from '../../../components/ui/Select';
import { type SmartFilterSuggestion, SmartFilterInput } from '../../../components/ui/SmartFilterInput';
import { SmartInputHelp } from '../../../components/ui/SmartInputHelp';
import { StatusDot } from '../../../components/ui/StatusDot';
import { TableRowLink } from '../../../components/ui/TableRowLink';
import { UserLookupInput } from '../../../components/ui/UserLookupInput';
import { VpsLookupInput } from '../../../components/ui/VpsLookupInput';
import { dotVariantFromRowVariant } from '../../../lib/variantMap';
import {
  canonicalKey,
  envLabel,
  locLabel,
  nodeLabel,
  parseDateTimeLocalValue,
  resolveOptionId,
  ruleLabelKey,
  ruleVariant,
  safeNumber,
} from './oomReportsListSemantics';

export function OomReportsPage() {
  const { basePath, mode } = useAppMode();
  const scope = useObjectScope();
  const { t } = useI18n();
  const navigate = useNavigate();
  const toasts = useToasts();

  const [sp, setSp] = useSearchParams();
  const searchParamsKey = sp.toString();

  const [q, setQ] = useState(() => sp.get('q') ?? '');
  const [vps, setVps] = useState(() => sp.get('vps') ?? '');
  const [user, setUser] = useState(() => sp.get('user') ?? '');
  const [node, setNode] = useState(() => sp.get('node') ?? '');
  const [location, setLocation] = useState(() => sp.get('location') ?? '');
  const [environment, setEnvironment] = useState(() => sp.get('environment') ?? '');
  const [rule, setRule] = useState(() => sp.get('oom_report_rule') ?? '');
  const [cgroup, setCgroup] = useState(() => sp.get('cgroup') ?? '');
  const [since, setSince] = useState(() => sp.get('since') ?? '');
  const [until, setUntil] = useState(() => sp.get('until') ?? '');

  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const smartNeedle = smart.trim();
  const smartInputRef = useRef<HTMLInputElement | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    const current = new URLSearchParams(searchParamsKey);
    setQ(current.get('q') ?? '');
    setVps(current.get('vps') ?? '');
    setUser(current.get('user') ?? '');
    setNode(current.get('node') ?? '');
    setLocation(current.get('location') ?? '');
    setEnvironment(current.get('environment') ?? '');
    setRule(current.get('oom_report_rule') ?? '');
    setCgroup(current.get('cgroup') ?? '');
    setSince(current.get('since') ?? '');
    setUntil(current.get('until') ?? '');
  }, [searchParamsKey]);

  useEffect(() => {
    if (smartNeedle === '?') setHelpOpen(true);
  }, [smartNeedle]);

  const vpsId = useMemo(() => safeNumber(vps), [vps]);
  const userId = useMemo(() => (mode === 'admin' ? safeNumber(user) : undefined), [mode, user]);
  const effectiveUserId = mode === 'admin' ? userId : scope.mineUserId;
  const nodeId = useMemo(() => safeNumber(node), [node]);
  const locationId = useMemo(() => safeNumber(location), [location]);
  const envId = useMemo(() => safeNumber(environment), [environment]);
  const ruleId = useMemo(() => safeNumber(rule), [rule]);

  const qTrim = q.trim();

  const sinceIso = useMemo(() => {
    const r = localInputToIso(since);
    return r.valid ? r.iso ?? undefined : undefined;
  }, [since]);

  const untilIso = useMemo(() => {
    const r = localInputToIso(until);
    return r.valid ? r.iso ?? undefined : undefined;
  }, [until]);

  useEffect(() => {
    const next = new URLSearchParams(sp);

    if (qTrim) next.set('q', qTrim);
    else next.delete('q');

    if (vpsId) next.set('vps', String(vpsId));
    else if (!vps.trim()) next.delete('vps');

    if (mode === 'admin') {
      if (userId) next.set('user', String(userId));
      else if (!user.trim()) next.delete('user');
    } else {
      next.delete('user');
    }

    if (nodeId) next.set('node', String(nodeId));
    else if (!node.trim()) next.delete('node');

    if (locationId) next.set('location', String(locationId));
    else if (!location.trim()) next.delete('location');

    if (envId) next.set('environment', String(envId));
    else if (!environment.trim()) next.delete('environment');

    if (ruleId) next.set('oom_report_rule', String(ruleId));
    else if (!rule.trim()) next.delete('oom_report_rule');

    const cgTrim = cgroup.trim();
    if (cgTrim) next.set('cgroup', cgTrim);
    else next.delete('cgroup');

    const sTrim = since.trim();
    if (sTrim) next.set('since', sTrim);
    else next.delete('since');

    const uTrim = until.trim();
    if (uTrim) next.set('until', uTrim);
    else next.delete('until');

    if (next.toString() !== sp.toString()) setSp(next, { replace: true });
  }, [
    cgroup,
    envId,
    environment,
    location,
    locationId,
    mode,
    node,
    nodeId,
    qTrim,
    rule,
    ruleId,
    setSp,
    since,
    sp,
    until,
    user,
    userId,
    vps,
    vpsId,
  ]);

  const filtersActive = Boolean(
    qTrim ||
      vpsId ||
      (mode === 'admin' && userId) ||
      nodeId ||
      locationId ||
      envId ||
      ruleId ||
      cgroup.trim() ||
      since.trim() ||
      until.trim() ||
      smartErrors.length > 0
  );

  const pagination = useKeysetPagination({
    id: 'oom_reports.list',
    filterKey: JSON.stringify({
      scope: basePath,
      q: qTrim,
      vps: vpsId,
      user: effectiveUserId,
      node: nodeId,
      location: locationId,
      environment: envId,
      rule: ruleId,
      cgroup: cgroup.trim(),
      since: since.trim(),
      until: until.trim(),
    }),
    searchParams: sp,
    setSearchParams: setSp,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100],
  });

  const listQ = useQuery({
    queryKey: [
      'oom_reports',
      'index',
      {
        limit: pagination.limit,
        from: pagination.cursor,
        q: qTrim,
        vps: vpsId,
        user: effectiveUserId,
        node: nodeId,
        location: locationId,
        environment: envId,
        rule: ruleId,
        cgroup: cgroup.trim(),
        sinceIso,
        untilIso,
        scope: basePath,
      },
    ],
    queryFn: async () =>
      (
        await fetchOomReports({
          limit: pagination.limit,
          fromId: pagination.cursor as number | undefined,
          q: qTrim || undefined,
          vpsId,
          userId: effectiveUserId,
          nodeId,
          locationId,
          environmentId: envId,
          ruleId,
          cgroup: cgroup.trim() || undefined,
          sinceIso,
          untilIso,
          includes: mode === 'admin' ? 'vps__node,vps__user,oom_report_rule' : 'vps__node,oom_report_rule',
        })
      ).data,
  });

  const nodesQ = useQuery({
    queryKey: ['nodes', 'index', { scope: basePath }],
    queryFn: async () => (await fetchNodes({ limit: 200 })).data,
  });

  const envQ = useQuery({
    queryKey: ['environments', 'index', { scope: basePath }],
    queryFn: async () => (await fetchEnvironments({ limit: 200 })).data,
  });

  const locQ = useQuery({
    queryKey: ['locations', 'index', { scope: basePath }],
    queryFn: async () => (await fetchLocations({ limit: 500 })).data,
  });

  const nodeOptions = useMemo(() => {
    const list = nodesQ.data ?? [];
    const opts = [{ value: '', label: t('common.all') }];
    for (const n of list) opts.push({ value: String(n.id), label: nodeLabel(n) });
    return opts;
  }, [nodesQ.data, t]);

  const envOptions = useMemo(() => {
    const list = envQ.data ?? [];
    const opts = [{ value: '', label: t('common.all') }];
    for (const e of list) opts.push({ value: String(e.id), label: envLabel(e) });
    return opts;
  }, [envQ.data, t]);

  const locOptions = useMemo(() => {
    const list = locQ.data ?? [];
    const opts = [{ value: '', label: t('common.all') }];
    for (const l of list) opts.push({ value: String(l.id), label: locLabel(l) });
    return opts;
  }, [locQ.data, t]);

  const rows = listQ.data ?? [];

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return window.location.href;
  }, [searchParamsKey]);

  const clearFilters = () => {
    setQ('');
    setVps('');
    setUser('');
    setNode('');
    setLocation('');
    setEnvironment('');
    setRule('');
    setCgroup('');
    setSince('');
    setUntil('');
    setSmart('');
    setSmartErrors([]);
  };

  const openReport = (id: number) => {
    navigate(`${basePath}/oom-reports/${id}`);
  };

  async function applySmartText(raw: string) {
    const s = String(raw ?? '').trim();
    if (!s) return;
    if (s === '?') {
      setHelpOpen(true);
      return;
    }

    const tokens = tokenizeSmartInput(s);

    // Numeric single-token defaults to "open by id".
    if (tokens.length === 1) {
      const n = parseNumericToken(tokens[0] ?? '');
      if (n !== null) {
        openReport(n);
        setSmart('');
        setSmartErrors([]);
        return;
      }
    }

    let nextQ = q;
    let nextVps = vps;
    let nextUser = user;
    let nextNode = node;
    let nextLocation = location;
    let nextEnvironment = environment;
    let nextRule = rule;
    let nextCgroup = cgroup;
    let nextSince = since;
    let nextUntil = until;

    const free: string[] = [];
    const errs: string[] = [];

    const nodes = nodesQ.data ?? [];
    const envs = envQ.data ?? [];
    const locs = locQ.data ?? [];

    for (const token of tokens) {
      const kv = splitKeyValueToken(token);
      if (!kv) {
        free.push(unquoteSmartValue(token));
        continue;
      }

      const key = canonicalKey(kv.rawKey);
      if (!key) {
        free.push(unquoteSmartValue(token));
        continue;
      }

      const value = unquoteSmartValue(kv.rawValue);
      if (!value.trim()) {
        errs.push(t('filters.smart.error.missing_value', { key: kv.rawKey }));
        continue;
      }

      if (key === 'q') {
        nextQ = value;
        continue;
      }

      if (key === 'id') {
        const n = parseNumericToken(value);
        if (n === null) {
          errs.push(t('filters.smart.error.numeric_only', { key: 'id', value }));
          continue;
        }
        openReport(n);
        setSmart('');
        setSmartErrors([]);
        return;
      }

      if (key === 'vps') {
        const n = parseNumericToken(value);
        if (n === null) {
          errs.push(t('filters.smart.error.numeric_only', { key: 'vps', value }));
          continue;
        }
        nextVps = String(n);
        continue;
      }

      if (key === 'user') {
        if (mode !== 'admin') {
          errs.push(t('filters.smart.error.user_admin_only'));
          continue;
        }

        const n = parseNumericToken(value);
        if (n !== null) {
          nextUser = String(n);
          continue;
        }

        try {
          const users = (await searchUsers({ q: value, limit: 10 })).data;
          const exact = users.filter((u) => u.login.toLowerCase() === value.trim().toLowerCase());
          if (exact.length === 1) {
            const [resolvedUser] = exact;
            if (resolvedUser) nextUser = String(resolvedUser.id);
          } else {
            errs.push(t('filters.smart.error.user_unresolved', { value }));
          }
        } catch {
          errs.push(t('filters.smart.error.user_unresolved', { value }));
        }
        continue;
      }

      if (key === 'node') {
        const n = parseNumericToken(value);
        if (n !== null) {
          nextNode = String(n);
          continue;
        }

        const resolved = resolveOptionId(nodes, value, nodeLabel);
        if ('id' in resolved) {
          nextNode = String(resolved.id);
        } else {
          errs.push(t('filters.smart.error.node_unresolved', { value }));
        }
        continue;
      }

      if (key === 'location') {
        const n = parseNumericToken(value);
        if (n !== null) {
          nextLocation = String(n);
          continue;
        }

        const resolved = resolveOptionId(locs, value, locLabel);
        if ('id' in resolved) {
          nextLocation = String(resolved.id);
        } else {
          errs.push(t('filters.smart.error.option_unresolved', { key: 'location', value }));
        }
        continue;
      }

      if (key === 'environment') {
        const n = parseNumericToken(value);
        if (n !== null) {
          nextEnvironment = String(n);
          continue;
        }

        const resolved = resolveOptionId(envs, value, envLabel);
        if ('id' in resolved) {
          nextEnvironment = String(resolved.id);
        } else {
          errs.push(t('filters.smart.error.option_unresolved', { key: 'environment', value }));
        }
        continue;
      }

      if (key === 'rule') {
        const n = parseNumericToken(value);
        if (n === null) {
          errs.push(t('filters.smart.error.numeric_only', { key: 'rule', value }));
          continue;
        }
        nextRule = String(n);
        continue;
      }

      if (key === 'cgroup') {
        nextCgroup = value;
        continue;
      }

      if (key === 'since') {
        const parsed = parseDateTimeLocalValue(value);
        if (parsed === null) {
          errs.push(t('filters.smart.error.invalid_datetime', { value }));
          continue;
        }
        nextSince = parsed;
        continue;
      }

      if (key === 'until') {
        const parsed = parseDateTimeLocalValue(value, { endOfDay: true });
        if (parsed === null) {
          errs.push(t('filters.smart.error.invalid_datetime', { value }));
          continue;
        }
        nextUntil = parsed;
        continue;
      }
    }

    if (free.length > 0) nextQ = free.join(' ');

    if (errs.length > 0) {
      setSmartErrors(errs);
      toasts.pushToast({ variant: 'danger', title: errs[0] ?? t('common.unknown_error') });
      return;
    }

    setQ(nextQ);
    setVps(nextVps);
    setUser(nextUser);
    setNode(nextNode);
    setLocation(nextLocation);
    setEnvironment(nextEnvironment);
    setRule(nextRule);
    setCgroup(nextCgroup);
    setSince(nextSince);
    setUntil(nextUntil);
    setSmart('');
    setSmartErrors([]);
  }

  const smartSuggestions: SmartFilterSuggestion[] = useMemo(() => {
    const needle = smartNeedle;
    if (!needle) return [];

    if (needle === '?') {
      return [
        {
          id: 'help',
          primary: t('filters.help.open'),
          secondary: t('filters.help.suggestion.secondary'),
          onPick: () => setHelpOpen(true),
          testId: 'oom.smart.suggest.help',
        },
      ];
    }

    if (needle.includes(' ')) return [];

    const tokens = tokenizeSmartInput(needle);
    if (tokens.length === 1) {
      const kv = splitKeyValueToken(tokens[0] ?? '');
      if (kv) {
        const key = canonicalKey(kv.rawKey);
        if (key) return [];
      }
    }

    const out: SmartFilterSuggestion[] = [];

    const n = parseNumericToken(needle);
    if (n !== null) {
      out.push({
        id: 'open',
        primary: t('oom.smart.suggest.open', { id: n }),
        secondary: t('oom.smart.suggest.open.secondary'),
        onPick: () => {
          openReport(n);
          setSmart('');
          setSmartErrors([]);
        },
        testId: 'oom.smart.suggest.open',
      });

      out.push({
        id: 'vps',
        primary: t('oom.smart.suggest.vps', { id: n }),
        secondary: t('oom.smart.suggest.vps.secondary'),
        onPick: () => {
          setVps(String(n));
          setSmart('');
          setSmartErrors([]);
        },
        testId: 'oom.smart.suggest.vps',
      });

      if (mode === 'admin') {
        out.push({
          id: 'user',
          primary: t('oom.smart.suggest.user', { id: n }),
          secondary: t('oom.smart.suggest.user.secondary'),
          onPick: () => {
            setUser(String(n));
            setSmart('');
            setSmartErrors([]);
          },
          testId: 'oom.smart.suggest.user',
        });
      }
    }

    out.push({
      id: 'search',
      primary: t('oom.smart.suggest.search', { q: needle }),
      secondary: t('oom.smart.suggest.search.secondary'),
      onPick: () => {
        setQ(needle);
        setSmart('');
        setSmartErrors([]);
      },
      testId: 'oom.smart.suggest.search',
    });

    return out;
  }, [mode, openReport, smartNeedle, t]);

  const activeChips = useMemo(() => {
    const chips: React.ReactNode[] = [];

    if (qTrim) chips.push(<FilterChip key="q" label={`q:${qTrim}`} onRemove={() => setQ('')} testId="oom.chip.q" />);

    if (vpsId) chips.push(<FilterChip key="vps" label={`vps:${vpsId}`} onRemove={() => setVps('')} testId="oom.chip.vps" />);

    if (mode === 'admin' && userId)
      chips.push(<FilterChip key="user" label={`user:${userId}`} onRemove={() => setUser('')} testId="oom.chip.user" />);

    if (nodeId) chips.push(<FilterChip key="node" label={`node:${nodeId}`} onRemove={() => setNode('')} testId="oom.chip.node" />);

    if (locationId)
      chips.push(
        <FilterChip
          key="location"
          label={`location:${locationId}`}
          onRemove={() => setLocation('')}
          testId="oom.chip.location"
        />
      );

    if (envId)
      chips.push(
        <FilterChip
          key="environment"
          label={`environment:${envId}`}
          onRemove={() => setEnvironment('')}
          testId="oom.chip.environment"
        />
      );

    if (ruleId) chips.push(<FilterChip key="rule" label={`rule:${ruleId}`} onRemove={() => setRule('')} testId="oom.chip.rule" />);

    if (cgroup.trim())
      chips.push(
        <FilterChip key="cgroup" label={`cgroup:${cgroup.trim()}`} onRemove={() => setCgroup('')} testId="oom.chip.cgroup" />
      );

    if (since.trim())
      chips.push(
        <FilterChip key="since" label={`since:${since.trim()}`} onRemove={() => setSince('')} testId="oom.chip.since" />
      );

    if (until.trim())
      chips.push(
        <FilterChip key="until" label={`until:${until.trim()}`} onRemove={() => setUntil('')} testId="oom.chip.until" />
      );

    for (const [idx, err] of smartErrors.entries()) {
      chips.push(
        <FilterChip
          key={`err-${idx}`}
          label={err}
          tone="danger"
          onRemove={() => setSmartErrors((prev) => prev.filter((_, i) => i !== idx))}
          testId={`oom.chip.err.${idx}`}
        />
      );
    }

    return chips;
  }, [cgroup, envId, locationId, mode, nodeId, qTrim, ruleId, since, smartErrors, until, userId, vpsId]);

  const header = (
    <PageHeader
      title={t('oom.list.title')}
      description={t('oom.list.description')}
      meta={filtersActive ? <span className="text-xs text-faint">{t('list.meta.filters_active')}</span> : null}
      actions={
        <Button variant="secondary" size="sm" to={`${basePath}/oom-reports`} testId="oom.list.refresh">
          {t('common.refresh')}
        </Button>
      }
      testId="oom.list.header"
    />
  );

  return (
    <ListShell
      header={header}
      filters={
        <>
          <FilterBar testId="oom.list.filters">
            <SmartFilterInput
              ref={smartInputRef}
              value={smart}
              onChange={setSmart}
              placeholder={t('oom.search.placeholder')}
              ariaLabel={t('oom.search.aria')}
              testId="oom.smart_filter.input"
              suggestions={smartSuggestions}
              onSubmit={() => void applySmartText(smart)}
              suffix={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setHelpOpen(true)}
                  ariaLabel={t('filters.help.open')}
                  testId="oom.smart_filter.help_btn"
                >
                  <CircleHelp className="h-4 w-4" aria-hidden />
                </Button>
              }
            />

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAdvancedOpen(true)}
              ariaLabel={t('filters.advanced.open')}
              testId="oom.filters.advanced"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
            </Button>

            <CopyButton
              text={shareUrl}
              label={t('common.copy_link')}
              size="sm"
              variant="secondary"
              testId="oom.filters.copy_link"
            />

            {filtersActive ? (
              <Button variant="secondary" size="sm" onClick={clearFilters} testId="oom.filters.clear">
                {t('common.clear_filters')}
              </Button>
            ) : null}
          </FilterBar>

          {activeChips.length ? <div className="flex flex-wrap gap-2">{activeChips}</div> : null}

          <SmartInputHelp
            open={helpOpen}
            onClose={() => setHelpOpen(false)}
            title={t('oom.smart_help.title')}
            intro={t('oom.smart_help.description')}
            examples={[
              {
                label: t('oom.smart_help.examples.help.label'),
                value: '?',
                description: t('oom.smart_help.examples.help.description'),
              },
              {
                label: t('oom.smart_help.examples.open.label'),
                value: '123',
                description: t('oom.smart_help.examples.open.description'),
              },
              {
                label: t('oom.smart_help.examples.search.label'),
                value: 'nginx',
                description: t('oom.smart_help.examples.search.description'),
              },
              {
                label: t('oom.smart_help.examples.vps.label'),
                value: 'vps:123',
                description: t('oom.smart_help.examples.vps.description'),
              },
              {
                label: t('oom.smart_help.examples.cgroup.label'),
                value: 'cgroup:/user.slice',
                description: t('oom.smart_help.examples.cgroup.description'),
              },
              {
                label: t('oom.smart_help.examples.since.label'),
                value: 'since:2025-01-01',
                description: t('oom.smart_help.examples.since.description'),
              },
            ]}
            keys={[
              { key: 'q', description: t('oom.smart_help.keys.q') },
              { key: 'vps', description: t('oom.smart_help.keys.vps') },
              ...(mode === 'admin' ? [{ key: 'user', description: t('oom.smart_help.keys.user') }] : []),
              { key: 'node', description: t('oom.smart_help.keys.node') },
              { key: 'location', description: t('oom.smart_help.keys.location') },
              { key: 'environment', description: t('oom.smart_help.keys.environment') },
              { key: 'rule', description: t('oom.smart_help.keys.rule') },
              { key: 'cgroup', description: t('oom.smart_help.keys.cgroup') },
              { key: 'since', description: t('oom.smart_help.keys.since') },
              { key: 'until', description: t('oom.smart_help.keys.until') },
            ]}
            inferences={[
              t('oom.smart_help.inferences.plain_search'),
              t('oom.smart_help.inferences.numeric_open'),
              t('oom.smart_help.inferences.key_value'),
            ]}
            onInsertKey={(key) => {
              const cur = smartInputRef.current;
              const next = smart.trim() ? `${smart.trim()} ${key}:` : `${key}:`;
              setSmart(next);
              requestAnimationFrame(() => cur?.focus());
            }}
            testId="oom.smart_help"
          />

          <Drawer open={advancedOpen} onClose={() => setAdvancedOpen(false)} title={t('filters.advanced.title')} testId="oom.filters.drawer">
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium">{t('oom.filter.q')}</div>
                <div className="mt-1">
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t('oom.search.placeholder')}
                    autoComplete="off"
                    testId="oom.advanced.q"
                  />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('common.vps')}</div>
                <div className="mt-1">
                  <VpsLookupInput
                    value={vpsId ?? null}
                    onChange={(id) => setVps(id ? String(id) : '')}
                    placeholder={t('common.vps')}
                    testId="oom.advanced.vps"
                  />
                </div>
              </div>

              {mode === 'admin' ? (
                <div>
                  <div className="text-sm font-medium">{t('common.user')}</div>
                  <div className="mt-1">
                    <UserLookupInput
                      value={user}
                      onChange={setUser}
                      placeholder={t('common.user')}
                      loadingLabel={t('common.loading')}
                      noResultsLabel={t('empty.list.no_matches.title')}
                      testId="oom.advanced.user"
                    />
                  </div>
                </div>
              ) : null}

              <div>
                <div className="text-sm font-medium">{t('common.node')}</div>
                <div className="mt-1">
                  <Select value={node} onChange={(e) => setNode(e.target.value)} options={nodeOptions} testId="oom.advanced.node" />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('common.environment')}</div>
                <div className="mt-1">
                  <Select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    options={envOptions}
                    testId="oom.advanced.environment"
                  />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('common.location')}</div>
                <div className="mt-1">
                  <Select
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    options={locOptions}
                    testId="oom.advanced.location"
                  />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('oom.filter.rule')}</div>
                <div className="mt-1">
                  <Input value={rule} onChange={(e) => setRule(e.target.value)} placeholder={t('oom.filter.rule')} testId="oom.advanced.rule" />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('oom.filter.cgroup')}</div>
                <div className="mt-1">
                  <Input
                    value={cgroup}
                    onChange={(e) => setCgroup(e.target.value)}
                    placeholder={t('oom.filter.cgroup')}
                    testId="oom.advanced.cgroup"
                  />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('oom.filter.since')}</div>
                <div className="mt-1">
                  <Input type="datetime-local" value={since} onChange={(e) => setSince(e.target.value)} testId="oom.advanced.since" />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('oom.filter.until')}</div>
                <div className="mt-1">
                  <Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} testId="oom.advanced.until" />
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              {filtersActive ? (
                <Button variant="secondary" size="sm" onClick={clearFilters} testId="oom.advanced.clear">
                  {t('common.clear_filters')}
                </Button>
              ) : null}

              <Button variant="primary" size="sm" onClick={() => setAdvancedOpen(false)} testId="oom.advanced.done">
                {t('common.done')}
              </Button>
            </div>
          </Drawer>
        </>
      }
    >
      {listQ.isLoading ? (
        <LoadingState testId="oom.list.loading" />
      ) : listQ.isError ? (
        <ErrorState
          testId="oom.list.error"
          title={t('oom.list.load_error')}
          error={listQ.error}
          onRetry={() => void listQ.refetch()}
          showBack={false}
          detailsExtra={{ page: 'oom.list' }}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          testId="oom.list.empty"
          title={filtersActive ? t('empty.list.no_matches.title') : t('oom.list.empty')}
          body={filtersActive ? t('empty.list.no_matches.body') : undefined}
          actionLabel={filtersActive ? t('common.clear_filters') : undefined}
          onAction={filtersActive ? clearFilters : undefined}
        />
      ) : (
        <>
          <div className="hidden xl:block">
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <table className="table-list w-full table-fixed text-sm" data-testid="oom.list.table">
                <colgroup>
                  <col className="w-8" />
                  <col className="w-24" />
                  <col className="w-40" />
                  <col className="w-36" />
                  {mode === 'admin' ? <col className="w-32" /> : null}
                  <col className="w-24" />
                  <col />
                  <col className="w-24" />
                  <col className="w-16" />
                  <col className="w-40" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="w-8 px-4 py-2" aria-label={t('common.state')} />
                    <th className="px-4 py-2">{t('common.id')}</th>
                    <th className="px-4 py-2">{t('oom.field.created_at')}</th>
                    <th className="px-4 py-2">{t('common.vps')}</th>
                    {mode === 'admin' ? <th className="px-4 py-2">{t('common.user')}</th> : null}
                    <th className="px-4 py-2">{t('common.node')}</th>
                    <th className="px-4 py-2">{t('oom.field.killed')}</th>
                    <th className="px-4 py-2">{t('oom.field.rule_action')}</th>
                    <th className="px-4 py-2">{t('oom.field.count')}</th>
                    <th className="px-2 py-2 text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: OomReport) => {
                    const to = `${basePath}/oom-reports/${r.id}`;
                    const createdAt = formatDateTime(r.created_at);

                    const vpsIdRow = (r.vps as any)?.id ? Number((r.vps as any).id) : undefined;
                    const vpsHost = (r.vps as any)?.hostname ? String((r.vps as any).hostname) : undefined;

                    const userIdRow = (r.vps as any)?.user?.id ? Number((r.vps as any).user.id) : undefined;
                    const userLogin = (r.vps as any)?.user?.login ? String((r.vps as any).user.login) : undefined;

                    const nodeName = (r.vps as any)?.node?.domain_name ? String((r.vps as any).node.domain_name) : undefined;

                    const killed = r.killed_name ? `${r.killed_name}${r.killed_pid ? ` (${r.killed_pid})` : ''}` : '—';
                    const cgroupText = r.cgroup ? String(r.cgroup) : '';
                    const cgroupShort = compactText(cgroupText, 64);

                    const action = (r.oom_report_rule as any)?.action ? String((r.oom_report_rule as any).action) : undefined;
                    const rowVariant = ruleVariant(action);
                    const dotVariant = dotVariantFromRowVariant(rowVariant);

                    return (
                      <TableRowLink key={r.id} to={to} variant={rowVariant} testId={`oom.list.row.${r.id}`}>
                        <td className="px-4 py-2">
                          <StatusDot variant={dotVariant} testId={`oom.list.row.${r.id}.dot`} />
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">
                          <MiniLink data-row-no-nav to={to}>
                            #{r.id}
                          </MiniLink>
                        </td>
                        <td className="px-4 py-2 text-sm">{createdAt}</td>
                        <td className="px-4 py-2">
                          {vpsIdRow ? (
                            <ChipLink data-row-no-nav to={`${basePath}/vps/${vpsIdRow}`} className="max-w-full">
                              {vpsHost || `#${vpsIdRow}`}
                            </ChipLink>
                          ) : (
                            '—'
                          )}
                        </td>

                        {mode === 'admin' ? (
                          <td className="px-4 py-2">
                            {userIdRow ? (
                              <ChipLink data-row-no-nav to={`${basePath}/users/${userIdRow}`} className="max-w-full">
                                {userLogin || `#${userIdRow}`}
                              </ChipLink>
                            ) : (
                              '—'
                            )}
                          </td>
                        ) : null}

                        <td className="px-4 py-2 break-words">{nodeName || '—'}</td>
                        <td className="px-4 py-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium leading-5" title={killed}>
                              {compactText(killed, 42)}
                            </div>
                            {r.cgroup ? (
                              <div
                                className="mt-1 max-w-full truncate font-mono text-xs leading-4 text-faint"
                                title={`${t('oom.field.cgroup')}: ${cgroupText}`}
                              >
                                {t('oom.field.cgroup')}: {cgroupShort}
                              </div>
                            ) : null}
                          </div>
                          {r.invoked_by_name || r.invoked_by_pid ? (
                            <div className="mt-1 break-words text-xs leading-4 text-faint">
                              {t('oom.field.invoked_by')}: {r.invoked_by_name ? String(r.invoked_by_name) : '—'}
                              {r.invoked_by_pid ? ` (${r.invoked_by_pid})` : ''}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant={ruleVariant(action)}>{t(ruleLabelKey(action))}</Badge>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{typeof r.count === 'number' ? r.count : '—'}</td>
                        <td className="px-2 py-2 text-right">
                          <span data-row-no-nav className="inline-flex max-w-full">
                            <Button
                              to={to}
                              variant="secondary"
                              size="sm"
                              className="max-w-full whitespace-nowrap"
                              testId={`oom.list.row.${r.id}.open`}
                            >
                              {t('oom.list.open_detail')}
                            </Button>
                          </span>
                        </td>
                      </TableRowLink>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="xl:hidden" data-testid="oom.list.cards">
            <div className="space-y-3">
              {rows.map((r: OomReport) => {
                const to = `${basePath}/oom-reports/${r.id}`;
                const createdAt = formatDateTime(r.created_at);

                const vpsIdRow = (r.vps as any)?.id ? Number((r.vps as any).id) : undefined;
                const vpsHost = (r.vps as any)?.hostname ? String((r.vps as any).hostname) : undefined;

                const userIdRow = (r.vps as any)?.user?.id ? Number((r.vps as any).user.id) : undefined;
                const userLogin = (r.vps as any)?.user?.login ? String((r.vps as any).user.login) : undefined;

                const nodeName = (r.vps as any)?.node?.domain_name ? String((r.vps as any).node.domain_name) : undefined;

                const action = (r.oom_report_rule as any)?.action ? String((r.oom_report_rule as any).action) : undefined;
                const rowVariant = ruleVariant(action);
                const dotVariant = dotVariantFromRowVariant(rowVariant);
                const killed = r.killed_name ? `${r.killed_name}${r.killed_pid ? ` (${r.killed_pid})` : ''}` : '';
                const cgroupText = r.cgroup ? String(r.cgroup) : '';

                return (
                  <div
                    key={r.id}
                    className="overflow-hidden rounded-lg border border-border bg-surface"
                    data-testid={`oom.list.card.${r.id}`}
                  >
                    <div className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <StatusDot variant={dotVariant} testId={`oom.list.card.${r.id}.dot`} />
                          <MiniLink to={to} className="font-mono text-sm">
                            #{r.id}
                          </MiniLink>
                          <span className="text-sm font-semibold text-text">{createdAt}</span>
                          <Badge variant={ruleVariant(action)}>{t(ruleLabelKey(action))}</Badge>
                        </div>

                        {killed ? (
                          <div className="mt-1 truncate text-sm font-medium text-text" title={killed}>
                            {compactText(killed, 54)}
                          </div>
                        ) : null}

                        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted">
                          {vpsIdRow ? (
                            <ChipLink to={`${basePath}/vps/${vpsIdRow}`}>{vpsHost || `#${vpsIdRow}`}</ChipLink>
                          ) : (
                            <span>{t('common.vps')}: —</span>
                          )}
                          {mode === 'admin' && userIdRow ? (
                            <ChipLink to={`${basePath}/users/${userIdRow}`}>{userLogin || `#${userIdRow}`}</ChipLink>
                          ) : null}
                          <span>{nodeName || '—'}</span>
                        </div>

                        {r.cgroup ? (
                          <div className="mt-1 min-w-0 truncate font-mono text-xs leading-5 text-muted" title={cgroupText}>
                            {compactText(cgroupText, 72)}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 sm:justify-end">
                        {typeof r.count === 'number' ? (
                          <span className="rounded-full border border-border bg-control px-2 py-1 font-mono text-xs text-muted">
                            {r.count}x
                          </span>
                        ) : null}
                        <Button
                          to={to}
                          variant="secondary"
                          size="sm"
                          className="whitespace-nowrap"
                          testId={`oom.list.card.${r.id}.open`}
                        >
                          {t('oom.list.open_detail')}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4">
            <KeysetPagination
              page={pagination.page}
              pageCount={pagination.stack.length}
              canPrev={pagination.canPrev}
              canNext={!pagination.hasForward && rows.length === pagination.limit}
              onPrev={() => pagination.goPrev()}
              onNext={() => pagination.goNext(rows[rows.length - 1]?.id)}
              onGoToPage={pagination.goToPage}
              limit={pagination.limit}
              allowedLimits={pagination.allowedLimits}
              onLimitChange={(l) => pagination.setLimit(l)}
              testId="oom.list.pagination"
            />
          </div>
        </>
      )}
    </ListShell>
  );
}
