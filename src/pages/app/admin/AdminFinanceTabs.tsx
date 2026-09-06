import React from 'react';

import { useAppMode } from '../../../app/appMode';
import { useAuth } from '../../../app/auth';
import { useI18n } from '../../../app/i18n';
import { TabsNav } from '../../../components/ui/TabsNav';
import { canViewGlobalFinance } from './FinanceGlobalAdminGate';

export function AdminFinanceTabs() {
  const { basePath } = useAppMode();
  const auth = useAuth();
  const { t } = useI18n();
  const canViewGlobal = canViewGlobalFinance(auth.role);

  return (
    <TabsNav
      testId="admin.finance.tabs"
      items={[
        ...(canViewGlobal ? [{
          to: `${basePath}/payments`,
          label: t('finance.tabs.overview'),
          end: true,
          testId: 'admin.finance.tabs.overview',
        }] : []),
        {
          to: `${basePath}/payments/incoming`,
          label: t('finance.tabs.incoming'),
          end: true,
          testId: 'admin.finance.tabs.incoming',
        },
        {
          to: `${basePath}/payments/forecast`,
          label: t('finance.tabs.forecast'),
          end: true,
          testId: 'admin.finance.tabs.forecast',
        },
      ]}
    />
  );
}
