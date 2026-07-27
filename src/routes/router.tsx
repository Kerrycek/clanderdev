import React from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';

import { getRuntimeConfig } from '../app/config';

import { PublicLayout } from '../components/layout/PublicLayout';
import { RouteProvidersLayout } from './RouteProvidersLayout';
import { lazyRoute } from './lazyRoute';

import { ErrorPage } from '../pages/ErrorPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { RootErrorPage } from '../pages/RootErrorPage';

const AppShell = lazyRoute(() => import('../components/layout/AppShell'), 'AppShell');
const OverviewPage = lazyRoute(() => import('../pages/public/OverviewPage'), 'OverviewPage');
const OutagesPage = lazyRoute(() => import('../pages/public/OutagesPage'), 'OutagesPage');
const OutageDetailPage = lazyRoute(() => import('../pages/public/OutageDetailPage'), 'OutageDetailPage');
const NewsPage = lazyRoute(() => import('../pages/public/NewsPage'), 'NewsPage');
const SecurityAdvisoriesPage = lazyRoute(
  () => import('../pages/public/SecurityAdvisoriesPage'),
  'SecurityAdvisoriesPage',
);
const SecurityAdvisoryDetailPage = lazyRoute(
  () => import('../pages/public/SecurityAdvisoryDetailPage'),
  'SecurityAdvisoryDetailPage',
);
const RegistrationCorrectionPage = lazyRoute(() => import('../pages/public/RegistrationCorrectionPage'), 'RegistrationCorrectionPage');
const DashboardPage = lazyRoute(() => import('../pages/app/DashboardPage'), 'DashboardPage');
const VpsListPage = lazyRoute(() => import('../pages/app/VpsListPage'), 'VpsListPage');
const TransactionChainsPage = lazyRoute(() => import('../pages/app/TransactionChainsPage'), 'TransactionChainsPage');
const TransactionChainDetailPage = lazyRoute(() => import('../pages/app/TransactionChainDetailPage'), 'TransactionChainDetailPage');
const TransactionsListPage = lazyRoute(() => import('../pages/app/TransactionsListPage'), 'TransactionsListPage');
const TransactionDetailPage = lazyRoute(() => import('../pages/app/TransactionDetailPage'), 'TransactionDetailPage');
const ActionStatesPage = lazyRoute(() => import('../pages/app/ActionStatesPage'), 'ActionStatesPage');
const ActionStateDetailPage = lazyRoute(() => import('../pages/app/ActionStateDetailPage'), 'ActionStateDetailPage');
const MonitoringEventsPage = lazyRoute(() => import('../pages/app/MonitoringEventsPage'), 'MonitoringEventsPage');
const IncidentsPage = lazyRoute(() => import('../pages/app/incidents/IncidentsPage'), 'IncidentsPage');
const IncidentReportDetailPage = lazyRoute(() => import('../pages/app/incidents/IncidentReportDetailPage'), 'IncidentReportDetailPage');
const IncidentReportNewPage = lazyRoute(() => import('../pages/app/admin/IncidentReportNewPage'), 'IncidentReportNewPage');
const OomReportsPage = lazyRoute(() => import('../pages/app/oom/OomReportsPage'), 'OomReportsPage');
const OomReportLayout = lazyRoute(() => import('../pages/app/oom/OomReportLayout'), 'OomReportLayout');
const OomReportOverviewPage = lazyRoute(() => import('../pages/app/oom/OomReportOverviewPage'), 'OomReportOverviewPage');
const OomReportStatsPage = lazyRoute(() => import('../pages/app/oom/OomReportStatsPage'), 'OomReportStatsPage');
const OomReportTasksPage = lazyRoute(() => import('../pages/app/oom/OomReportTasksPage'), 'OomReportTasksPage');
const OomReportRulesPage = lazyRoute(() => import('../pages/app/oom/OomReportRulesPage'), 'OomReportRulesPage');
const MonitoringEventDetailPage = lazyRoute(() => import('../pages/app/MonitoringEventDetailPage'), 'MonitoringEventDetailPage');
const VpsLayout = lazyRoute(() => import('../pages/app/vps/VpsLayout'), 'VpsLayout');
const VpsCreatePage = lazyRoute(() => import('../pages/app/vps/VpsCreatePage'), 'VpsCreatePage');
const VpsOverviewPage = lazyRoute(() => import('../pages/app/vps/VpsOverviewPage'), 'VpsOverviewPage');
const VpsConfigurationPage = lazyRoute(() => import('../pages/app/vps/VpsConfigurationPage'), 'VpsConfigurationPage');
const VpsAccessPage = lazyRoute(() => import('../pages/app/vps/VpsAccessPage'), 'VpsAccessPage');
const VpsConsolePage = lazyRoute(() => import('../pages/app/vps/VpsConsolePage'), 'VpsConsolePage');
const VpsNetworkPage = lazyRoute(() => import('../pages/app/vps/VpsNetworkPage'), 'VpsNetworkPage');
const UserNetworkPage = lazyRoute(() => import('../pages/app/networking/UserNetworkPage'), 'UserNetworkPage');
const VpsStoragePage = lazyRoute(() => import('../pages/app/vps/VpsStoragePage'), 'VpsStoragePage');
const VpsFeaturesPage = lazyRoute(() => import('../pages/app/vps/VpsFeaturesPage'), 'VpsFeaturesPage');
const VpsMaintenancePage = lazyRoute(() => import('../pages/app/vps/VpsMaintenancePage'), 'VpsMaintenancePage');
const VpsLifecyclePage = lazyRoute(() => import('../pages/app/vps/VpsLifecyclePage'), 'VpsLifecyclePage');
const DatasetsListPage = lazyRoute(() => import('../pages/app/datasets/DatasetsListPage'), 'DatasetsListPage');
const DatasetLayout = lazyRoute(() => import('../pages/app/datasets/DatasetLayout'), 'DatasetLayout');
const DatasetOverviewPage = lazyRoute(() => import('../pages/app/datasets/DatasetOverviewPage'), 'DatasetOverviewPage');
const DatasetSnapshotsPage = lazyRoute(() => import('../pages/app/datasets/DatasetSnapshotsPage'), 'DatasetSnapshotsPage');
const DatasetDownloadsPage = lazyRoute(() => import('../pages/app/datasets/DatasetDownloadsPage'), 'DatasetDownloadsPage');
const DatasetPlansPage = lazyRoute(() => import('../pages/app/datasets/DatasetPlansPage'), 'DatasetPlansPage');
const DatasetExpansionPage = lazyRoute(() => import('../pages/app/datasets/DatasetExpansionPage'), 'DatasetExpansionPage');
const NasDatasetsPage = lazyRoute(() => import('../pages/app/datasets/NasDatasetsPage'), 'NasDatasetsPage');
const NasDatasetCreatePage = lazyRoute(() => import('../pages/app/datasets/NasDatasetCreatePage'), 'NasDatasetCreatePage');
const DatasetExportsPage = lazyRoute(() => import('../pages/app/exports/DatasetExportsPage'), 'DatasetExportsPage');
const ExportsListPage = lazyRoute(() => import('../pages/app/exports/ExportsListPage'), 'ExportsListPage');
const ExportDetailPage = lazyRoute(() => import('../pages/app/exports/ExportDetailPage'), 'ExportDetailPage');
const DnsZonesPage = lazyRoute(() => import('../pages/app/dns/DnsZonesPage'), 'DnsZonesPage');
const DnsZoneLayout = lazyRoute(() => import('../pages/app/dns/DnsZoneLayout'), 'DnsZoneLayout');
const DnsZoneRecordsPage = lazyRoute(() => import('../pages/app/dns/DnsZoneRecordsPage'), 'DnsZoneRecordsPage');
const DnsZoneSettingsPage = lazyRoute(() => import('../pages/app/dns/DnsZoneSettingsPage'), 'DnsZoneSettingsPage');
const DnsZoneLogsPage = lazyRoute(() => import('../pages/app/dns/DnsZoneLogsPage'), 'DnsZoneLogsPage');
const DnsZoneTransfersPage = lazyRoute(() => import('../pages/app/dns/DnsZoneTransfersPage'), 'DnsZoneTransfersPage');
const DnsZoneDnssecPage = lazyRoute(() => import('../pages/app/dns/DnsZoneDnssecPage'), 'DnsZoneDnssecPage');
const DnsZoneServersPage = lazyRoute(() => import('../pages/app/dns/DnsZoneServersPage'), 'DnsZoneServersPage');
const ProfilePage = lazyRoute(() => import('../pages/app/profile/ProfilePage'), 'ProfilePage');
const ProfileResourcesPage = lazyRoute(() => import('../pages/app/profile/ProfileResourcesPage'), 'ProfileResourcesPage');
const ProfileMailPage = lazyRoute(() => import('../pages/app/profile/ProfileMailPage'), 'ProfileMailPage');
const ProfileKeysPage = lazyRoute(() => import('../pages/app/profile/ProfileKeysPage'), 'ProfileKeysPage');
const ProfileSessionsPage = lazyRoute(() => import('../pages/app/profile/ProfileSessionsPage'), 'ProfileSessionsPage');
const ProfileMetricsPage = lazyRoute(() => import('../pages/app/profile/ProfileMetricsPage'), 'ProfileMetricsPage');
const ProfileSecurityPage = lazyRoute(() => import('../pages/app/profile/ProfileSecurityPage'), 'ProfileSecurityPage');
const ProfileMfaPage = lazyRoute(() => import('../pages/app/profile/ProfileMfaPage'), 'ProfileMfaPage');
const ProfileUserDataPage = lazyRoute(() => import('../pages/app/profile/ProfileUserDataPage'), 'ProfileUserDataPage');
const ProfileUserNamespacesLayout = lazyRoute(() => import('../pages/app/profile/userNamespaces/ProfileUserNamespacesLayout'), 'ProfileUserNamespacesLayout');
const ProfileUserNamespacesIndexPage = lazyRoute(() => import('../pages/app/profile/userNamespaces/ProfileUserNamespacesIndexPage'), 'ProfileUserNamespacesIndexPage');
const ProfileUserNamespacesNamespacesPage = lazyRoute(() => import('../pages/app/profile/userNamespaces/ProfileUserNamespacesNamespacesPage'), 'ProfileUserNamespacesNamespacesPage');
const ProfileUserNamespacesNamespaceDetailPage = lazyRoute(() => import('../pages/app/profile/userNamespaces/ProfileUserNamespacesNamespaceDetailPage'), 'ProfileUserNamespacesNamespaceDetailPage');
const ProfileUserNamespacesMapsPage = lazyRoute(() => import('../pages/app/profile/userNamespaces/ProfileUserNamespacesMapsPage'), 'ProfileUserNamespacesMapsPage');
const ProfileUserNamespacesMapDetailPage = lazyRoute(() => import('../pages/app/profile/userNamespaces/ProfileUserNamespacesMapDetailPage'), 'ProfileUserNamespacesMapDetailPage');
const PaymentsPage = lazyRoute(() => import('../pages/app/payments/PaymentsPage'), 'PaymentsPage');
const DesignSandboxPage = lazyRoute(() => import('../pages/app/DesignSandboxPage'), 'DesignSandboxPage');
const AdminInfoPage = lazyRoute(() => import('../pages/app/admin/AdminInfoPage'), 'AdminInfoPage');
const AdminOutagesPage = lazyRoute(() => import('../pages/app/admin/AdminOutagesPage'), 'AdminOutagesPage');
const AdminSecurityAdvisoriesPage = lazyRoute(
  () => import('../pages/app/admin/security/AdminSecurityAdvisoriesPage'),
  'AdminSecurityAdvisoriesPage',
);
const AdminSecurityAdvisoryDetailPage = lazyRoute(
  () => import('../pages/app/admin/security/AdminSecurityAdvisoryDetailPage'),
  'AdminSecurityAdvisoryDetailPage',
);
const SecurityAdvisoryAdminGate = lazyRoute(
  () => import('../pages/app/admin/security/SecurityAdvisoryAdminGate'),
  'SecurityAdvisoryAdminGate',
);
const NodesPage = lazyRoute(() => import('../pages/app/admin/NodesPage'), 'NodesPage');
const NodeDetailPage = lazyRoute(() => import('../pages/app/admin/NodeDetailPage'), 'NodeDetailPage');
const MigrationPlansPage = lazyRoute(() => import('../pages/app/admin/MigrationPlansPage'), 'MigrationPlansPage');
const MigrationPlanDetailPage = lazyRoute(() => import('../pages/app/admin/MigrationPlanDetailPage'), 'MigrationPlanDetailPage');
const UsersPage = lazyRoute(() => import('../pages/app/admin/UsersPage'), 'UsersPage');
const AdminUserLayout = lazyRoute(() => import('../pages/app/admin/user/AdminUserLayout'), 'AdminUserLayout');
const AdminUserMailPage = lazyRoute(() => import('../pages/app/admin/user/AdminUserMailPage'), 'AdminUserMailPage');
const AdminUserPaymentsPage = lazyRoute(() => import('../pages/app/admin/user/AdminUserPaymentsPage'), 'AdminUserPaymentsPage');
const AdminUserHistoryPage = lazyRoute(() => import('../pages/app/admin/user/AdminUserHistoryPage'), 'AdminUserHistoryPage');
const AdminUserKeysPage = lazyRoute(() => import('../pages/app/admin/user/AdminUserKeysPage'), 'AdminUserKeysPage');
const AdminUserSessionsPage = lazyRoute(() => import('../pages/app/admin/user/AdminUserSessionsPage'), 'AdminUserSessionsPage');
const AdminUserMetricsPage = lazyRoute(() => import('../pages/app/admin/user/AdminUserMetricsPage'), 'AdminUserMetricsPage');
const AdminUserSecurityPage = lazyRoute(() => import('../pages/app/admin/user/AdminUserSecurityPage'), 'AdminUserSecurityPage');
const AdminUserMfaPage = lazyRoute(() => import('../pages/app/admin/user/AdminUserMfaPage'), 'AdminUserMfaPage');
const AdminUserOverviewPage = lazyRoute(() => import('../pages/app/admin/user/AdminUserOverviewPage'), 'AdminUserOverviewPage');
const AdminUserResourcesPage = lazyRoute(() => import('../pages/app/admin/user/AdminUserResourcesPage'), 'AdminUserResourcesPage');
const AdminUserResourceUsagePage = lazyRoute(() => import('../pages/app/admin/user/AdminUserResourceUsagePage'), 'AdminUserResourceUsagePage');
const AdminUserEnvironmentConfigsPage = lazyRoute(() => import('../pages/app/admin/user/AdminUserEnvironmentConfigsPage'), 'AdminUserEnvironmentConfigsPage');
const AdminUserUserDataPage = lazyRoute(() => import('../pages/app/admin/user/AdminUserUserDataPage'), 'AdminUserUserDataPage');
const IpAddressesPage = lazyRoute(() => import('../pages/app/admin/IpAddressesPage'), 'IpAddressesPage');
const IpAddressDetailPage = lazyRoute(() => import('../pages/app/admin/IpAddressDetailPage'), 'IpAddressDetailPage');
const AdminNetworkingLayout = lazyRoute(() => import('../pages/app/admin/networking/AdminNetworkingLayout'), 'AdminNetworkingLayout');
const HostIpAddressesPage = lazyRoute(() => import('../pages/app/admin/networking/HostIpAddressesPage'), 'HostIpAddressesPage');
const IpAssignmentsPage = lazyRoute(() => import('../pages/app/admin/networking/IpAssignmentsPage'), 'IpAssignmentsPage');
const NetworkLivePage = lazyRoute(() => import('../pages/app/admin/networking/NetworkLivePage'), 'NetworkLivePage');
const NetworkTrafficUsersPage = lazyRoute(() => import('../pages/app/admin/networking/NetworkTrafficUsersPage'), 'NetworkTrafficUsersPage');
const RequestsPage = lazyRoute(() => import('../pages/app/admin/RequestsPage'), 'RequestsPage');
const RequestDetailPage = lazyRoute(() => import('../pages/app/admin/RequestDetailPage'), 'RequestDetailPage');
const IncomingPaymentsPage = lazyRoute(() => import('../pages/app/admin/IncomingPaymentsPage'), 'IncomingPaymentsPage');
const IncomingPaymentDetailPage = lazyRoute(() => import('../pages/app/admin/IncomingPaymentDetailPage'), 'IncomingPaymentDetailPage');
const MailLogsPage = lazyRoute(() => import('../pages/app/admin/mailer/MailLogsPage'), 'MailLogsPage');
const MailTemplatesPage = lazyRoute(() => import('../pages/app/admin/mailer/MailTemplatesPage'), 'MailTemplatesPage');
const MailTemplateDetailPage = lazyRoute(() => import('../pages/app/admin/mailer/MailTemplateDetailPage'), 'MailTemplateDetailPage');
const MailTemplateTranslationPage = lazyRoute(() => import('../pages/app/admin/mailer/MailTemplateTranslationPage'), 'MailTemplateTranslationPage');
const MailboxesPage = lazyRoute(() => import('../pages/app/admin/mailer/MailboxesPage'), 'MailboxesPage');
const MailboxDetailPage = lazyRoute(() => import('../pages/app/admin/mailer/MailboxDetailPage'), 'MailboxDetailPage');
const MailRecipientsPage = lazyRoute(() => import('../pages/app/admin/mailer/MailRecipientsPage'), 'MailRecipientsPage');
const MailLogDetailPage = lazyRoute(() => import('../pages/app/admin/mailer/MailLogDetailPage'), 'MailLogDetailPage');
const AuditPage = lazyRoute(() => import('../pages/app/admin/AuditPage'), 'AuditPage');
const AuditEventPage = lazyRoute(() => import('../pages/app/admin/AuditEventPage'), 'AuditEventPage');
const AdminContentLayout = lazyRoute(() => import('../pages/app/admin/content/AdminContentLayout'), 'AdminContentLayout');
const AdminClusterLayout = lazyRoute(() => import('../pages/app/admin/cluster/AdminClusterLayout'), 'AdminClusterLayout');
const ClusterSummaryPage = lazyRoute(() => import('../pages/app/admin/cluster/ClusterSummaryPage'), 'ClusterSummaryPage');
const EnvironmentsPage = lazyRoute(() => import('../pages/app/admin/cluster/EnvironmentsPage'), 'EnvironmentsPage');
const LocationsPage = lazyRoute(() => import('../pages/app/admin/cluster/LocationsPage'), 'LocationsPage');
const OsTemplatesPage = lazyRoute(() => import('../pages/app/admin/cluster/OsTemplatesPage'), 'OsTemplatesPage');
const NetworksPage = lazyRoute(() => import('../pages/app/admin/cluster/NetworksPage'), 'NetworksPage');
const NetworkDetailPage = lazyRoute(() => import('../pages/app/admin/cluster/NetworkDetailPage'), 'NetworkDetailPage');
const ResourcePackagesPage = lazyRoute(() => import('../pages/app/admin/cluster/ResourcePackagesPage'), 'ResourcePackagesPage');
const ResourcePackageDetailPage = lazyRoute(() => import('../pages/app/admin/cluster/ResourcePackageDetailPage'), 'ResourcePackageDetailPage');
const SystemConfigPage = lazyRoute(() => import('../pages/app/admin/cluster/SystemConfigPage'), 'SystemConfigPage');
const DnsResolversPage = lazyRoute(() => import('../pages/app/admin/cluster/DnsResolversPage'), 'DnsResolversPage');
const DnsServersPage = lazyRoute(() => import('../pages/app/admin/cluster/DnsServersPage'), 'DnsServersPage');
const DnsTsigKeysPage = lazyRoute(() => import('../pages/app/admin/cluster/DnsTsigKeysPage'), 'DnsTsigKeysPage');
const AdminNewsPage = lazyRoute(() => import('../pages/app/admin/content/AdminNewsPage'), 'AdminNewsPage');
const AdminHelpBoxesPage = lazyRoute(() => import('../pages/app/admin/content/AdminHelpBoxesPage'), 'AdminHelpBoxesPage');
const AdminUserNamespacesLayout = lazyRoute(() => import('../pages/app/admin/userNamespaces/AdminUserNamespacesLayout'), 'AdminUserNamespacesLayout');
const AdminUserNamespacesIndexPage = lazyRoute(() => import('../pages/app/admin/userNamespaces/AdminUserNamespacesIndexPage'), 'AdminUserNamespacesIndexPage');
const AdminUserNamespacesNamespacesPage = lazyRoute(() => import('../pages/app/admin/userNamespaces/AdminUserNamespacesNamespacesPage'), 'AdminUserNamespacesNamespacesPage');
const AdminUserNamespacesNamespaceDetailPage = lazyRoute(() => import('../pages/app/admin/userNamespaces/AdminUserNamespacesNamespaceDetailPage'), 'AdminUserNamespacesNamespaceDetailPage');
const AdminUserNamespacesMapsPage = lazyRoute(() => import('../pages/app/admin/userNamespaces/AdminUserNamespacesMapsPage'), 'AdminUserNamespacesMapsPage');
const AdminUserNamespacesMapDetailPage = lazyRoute(() => import('../pages/app/admin/userNamespaces/AdminUserNamespacesMapDetailPage'), 'AdminUserNamespacesMapDetailPage');
const OAuthLoginPage = lazyRoute(() => import('../pages/oauth/OAuthLoginPage'), 'OAuthLoginPage');
const OAuthCallbackPage = lazyRoute(() => import('../pages/oauth/OAuthCallbackPage'), 'OAuthCallbackPage');
const OAuthLogoutPage = lazyRoute(() => import('../pages/oauth/OAuthLogoutPage'), 'OAuthLogoutPage');

