import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import {
  advisoryCveLabels,
  fetchAllSecurityAdvisories,
  fetchSecurityAdvisoryCves,
  type SecurityAdvisory,
  type SecurityAdvisoryCve,
} from '../../lib/api/securityAdvisories';
import { useAuth } from '../../app/auth';
import { useI18n } from '../../app/i18n';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { KeysetPagination } from '../../components/ui/KeysetPagination';
import { Spinner } from '../../components/ui/Spinner';
import { formatDateTime } from '../../lib/time';
import { pickTranslation } from '../../lib/translations';
import { securityAdvisoryStateLabel } from '../../lib/apiValues';

const PUBLIC_SECURITY_ADVISORIES_API_PAGE_SIZE = 100;
const PUBLIC_SECURITY_ADVISORIES_PAGE_SIZE = 20;

function hasInlineCves(advisory: SecurityAdvisory): boolean {
  return Array.isArray(advisory.security_advisory_cves) || Array.isArray(advisory.cves);
}

function SecurityAdvisoryRow(props: { advisory: SecurityAdvisory; showPersonalImpact: boolean }) {
  const i18n = useI18n();
  const advisory = props.advisory;
  const cves = advisoryCveLabels(advisory);
  const summary = pickTranslation(advisory, 'summary', i18n.preferredLanguageCodes);
  const description = pickTranslation(advisory, 'description', i18n.preferredLanguageCodes);
  const title = advisory.name || i18n.t('public.security_advisories.fallback_title', { id: advisory.id });
  const state = String(advisory.state ?? '').trim();

  return (
    <Card>
      <CardHeader
        title={
          <Link className="hover:text-accent hover:underline" to={`/security-advisories/${advisory.id}`}>
            {title}
          </Link>
        }
        subtitle={`${i18n.t('public.security_advisories.published')}: ${formatDateTime(advisory.published_at)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {props.showPersonalImpact && typeof advisory.affected === 'boolean' ? (
              <Badge variant={advisory.affected ? 'danger' : 'neutral'}>
                {i18n.t(advisory.affected
                  ? 'dashboard.section.security.affects_me'
                  : 'dashboard.section.security.not_affected')}
              </Badge>
            ) : null}
            <Badge variant={state === 'published' ? 'ok' : state === 'retracted' ? 'warn' : 'neutral'}>
              {state ? securityAdvisoryStateLabel(i18n.t, state) : '—'}
            </Badge>
          </div>
        }
      />
      <CardBody>
        <div className="space-y-3">
          {cves.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {cves.map((cve) => (
                <Badge key={cve} variant="info">
                  {cve}
                </Badge>
              ))}
            </div>
          ) : null}

          {summary ? <p className="text-sm text-fg">{summary}</p> : null}
          {description && description !== summary ? <p className="text-sm text-muted">{description}</p> : null}

          <Link
            className="inline-flex text-sm font-medium text-accent hover:underline"
            to={`/security-advisories/${advisory.id}`}
          >
            {i18n.t('public.security_advisories.open_detail')} →
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}

export function SecurityAdvisoriesPage() {
  const i18n = useI18n();
  const auth = useAuth();
  const [page, setPage] = useState(1);
  const showPersonalImpact = auth.status === 'authenticated';
  const advisoriesQ = useQuery({
    queryKey: ['public', 'security_advisories', { states: ['published', 'retracted'] }],
    queryFn: async () => {
      const [published, retracted] = await Promise.all([
        fetchAllSecurityAdvisories({
          limit: PUBLIC_SECURITY_ADVISORIES_API_PAGE_SIZE,
          state: 'published',
          order: 'newest',
        }),
        fetchAllSecurityAdvisories({
          limit: PUBLIC_SECURITY_ADVISORIES_API_PAGE_SIZE,
          state: 'retracted',
          order: 'newest',
        }),
      ]);

      const publicRows = new Map<number, SecurityAdvisory>();
      for (const advisory of [...published.data, ...retracted.data]) {
        if (advisory.state !== 'published' && advisory.state !== 'retracted') continue;
        publicRows.set(advisory.id, advisory);
      }

      return [...publicRows.values()].sort((a, b) => {
        const at = new Date(a.published_at ?? a.updated_at ?? a.created_at ?? 0).getTime();
        const bt = new Date(b.published_at ?? b.updated_at ?? b.created_at ?? 0).getTime();
        if (at !== bt) return bt - at;
        return b.id - a.id;
      });
    },
  });

  const pageCount = Math.max(
    1,
    Math.ceil((advisoriesQ.data?.length ?? 0) / PUBLIC_SECURITY_ADVISORIES_PAGE_SIZE),
  );

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const visibleAdvisories = useMemo(() => {
    const start = (page - 1) * PUBLIC_SECURITY_ADVISORIES_PAGE_SIZE;
    return (advisoriesQ.data ?? []).slice(start, start + PUBLIC_SECURITY_ADVISORIES_PAGE_SIZE);
  }, [advisoriesQ.data, page]);

  const visibleAdvisoryIds = useMemo(
    () => visibleAdvisories.map((advisory) => advisory.id),
    [visibleAdvisories],
  );
  const visibleCvesQ = useQuery({
    queryKey: ['public', 'security_advisory_cves', visibleAdvisoryIds],
    enabled: visibleAdvisories.length > 0,
    queryFn: async () => {
      const rows = await Promise.all(visibleAdvisories.map(async (advisory) => {
        if (hasInlineCves(advisory)) {
          return [advisory.id, advisory.security_advisory_cves ?? advisory.cves ?? []] as const;
        }

        try {
          const result = await fetchSecurityAdvisoryCves({
            securityAdvisoryId: advisory.id,
            limit: PUBLIC_SECURITY_ADVISORIES_API_PAGE_SIZE,
          });
          return [advisory.id, result.data] as const;
        } catch {
          const noCves: Array<SecurityAdvisoryCve | string> = [];
          return [advisory.id, noCves] as const;
        }
      }));

      return new Map<number, Array<SecurityAdvisoryCve | string>>(rows);
    },
  });

  const renderedAdvisories = useMemo(() => visibleAdvisories.map((advisory) => {
    if (hasInlineCves(advisory)) return advisory;
    return { ...advisory, cves: visibleCvesQ.data?.get(advisory.id) ?? [] };
  }), [visibleAdvisories, visibleCvesQ.data]);

  return (
    <div className="space-y-6" data-testid="public.security_advisories.page">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{i18n.t('public.security_advisories.title')}</h1>
        <p className="text-sm text-muted">{i18n.t('public.security_advisories.subtitle')}</p>
      </div>

      {advisoriesQ.isLoading ? (
        <Spinner label={i18n.t('public.security_advisories.loading')} />
      ) : advisoriesQ.isError ? (
        <Alert title={i18n.t('public.security_advisories.error')} variant="danger" />
      ) : (advisoriesQ.data?.length ?? 0) === 0 ? (
        <Alert title={i18n.t('public.security_advisories.empty.title')} variant="info">
          {i18n.t('public.security_advisories.empty.body')}
        </Alert>
      ) : (
        <div className="space-y-4">
          {renderedAdvisories.map((advisory) => (
            <SecurityAdvisoryRow
              key={advisory.id}
              advisory={advisory}
              showPersonalImpact={showPersonalImpact}
            />
          ))}
          <KeysetPagination
            page={page}
            pageCount={pageCount}
            totalPagesKnown
            canPrev={page > 1}
            canNext={page < pageCount}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(pageCount, current + 1))}
            onGoToPage={setPage}
            testId="public.security_advisories.pagination"
          />
        </div>
      )}
    </div>
  );
}
