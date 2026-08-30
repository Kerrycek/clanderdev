import React from 'react';

import { lazyRoute } from './lazyRoute';
import { ParamKeyedRoute } from './ParamKeyedRoute';

const IncomingPaymentsPage = lazyRoute(
  () => import('../pages/app/admin/IncomingPaymentsPage'),
  'IncomingPaymentsPage',
);
const IncomingPaymentDetailPage = lazyRoute(
  () => import('../pages/app/admin/IncomingPaymentDetailPage'),
  'IncomingPaymentDetailPage',
);
const IncomeForecastPage = lazyRoute(
  () => import('../pages/app/admin/IncomeForecastPage'),
  'IncomeForecastPage',
);

export const adminFinanceRoutes = [
  { path: 'payments/incoming', element: <IncomingPaymentsPage /> },
  {
    path: 'payments/incoming/:paymentId',
    element: <ParamKeyedRoute param="paymentId"><IncomingPaymentDetailPage /></ParamKeyedRoute>,
  },
  { path: 'payments/forecast', element: <IncomeForecastPage /> },
];
