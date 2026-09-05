import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import type { UserRole } from '../../../lib/roles';

export function canViewGlobalFinance(role: UserRole): boolean {
  return role === 'admin';
}

/**
 * The payment API restricts support accounts to their own user and payments.
 * Keep global totals/history behind an administrator boundary so a restricted
 * response can never be presented as a complete organization-wide result.
 */
export function FinanceGlobalAdminGate() {
  const auth = useAuth();

  if (!canViewGlobalFinance(auth.role)) {
    return <Navigate to="/admin/payments/incoming" replace />;
  }

  return <Outlet />;
}

export default FinanceGlobalAdminGate;
