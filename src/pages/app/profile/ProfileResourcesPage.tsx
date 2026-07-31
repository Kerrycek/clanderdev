import React from 'react';

import { useAuth } from '../../../app/auth';
import { useI18n } from '../../../app/i18n';
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
        <UserResourceUsagePanel userId={userId} testIdPrefix="profile.resources.usage" />
      ) : (
        <ErrorState title={t('profile.user.loading')} body={t('profile.resources.loading')} showStatusLink={false} />
      )}
    </DetailShell>
  );
}
