import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../../../../app/auth';
import type { UserRole } from '../../../../lib/roles';

export function canManageSecurityAdvisories(role: UserRole): boolean {
  return role === 'admin';
}

/**
 * Support accounts can use the wider admin UI, but advisory publication is an
 * administrator-only responsibility. Keep that distinction at the route
 * boundary so neither list nor detail mutations can mount for support users.
 */
export function SecurityAdvisoryAdminGate() {
  const auth = useAuth();

  if (!canManageSecurityAdvisories(auth.role)) {
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}

export default SecurityAdvisoryAdminGate;
