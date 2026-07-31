import type { RouteObject } from 'react-router-dom';

import { lazyRoute } from './lazyRoute';

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

export const securityAdvisoryAdminRoutes: RouteObject[] = [
  {
    element: <SecurityAdvisoryAdminGate />,
    children: [
      { path: 'security-advisories', element: <AdminSecurityAdvisoriesPage /> },
      { path: 'security-advisories/:advisoryId', element: <AdminSecurityAdvisoryDetailPage /> },
    ],
  },
];
