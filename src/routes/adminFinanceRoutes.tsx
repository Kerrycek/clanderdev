import React from 'react';

import { lazyRoute } from './lazyRoute';
import { ParamKeyedRoute } from './ParamKeyedRoute';

const IncomingPaymentsPage = lazyRoute(
  () => import('../pages/app/admin/IncomingPaymentsPage'),
  'IncomingPaymentsPage',
);
const FinanceOverviewPage = lazyRoute(
  () => import('../pages/app/admin/FinanceOverviewPage'),
  'FinanceOverviewPage',
);
const PaymentHistoryPage = lazyRoute(
  () => import('../pages/app/admin/PaymentHistoryPage'),
  'PaymentHistoryPage',
);
const IncomingPaymentDetailPage = lazyRoute(
  () => import('../pages/app/admin/IncomingPaymentDetailPage'),
  'IncomingPaymentDetailPage',
);
const IncomeForecastPage = lazyRoute(
  () => import('../pages/app/admin/IncomeForecastPage'),
  'IncomeForecastPage',
);
const FinanceGlobalAdminGate = lazyRoute(
  () => import('../pages/app/admin/FinanceGlobalAdminGate'),
  'FinanceGlobalAdminGate',
);

export const adminFinanceRoutes = [
  { path: 'payments/incoming', element: <IncomingPaymentsPage /> },
  {
    path: 'payments/incoming/:paymentId',
    element: <ParamKeyedRoute param="paymentId"><IncomingPaymentDetailPage /></ParamKeyedRoute>,
  },
  { path: 'payments/forecast', element: <IncomeForecastPage /> },
  {
    element: <FinanceGlobalAdminGate />,
    children: [
      { path: 'payments', element: <FinanceOverviewPage /> },
      { path: 'payments/history', element: <PaymentHistoryPage /> },
    ],
  },
];
