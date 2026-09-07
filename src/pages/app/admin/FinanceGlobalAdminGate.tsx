import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import type { UserRole } from '../../../lib/roles';

export function canViewGlobalFinance(role: UserRole): boolean {
  return role === 'admin';
}

/**
 * Ordinary users can read only their own payment-related data. Keep global
 * totals behind an administrator boundary so a user-scoped response can never
 * be presented as a complete organization-wide result.
 */
export function FinanceGlobalAdminGate() {
  const auth = useAuth();

  if (!canViewGlobalFinance(auth.role)) {
    return <Navigate to="/app/payments" replace />;
  }

  return <Outlet />;
}

export default FinanceGlobalAdminGate;