export const router = createBrowserRouter([
  {
    id: 'root',
    element: <RouteProvidersLayout />,
    errorElement: <RootErrorPage />,
    children: [
        {
          path: '/oauth/login',
          element: <OAuthLoginPage />,
          errorElement: <ErrorPage />,
        },
        {
          path: '/oauth/callback',
          element: <OAuthCallbackPage />,
          errorElement: <ErrorPage />,
        },
        {
          path: '/oauth/logout',
          element: <OAuthLogoutPage />,
          errorElement: <ErrorPage />,
        },
        {
          path: '/',
          element: <PublicLayout />,
          errorElement: <ErrorPage />,
          children: [
            { index: true, element: <OverviewPage /> },
            { path: 'outages', element: <OutagesPage /> },
            { path: 'outages/:outageId', element: <OutageDetailPage /> },
            { path: 'news', element: <NewsPage /> },
            { path: 'security-advisories', element: <SecurityAdvisoriesPage /> },
            { path: 'security-advisories/:advisoryId', element: <SecurityAdvisoryDetailPage /> },
            { path: 'requests/registrations/:requestId/:token', element: <RegistrationCorrectionPage /> },
            { path: '*', element: <NotFoundPage /> },
            // The old webui has a useful index page. We keep public status pages accessible.
          ],
        },
        {
          path: '/app',
          element: <AppShell mode="user" />,
          errorElement: <ErrorPage />,
          children: [
            { index: true, element: <DashboardPage /> },
            { path: 'vps', element: <VpsListPage /> },
            { path: 'vps/new', element: <VpsCreatePage /> },
            {
              path: 'vps/:vpsId',
              element: <VpsLayout />,
              children: [
                { index: true, element: <VpsOverviewPage /> },
                { path: 'config', element: <VpsConfigurationPage /> },
                { path: 'access', element: <VpsAccessPage /> },
                { path: 'network', element: <VpsNetworkPage /> },
                { path: 'storage', element: <VpsStoragePage /> },
                { path: 'features', element: <VpsFeaturesPage /> },
                { path: 'maintenance', element: <VpsMaintenancePage /> },
                { path: 'lifecycle', element: <VpsLifecyclePage /> },
                { path: 'lifecycle/:lifecycleAction', element: <VpsLifecyclePage /> },
                { path: 'console', element: <VpsConsolePage /> },
              ],
            },
            { path: 'datasets', element: <DatasetsListPage /> },
            { path: 'nas', element: <NasDatasetsPage /> },
            { path: 'nas/new', element: <NasDatasetCreatePage /> },
            { path: 'exports', element: <ExportsListPage /> },
            { path: 'exports/:exportId', element: <ExportDetailPage /> },
            {
              path: 'datasets/:datasetId',
              element: <DatasetLayout />,
              children: [
                { index: true, element: <DatasetOverviewPage /> },
                { path: 'snapshots', element: <DatasetSnapshotsPage /> },
                { path: 'downloads', element: <DatasetDownloadsPage /> },
                { path: 'exports', element: <DatasetExportsPage /> },
                { path: 'plans', element: <DatasetPlansPage /> },
                { path: 'expansion', element: <DatasetExpansionPage /> },
              ],
            },
            {
              path: 'nas/:datasetId',
              element: <DatasetLayout />,
              children: [
                { index: true, element: <DatasetOverviewPage /> },
                { path: 'snapshots', element: <DatasetSnapshotsPage /> },
                { path: 'downloads', element: <DatasetDownloadsPage /> },
                { path: 'exports', element: <DatasetExportsPage /> },
                { path: 'plans', element: <DatasetPlansPage /> },
                { path: 'expansion', element: <DatasetExpansionPage /> },
              ],
            },
            { path: 'dns', element: <DnsZonesPage /> },
            { path: 'networking', element: <UserNetworkPage /> },
            {
              path: 'dns/zones/:zoneId',
              element: <DnsZoneLayout />,
              children: [
                { index: true, element: <DnsZoneRecordsPage /> },
                { path: 'transfers', element: <DnsZoneTransfersPage /> },
                { path: 'dnssec', element: <DnsZoneDnssecPage /> },
                { path: 'servers', element: <DnsZoneServersPage /> },
                { path: 'settings', element: <DnsZoneSettingsPage /> },
                { path: 'logs', element: <DnsZoneLogsPage /> },
              ],
            },
            { path: 'transactions', element: <TransactionChainsPage /> },
            { path: 'transactions/items', element: <TransactionsListPage /> },
            { path: 'transactions/items/:transactionId', element: <TransactionDetailPage /> },
            { path: 'transactions/:chainId', element: <TransactionChainDetailPage /> },
            { path: 'action-states', element: <ActionStatesPage /> },
            { path: 'action-states/:actionStateId', element: <ActionStateDetailPage /> },
            { path: 'action_states', element: <Navigate to="../action-states" replace /> },
            { path: 'action_states/:actionStateId', element: <ActionStateDetailPage /> },
            { path: 'monitoring', element: <MonitoringEventsPage /> },
            { path: 'monitoring/:eventId', element: <MonitoringEventDetailPage /> },
            { path: 'incidents', element: <IncidentsPage /> },
            { path: 'incidents/:incidentId', element: <IncidentReportDetailPage /> },
            { path: 'oom-reports', element: <OomReportsPage /> },
            { path: 'oom-reports/rules/:vpsId', element: <OomReportRulesPage /> },
            {
              path: 'oom-reports/:oomReportId',
              element: <OomReportLayout />,
              children: [
                { index: true, element: <OomReportOverviewPage /> },
                { path: 'stats', element: <OomReportStatsPage /> },
                { path: 'tasks', element: <OomReportTasksPage /> },
              ],
            },
            { path: 'payments', element: <PaymentsPage /> },
            { path: 'requests', element: <RequestsPage /> },
            { path: 'requests/:type/:requestId', element: <RequestDetailPage /> },
            { path: 'profile', element: <ProfilePage /> },
            { path: 'profile/resources', element: <ProfileResourcesPage /> },
            { path: 'profile/security', element: <ProfileSecurityPage /> },
            { path: 'profile/mfa', element: <ProfileMfaPage /> },
            { path: 'profile/mail', element: <ProfileMailPage /> },
            { path: 'profile/keys', element: <ProfileKeysPage /> },
            { path: 'profile/sessions', element: <ProfileSessionsPage /> },
            { path: 'profile/metrics', element: <ProfileMetricsPage /> },
            { path: 'profile/user-data', element: <ProfileUserDataPage /> },
            {
              path: 'profile/user-namespaces',
              element: <ProfileUserNamespacesLayout />,
              children: [
                { index: true, element: <ProfileUserNamespacesIndexPage /> },
                { path: 'namespaces', element: <ProfileUserNamespacesNamespacesPage /> },
                { path: 'namespaces/:id', element: <ProfileUserNamespacesNamespaceDetailPage /> },
                { path: 'maps', element: <ProfileUserNamespacesMapsPage /> },
                { path: 'maps/:mapId', element: <ProfileUserNamespacesMapDetailPage /> },
              ],
            },
            { path: '_design', element: <DesignSandboxPage /> },
            { path: '*', element: <NotFoundPage appBasePath="/app" /> },
          ],
        },
        {
          path: '/admin',
          element: <AppShell mode="admin" />,
          errorElement: <ErrorPage />,
          children: [
            { index: true, element: <DashboardPage /> },
            { path: 'outages', element: <AdminOutagesPage /> },
            { path: 'outages/:outageId', element: <AdminOutagesPage /> },
            {
              element: <SecurityAdvisoryAdminGate />,
              children: [
                { path: 'security-advisories', element: <AdminSecurityAdvisoriesPage /> },
                { path: 'security-advisories/:advisoryId', element: <AdminSecurityAdvisoryDetailPage /> },
              ],
            },
            { path: 'nodes', element: <NodesPage /> },
            { path: 'nodes/:nodeId', element: <NodeDetailPage /> },
            { path: 'migration-plans', element: <MigrationPlansPage /> },
            { path: 'migration-plans/:planId', element: <MigrationPlanDetailPage /> },
            { path: 'admin-info', element: <AdminInfoPage /> },
            {
              path: 'user-namespaces',
              element: <AdminUserNamespacesLayout />,
              children: [
                { index: true, element: <AdminUserNamespacesIndexPage /> },
                { path: 'namespaces', element: <AdminUserNamespacesNamespacesPage /> },
                { path: 'namespaces/:id', element: <AdminUserNamespacesNamespaceDetailPage /> },
                { path: 'maps', element: <AdminUserNamespacesMapsPage /> },
                { path: 'maps/:mapId', element: <AdminUserNamespacesMapDetailPage /> },
              ],
            },
            {
              path: 'cluster',
              element: <AdminClusterLayout />,
              children: [
                { index: true, element: <Navigate to="summary" replace /> },
                { path: 'summary', element: <ClusterSummaryPage /> },
                { path: 'environments', element: <EnvironmentsPage /> },
                { path: 'locations', element: <LocationsPage /> },
                { path: 'os-templates', element: <OsTemplatesPage /> },
                { path: 'networks', element: <NetworksPage /> },
                { path: 'networks/:networkId', element: <NetworkDetailPage /> },
                { path: 'resource-packages', element: <ResourcePackagesPage /> },
                { path: 'resource-packages/:packageId', element: <ResourcePackageDetailPage /> },
                { path: 'system-config', element: <SystemConfigPage /> },
                { path: 'dns-resolvers', element: <DnsResolversPage /> },
                { path: 'dns-servers', element: <DnsServersPage /> },
                { path: 'dns-tsig-keys', element: <DnsTsigKeysPage /> },
              ],
            },
            { path: 'users', element: <UsersPage /> },
            {
              path: 'users/:userId',
              element: <AdminUserLayout />,
              children: [
                { index: true, element: <AdminUserOverviewPage /> },
                { path: 'resources', element: <AdminUserResourcesPage /> },
                { path: 'resources/usage', element: <AdminUserResourceUsagePage /> },
                { path: 'payments', element: <AdminUserPaymentsPage /> },
                { path: 'environment-configs', element: <AdminUserEnvironmentConfigsPage /> },
                { path: 'security', element: <AdminUserSecurityPage /> },
                { path: 'mfa', element: <AdminUserMfaPage /> },
                { path: 'sessions', element: <AdminUserSessionsPage /> },
                { path: 'keys', element: <AdminUserKeysPage /> },
                { path: 'metrics', element: <AdminUserMetricsPage /> },
                { path: 'mail', element: <AdminUserMailPage /> },
                { path: 'user-data', element: <AdminUserUserDataPage /> },
                { path: 'history', element: <AdminUserHistoryPage /> },
              ],
            },
            {
              path: 'networking',
              element: <AdminNetworkingLayout />,
              children: [
                { index: true, element: <Navigate to="ip-addresses" replace /> },
                { path: 'ip-addresses', element: <IpAddressesPage /> },
                { path: 'ip-addresses/:ipAddressId', element: <IpAddressDetailPage /> },
                { path: 'host-ip-addresses', element: <HostIpAddressesPage /> },
                { path: 'ip-address-assignments', element: <IpAssignmentsPage /> },
                { path: 'live', element: <NetworkLivePage /> },
                { path: 'traffic-users', element: <NetworkTrafficUsersPage /> },
              ],
            },
            { path: 'ip-addresses', element: <IpAddressesPage /> },
            { path: 'ip-addresses/:ipAddressId', element: <IpAddressDetailPage /> },
            { path: 'vps', element: <VpsListPage /> },
            { path: 'vps/new', element: <VpsCreatePage /> },
            {
              path: 'vps/:vpsId',
              element: <VpsLayout />,
              children: [
                { index: true, element: <VpsOverviewPage /> },
                { path: 'config', element: <VpsConfigurationPage /> },
                { path: 'access', element: <VpsAccessPage /> },
                { path: 'network', element: <VpsNetworkPage /> },
                { path: 'storage', element: <VpsStoragePage /> },
                { path: 'features', element: <VpsFeaturesPage /> },
                { path: 'maintenance', element: <VpsMaintenancePage /> },
                { path: 'lifecycle', element: <VpsLifecyclePage /> },
                { path: 'lifecycle/:lifecycleAction', element: <VpsLifecyclePage /> },
                { path: 'console', element: <VpsConsolePage /> },
              ],
            },
            { path: 'datasets', element: <DatasetsListPage /> },
            { path: 'nas', element: <NasDatasetsPage /> },
            { path: 'nas/new', element: <NasDatasetCreatePage /> },
            { path: 'exports', element: <ExportsListPage /> },
            { path: 'exports/:exportId', element: <ExportDetailPage /> },
            {
              path: 'datasets/:datasetId',
              element: <DatasetLayout />,
              children: [
                { index: true, element: <DatasetOverviewPage /> },
                { path: 'snapshots', element: <DatasetSnapshotsPage /> },
                { path: 'downloads', element: <DatasetDownloadsPage /> },
                { path: 'exports', element: <DatasetExportsPage /> },
                { path: 'plans', element: <DatasetPlansPage /> },
                { path: 'expansion', element: <DatasetExpansionPage /> },
              ],
            },
            {
              path: 'nas/:datasetId',
              element: <DatasetLayout />,
              children: [
                { index: true, element: <DatasetOverviewPage /> },
                { path: 'snapshots', element: <DatasetSnapshotsPage /> },
                { path: 'downloads', element: <DatasetDownloadsPage /> },
                { path: 'exports', element: <DatasetExportsPage /> },
                { path: 'plans', element: <DatasetPlansPage /> },
                { path: 'expansion', element: <DatasetExpansionPage /> },
              ],
            },
            { path: 'dns', element: <DnsZonesPage /> },
            { path: 'dns/tsig-keys', element: <DnsTsigKeysPage /> },
            {
              path: 'dns/zones/:zoneId',
              element: <DnsZoneLayout />,
              children: [
                { index: true, element: <DnsZoneRecordsPage /> },
                { path: 'transfers', element: <DnsZoneTransfersPage /> },
                { path: 'dnssec', element: <DnsZoneDnssecPage /> },
                { path: 'servers', element: <DnsZoneServersPage /> },
                { path: 'settings', element: <DnsZoneSettingsPage /> },
                { path: 'logs', element: <DnsZoneLogsPage /> },
              ],
            },
            { path: 'transactions', element: <TransactionChainsPage /> },
            { path: 'transactions/items', element: <TransactionsListPage /> },
            { path: 'transactions/items/:transactionId', element: <TransactionDetailPage /> },
            { path: 'transactions/:chainId', element: <TransactionChainDetailPage /> },
            { path: 'action-states', element: <ActionStatesPage /> },
            { path: 'action-states/:actionStateId', element: <ActionStateDetailPage /> },
            { path: 'action_states', element: <Navigate to="../action-states" replace /> },
            { path: 'action_states/:actionStateId', element: <ActionStateDetailPage /> },
            { path: 'monitoring', element: <MonitoringEventsPage /> },
            { path: 'monitoring/:eventId', element: <MonitoringEventDetailPage /> },
            { path: 'incidents', element: <IncidentsPage /> },
            { path: 'incidents/new', element: <IncidentReportNewPage /> },
            { path: 'incidents/:incidentId', element: <IncidentReportDetailPage /> },
            { path: 'oom-reports', element: <OomReportsPage /> },
            { path: 'oom-reports/rules/:vpsId', element: <OomReportRulesPage /> },
            {
              path: 'oom-reports/:oomReportId',
              element: <OomReportLayout />,
              children: [
                { index: true, element: <OomReportOverviewPage /> },
                { path: 'stats', element: <OomReportStatsPage /> },
                { path: 'tasks', element: <OomReportTasksPage /> },
              ],
            },
            { path: 'mailer/templates', element: <MailTemplatesPage /> },
            { path: 'mailer/templates/:mailTemplateId', element: <MailTemplateDetailPage /> },
            { path: 'mailer/templates/:mailTemplateId/translations/:translationId', element: <MailTemplateTranslationPage /> },
            { path: 'mailer/mailboxes', element: <MailboxesPage /> },
            { path: 'mailer/mailboxes/:mailboxId', element: <MailboxDetailPage /> },
            { path: 'mailer/recipients', element: <MailRecipientsPage /> },
            { path: 'mailer/log', element: <MailLogsPage /> },
            { path: 'mailer/log/:mailLogId', element: <MailLogDetailPage /> },
            {
              path: 'content',
              element: <AdminContentLayout />,
              children: [
                { index: true, element: <Navigate to="news" replace /> },
                { path: 'news', element: <AdminNewsPage /> },
                { path: 'help-boxes', element: <AdminHelpBoxesPage /> },
              ],
            },
            { path: 'audit', element: <AuditPage /> },
            { path: 'audit/:historyId', element: <AuditEventPage /> },
            { path: 'requests', element: <RequestsPage /> },
            { path: 'requests/:type/:requestId', element: <RequestDetailPage /> },
            { path: 'payments/incoming', element: <IncomingPaymentsPage /> },
            { path: 'payments/incoming/:paymentId', element: <IncomingPaymentDetailPage /> },
            { path: 'profile', element: <ProfilePage /> },
            { path: 'profile/resources', element: <ProfileResourcesPage /> },
            { path: 'profile/security', element: <ProfileSecurityPage /> },
            { path: 'profile/mfa', element: <ProfileMfaPage /> },
            { path: 'profile/mail', element: <ProfileMailPage /> },
            { path: 'profile/keys', element: <ProfileKeysPage /> },
            { path: 'profile/sessions', element: <ProfileSessionsPage /> },
            { path: 'profile/metrics', element: <ProfileMetricsPage /> },
            { path: 'profile/user-data', element: <ProfileUserDataPage /> },
            {
              path: 'profile/user-namespaces',
              element: <ProfileUserNamespacesLayout />,
              children: [
                { index: true, element: <ProfileUserNamespacesIndexPage /> },
                { path: 'namespaces', element: <ProfileUserNamespacesNamespacesPage /> },
                { path: 'namespaces/:id', element: <ProfileUserNamespacesNamespaceDetailPage /> },
                { path: 'maps', element: <ProfileUserNamespacesMapsPage /> },
                { path: 'maps/:mapId', element: <ProfileUserNamespacesMapDetailPage /> },
              ],
            },
            { path: '_design', element: <DesignSandboxPage /> },
            { path: '*', element: <NotFoundPage appBasePath="/admin" /> },
          ],
        },
    ],
  },
], {
  // Allow serving the SPA from a sub-path, e.g. https://vpsadmin.example.cz/ui-next/
  basename: getRuntimeConfig().routerBasename || undefined,
});
