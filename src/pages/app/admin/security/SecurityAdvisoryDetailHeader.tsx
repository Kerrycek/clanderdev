import { Edit3, Plus, RotateCw, Send } from 'lucide-react';

import { useI18n } from '../../../../app/i18n';
import { PageHeader } from '../../../../components/layout/PageHeader';
import { Alert } from '../../../../components/ui/Alert';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { clsx } from '../../../../components/ui/clsx';
import type { SecurityAdvisory } from '../../../../lib/api/securityAdvisories';
import { securityAdvisoryStateLabel } from '../../../../lib/apiValues';
import { formatErrorMessage } from '../../../../lib/errors';
import type { PublishReadinessIssue } from './securityAdvisoryAdminModel';
import {
  DETAIL_TABS,
  detailTabTranslationKey,
  securityAdvisoryReadinessMessage,
  securityAdvisoryStateVariant,
  securityAdvisoryTitle,
  type DetailTab,
} from './securityAdvisoryDetailViewModel';

export function SecurityAdvisoryDetailHeader(props: {
  advisory: SecurityAdvisory;
  cveLabels: string[];
  state: string;
  activeTab: DetailTab;
  updateCount: number;
  canEditParent: boolean;
  canPostUpdate: boolean;
  languagesReady: boolean;
  cvesReady: boolean;
  readinessDataReady: boolean;
  readinessIssues: PublishReadinessIssue[];
  languagesError?: unknown;
  readinessError?: unknown;
  onEdit: () => void;
  onRebuild: () => void;
  onPublish: () => void;
  onPostUpdate: () => void;
  onTabChange: (tab: DetailTab) => void;
}) {
  const { t } = useI18n();

  return (
    <>
      <PageHeader
        title={securityAdvisoryTitle(props.advisory, t)}
        description={t('admin.security_advisories.detail.subtitle', { id: props.advisory.id })}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={securityAdvisoryStateVariant(props.state)}>
              {securityAdvisoryStateLabel(t, props.state)}
            </Badge>
            {props.cveLabels.map((cve) => (
              <a
                key={cve}
                href={`https://www.cve.org/CVERecord?id=${encodeURIComponent(cve)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Badge variant="info">{cve}</Badge>
              </a>
            ))}
          </div>
        }
        actions={
          <>
            <Button to="/admin/security-advisories" variant="ghost">{t('common.back_to_list')}</Button>
            {props.canEditParent ? (
              <Button
                variant="secondary"
                onClick={props.onEdit}
                disabled={!props.languagesReady || !props.cvesReady}
                disabledReason={
                  !props.languagesReady
                    ? t('admin.security_advisories.validation.languages_unavailable')
                    : !props.cvesReady
                      ? t('admin.security_advisories.validation.cves_unavailable')
                      : undefined
                }
                testId="admin.security_advisory.edit"
              >
                <Edit3 size={16} /> {t('common.edit')}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={props.onRebuild} testId="admin.security_advisory.rebuild">
              <RotateCw size={16} /> {t('admin.security_advisories.action.rebuild')}
            </Button>
            {props.canEditParent ? (
              <Button
                variant="primary"
                onClick={props.onPublish}
                disabled={!props.readinessDataReady || props.readinessIssues.length > 0}
                disabledReason={
                  !props.readinessDataReady
                    ? t('admin.security_advisories.readiness.data_unavailable')
                    : props.readinessIssues[0]
                      ? securityAdvisoryReadinessMessage(props.readinessIssues[0], t)
                      : undefined
                }
                testId="admin.security_advisory.publish"
              >
                <Send size={16} /> {t('admin.security_advisories.action.publish')}
              </Button>
            ) : props.canPostUpdate ? (
              <Button
                variant="primary"
                onClick={props.onPostUpdate}
                disabled={!props.languagesReady}
                disabledReason={!props.languagesReady ? t('admin.security_advisories.validation.languages_unavailable') : undefined}
                testId="admin.security_advisory.post_update"
              >
                <Plus size={16} /> {t('admin.security_advisories.action.post_update')}
              </Button>
            ) : null}
          </>
        }
      />

      <nav className="flex flex-wrap gap-2" aria-label={t('admin.security_advisories.detail.tabs')}>
        {DETAIL_TABS.map((tab) => (
          <button
            type="button"
            key={tab}
            onClick={() => props.onTabChange(tab)}
            className={clsx(
              'rounded-md px-3 py-2 text-sm font-medium transition',
              props.activeTab === tab
                ? 'bg-surface-2 text-fg ring-1 ring-border'
                : 'text-muted hover:bg-surface-2 hover:text-fg',
            )}
            data-testid={`admin.security_advisory.tab.${tab}`}
          >
            {t(detailTabTranslationKey(tab))}
            {tab === 'updates' && props.updateCount > 0 ? (
              <span className="ml-1 text-xs text-faint">{props.updateCount}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {props.languagesError ? (
        <Alert variant="danger" title={t('common.error')}>{formatErrorMessage(props.languagesError)}</Alert>
      ) : null}
      {props.readinessError ? (
        <Alert variant="danger" title={t('admin.security_advisories.readiness.data_unavailable')}>
          {formatErrorMessage(props.readinessError)}
        </Alert>
      ) : null}
    </>
  );
}
