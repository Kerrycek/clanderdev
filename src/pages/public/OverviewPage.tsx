import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { getRuntimeConfig } from '../../app/config';
import { useI18n } from '../../app/i18n';
import { StatusLandingMark } from '../../components/branding/StatusLandingMark';
import { Alert } from '../../components/ui/Alert';
import { fetchNews, fetchOutages, fetchPublicNodeStatus, fetchPublicStats } from '../../lib/api/public';
import { consumeSessionExpiredNotice } from '../../lib/auth/sessionExpiredNotice';
import {
  categorizePublicOutages,
  groupPublicNodesByLocation,
  publicIpv4BadgeVariant,
  publicIpv4Level,
  resolvePublicIpv4Left,
  summarizePublicNodes,
} from './OverviewModel';
import { OverviewNodesSection } from './OverviewNodesSection';
import { OverviewOutagesNewsCards } from './OverviewOutagesNewsCards';
import { OverviewSummaryCards } from './OverviewSummaryCards';
import { useDeferredOverviewQueries } from './useDeferredOverviewQueries';

export function OverviewPage() {
  const i18n = useI18n();
  const cfg = useMemo(() => getRuntimeConfig(), []);
  const deferredEnabled = useDeferredOverviewQueries();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showSessionExpired, setShowSessionExpired] = useState(false);
  const consumedExpiredParamRef = useRef(false);
  const hasSessionExpiredParam = searchParams.get('session') === 'expired';

  useEffect(() => {
    if (!hasSessionExpiredParam) {
      if (!consumedExpiredParamRef.current) {
        setShowSessionExpired(false);
      }
      return;
    }

    if (consumedExpiredParamRef.current) return;

    consumedExpiredParamRef.current = true;
    setShowSessionExpired(consumeSessionExpiredNotice());

    const nextParams = new URLSearchParams(location.search);
    nextParams.delete('session');
    navigate(
      {
        pathname: location.pathname,
        search: nextParams.toString() ? `?${nextParams.toString()}` : '',
        hash: location.hash,
      },
      { replace: true },
    );
  }, [hasSessionExpiredParam, location.hash, location.pathname, location.search, navigate]);

  const statsQ = useQuery({
    queryKey: ['cluster', 'public_stats'],
    queryFn: async () => (await fetchPublicStats()).data,
  });

  const nodesQ = useQuery({
    queryKey: ['nodes', 'public_status', { surface: 'overview' }],
    queryFn: async () => (await fetchPublicNodeStatus()).data,
    enabled: deferredEnabled,
  });

  const outagesQ = useQuery({
    queryKey: ['outages', 'index', { surface: 'overview', limit: 25 }],
    queryFn: async () => (await fetchOutages({ limit: 25 })).data,
    enabled: deferredEnabled,
  });

  const newsQ = useQuery({
    queryKey: ['news_logs', 'index', { surface: 'overview', limit: 5 }],
    queryFn: async () => (await fetchNews({ limit: 5 })).data,
    enabled: deferredEnabled,
  });

  const unknownLocationLabel = i18n.t('public.nodes.location_unknown');
  const outagesByCategory = useMemo(() => categorizePublicOutages(outagesQ.data ?? []), [outagesQ.data]);
  const nodesByLocation = useMemo(
    () => groupPublicNodesByLocation(nodesQ.data ?? [], unknownLocationLabel),
    [nodesQ.data, unknownLocationLabel]
  );
  const nodeSummary = useMemo(() => summarizePublicNodes(nodesByLocation), [nodesByLocation]);

  const ipv4Left = resolvePublicIpv4Left(statsQ.data);
  const ipv4State = publicIpv4Level(ipv4Left, cfg.publicStatus.ipv4Warn, cfg.publicStatus.ipv4Critical);
  const ipv4Badge = publicIpv4BadgeVariant(ipv4State, ipv4Left);
  const nodesLoading = !deferredEnabled || nodesQ.isLoading;
  const outagesLoading = !deferredEnabled || outagesQ.isLoading;
  const newsLoading = !deferredEnabled || newsQ.isLoading;

  return (
    <div className="space-y-6" data-testid="public.overview.page">
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <StatusLandingMark className="text-accent/80" title={i18n.t('public.overview.title')} />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{i18n.t('public.overview.title')}</h1>
          <p className="mt-1 text-sm text-muted">{i18n.t('public.overview.subtitle')}</p>
        </div>
      </div>

      {showSessionExpired ? (
        <Alert title={i18n.t('auth.session_expired.title')} variant="warn" testId="auth.session-expired.notice">
          {i18n.t('auth.session_expired.body')}
        </Alert>
      ) : null}

      {outagesQ.isSuccess && outagesByCategory.current.length > 0 ? (
        <Alert title={i18n.tc('public.overview.outage_alert.title', outagesByCategory.current.length)} variant="danger">
          {i18n.tc('public.overview.outage_alert.body', outagesByCategory.current.length)}
          <span className="ml-2">
            <Link to="/outages" className="underline">{i18n.t('public.overview.outage_alert.link')}</Link>
          </span>
        </Alert>
      ) : outagesQ.isSuccess ? (
        <Alert title={i18n.t('public.overview.nominal.title')} variant="info">
          {i18n.t('public.overview.nominal.body')}
        </Alert>
      ) : (
        <Alert title={i18n.t('public.overview.checking.title')} variant="info">
          {i18n.t('public.overview.checking.body')}
        </Alert>
      )}

      {ipv4State === 'critical' ? (
        <Alert title={i18n.t('public.overview.ipv4_critical.title')} variant="danger" testId="public.ipv4.alert">
          {i18n.t('public.overview.ipv4_critical.body', { count: ipv4Left ?? 0 })}
        </Alert>
      ) : null}

      <OverviewSummaryCards
        stats={statsQ.data}
        statsLoading={statsQ.isLoading}
        statsError={statsQ.isError}
        nodesLoading={nodesLoading}
        nodesError={nodesQ.isError}
        nodeSummary={nodeSummary}
        ipv4Left={ipv4Left}
        ipv4Level={ipv4State}
        ipv4BadgeVariant={ipv4Badge}
      />

      <OverviewOutagesNewsCards
        outages={outagesQ.data}
        outagesByCategory={outagesByCategory}
        outagesLoading={outagesLoading}
        outagesError={outagesQ.isError}
        news={newsQ.data}
        newsLoading={newsLoading}
        newsError={newsQ.isError}
      />

      <OverviewNodesSection groups={nodesByLocation} summary={nodeSummary} loading={nodesLoading} error={nodesQ.isError} />
    </div>
  );
}
