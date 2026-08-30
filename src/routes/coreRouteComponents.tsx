import { lazyRoute } from './lazyRoute';

export const AppShell = lazyRoute(() => import('../components/layout/AppShell'), 'AppShell');
export const OverviewPage = lazyRoute(() => import('../pages/public/OverviewPage'), 'OverviewPage');
export const OutagesPage = lazyRoute(() => import('../pages/public/OutagesPage'), 'OutagesPage');
export const OutageDetailPage = lazyRoute(() => import('../pages/public/OutageDetailPage'), 'OutageDetailPage');
export const NewsPage = lazyRoute(() => import('../pages/public/NewsPage'), 'NewsPage');
export const SecurityAdvisoriesPage = lazyRoute(
  () => import('../pages/public/SecurityAdvisoriesPage'),
  'SecurityAdvisoriesPage',
);
export const SecurityAdvisoryDetailPage = lazyRoute(
  () => import('../pages/public/SecurityAdvisoryDetailPage'),
  'SecurityAdvisoryDetailPage',
);
export const RegistrationCorrectionPage = lazyRoute(
  () => import('../pages/public/RegistrationCorrectionPage'),
  'RegistrationCorrectionPage',
);
export const DashboardPage = lazyRoute(() => import('../pages/app/DashboardPage'), 'DashboardPage');
export const VpsListPage = lazyRoute(() => import('../pages/app/VpsListPage'), 'VpsListPage');
export const TransactionChainsPage = lazyRoute(
  () => import('../pages/app/TransactionChainsPage'),
  'TransactionChainsPage',
);
export const TransactionChainDetailPage = lazyRoute(
  () => import('../pages/app/TransactionChainDetailPage'),
  'TransactionChainDetailPage',
);
export const TransactionsListPage = lazyRoute(
  () => import('../pages/app/TransactionsListPage'),
  'TransactionsListPage',
);
export const TransactionDetailPage = lazyRoute(
  () => import('../pages/app/TransactionDetailPage'),
  'TransactionDetailPage',
);
export const ActionStatesPage = lazyRoute(() => import('../pages/app/ActionStatesPage'), 'ActionStatesPage');
export const ActionStateDetailPage = lazyRoute(
  () => import('../pages/app/ActionStateDetailPage'),
  'ActionStateDetailPage',
);
export const MonitoringEventsPage = lazyRoute(
  () => import('../pages/app/MonitoringEventsPage'),
  'MonitoringEventsPage',
);
export const IncidentsPage = lazyRoute(() => import('../pages/app/incidents/IncidentsPage'), 'IncidentsPage');
export const IncidentReportDetailPage = lazyRoute(
  () => import('../pages/app/incidents/IncidentReportDetailPage'),
  'IncidentReportDetailPage',
);
export const IncidentReportNewPage = lazyRoute(
  () => import('../pages/app/admin/IncidentReportNewPage'),
  'IncidentReportNewPage',
);
export const OomReportsPage = lazyRoute(() => import('../pages/app/oom/OomReportsPage'), 'OomReportsPage');
export const OomReportLayout = lazyRoute(() => import('../pages/app/oom/OomReportLayout'), 'OomReportLayout');
export const OomReportOverviewPage = lazyRoute(
  () => import('../pages/app/oom/OomReportOverviewPage'),
  'OomReportOverviewPage',
);
export const OomReportStatsPage = lazyRoute(
  () => import('../pages/app/oom/OomReportStatsPage'),
  'OomReportStatsPage',
);
export const OomReportTasksPage = lazyRoute(
  () => import('../pages/app/oom/OomReportTasksPage'),
  'OomReportTasksPage',
);
export const OomReportRulesPage = lazyRoute(
  () => import('../pages/app/oom/OomReportRulesPage'),
  'OomReportRulesPage',
);
export const MonitoringEventDetailPage = lazyRoute(
  () => import('../pages/app/MonitoringEventDetailPage'),
  'MonitoringEventDetailPage',
);
export const VpsLayout = lazyRoute(() => import('../pages/app/vps/VpsLayoutRoute'), 'VpsLayoutRoute');
export const VpsCreatePage = lazyRoute(() => import('../pages/app/vps/VpsCreatePage'), 'VpsCreatePage');
export const VpsOverviewPage = lazyRoute(() => import('../pages/app/vps/VpsOverviewPage'), 'VpsOverviewPage');
export const VpsConfigurationPage = lazyRoute(
  () => import('../pages/app/vps/VpsConfigurationPage'),
  'VpsConfigurationPage',
);
export const VpsAccessPage = lazyRoute(() => import('../pages/app/vps/VpsAccessPage'), 'VpsAccessPage');
export const VpsConsolePage = lazyRoute(() => import('../pages/app/vps/VpsConsolePage'), 'VpsConsolePage');
export const VpsNetworkPage = lazyRoute(() => import('../pages/app/vps/VpsNetworkPage'), 'VpsNetworkPage');
export const UserNetworkPage = lazyRoute(
  () => import('../pages/app/networking/UserNetworkPage'),
  'UserNetworkPage',
);
export const VpsStoragePage = lazyRoute(() => import('../pages/app/vps/VpsStoragePage'), 'VpsStoragePage');
export const VpsFeaturesPage = lazyRoute(() => import('../pages/app/vps/VpsFeaturesPage'), 'VpsFeaturesPage');
export const VpsMaintenancePage = lazyRoute(
  () => import('../pages/app/vps/VpsMaintenancePage'),
  'VpsMaintenancePage',
);
export const VpsLifecyclePage = lazyRoute(() => import('../pages/app/vps/VpsLifecyclePage'), 'VpsLifecyclePage');
