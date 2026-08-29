import React from 'react';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { TabsNav } from '../../../components/ui/TabsNav';

export function AdminFinanceTabs() {
  const { basePath } = useAppMode();
  const { t } = useI18n();

  return (
    <TabsNav
      testId="admin.finance.tabs"
      items={[
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
