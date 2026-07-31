import React from 'react';

import { useAuth } from '../../../app/auth';
import { useI18n } from '../../../app/i18n';
import { UserResourcePackagesPanel } from '../../../components/user/UserResourcePackagesPanel';
import { UserResourceUsagePanel } from '../../../components/user/UserResourceUsagePanel';
import { DetailShell } from '../../../components/layout/DetailShell';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageHeader } from '../../../components/layout/PageHeader';
import { ProfileTabs } from './ProfileTabs';

export function ProfileResourcesPage() {
  const auth = useAuth();
  const { t } = useI18n();
  const userId = auth.user?.id;

  return (
    <DetailShell testId="profile.resources.page">
      <PageHeader title={t('profile.resources.title')} description={t('profile.resources.subtitle')} />
      <ProfileTabs />
      {typeof userId === 'number' ? (
        <div className="space-y-8">
          <section aria-labelledby="profile-resources-packages-title" className="space-y-3">
            <div>
              <h2 id="profile-resources-packages-title" className="text-lg font-semibold">
                {t('profile.resources.packages.title')}
              </h2>
              <p className="mt-1 text-sm text-muted">{t('profile.resources.packages.subtitle')}</p>
            </div>
            <UserResourcePackagesPanel userId={userId} testIdPrefix="profile.resources.packages" />
          </section>

          <section aria-labelledby="profile-resources-usage-title" className="space-y-3">
            <div>
              <h2 id="profile-resources-usage-title" className="text-lg font-semibold">
                {t('profile.resources.usage.title')}
              </h2>
              <p className="mt-1 text-sm text-muted">{t('profile.resources.usage.subtitle')}</p>
            </div>
            <UserResourceUsagePanel userId={userId} testIdPrefix="profile.resources.usage" />
          </section>
        </div>
      ) : (
        <ErrorState title={t('profile.user.loading')} body={t('profile.resources.loading')} showStatusLink={false} />
      )}
    </DetailShell>
  );
}
