import { describe, expect, it } from 'vitest';

import { csCommon_navigation } from '../../i18n/locales/cs/common/navigation';
import { buildSidebarNavItems, primarySidebarNavItems, type NavItem } from './AppSidebar';

function fakeT(key: string) {
  return key;
}

describe('buildSidebarNavItems', () => {
  it('does not expose action states as a primary navigation item', () => {
    for (const appMode of ['user', 'admin'] as const) {
      const items = buildSidebarNavItems({
        basePath: appMode === 'user' ? '/app' : '/admin',
        appMode,
        role: appMode === 'admin' ? 'admin' : 'user',
        t: fakeT,
      });

      expect(items.map((item) => item.id)).not.toContain('action-states');
      expect(items.map((item) => item.to)).not.toContain(`${appMode === 'user' ? '/app' : '/admin'}/action-states`);
    }
  });

  it('does not show the old Czech action states label in the sidebar', () => {
    const t = (key: keyof typeof csCommon_navigation) => csCommon_navigation[key] ?? key;

    for (const appMode of ['user', 'admin'] as const) {
      const items = buildSidebarNavItems({
        basePath: appMode === 'user' ? '/app' : '/admin',
        appMode,
        role: appMode === 'admin' ? 'admin' : 'user',
        t,
      });

      expect(items.map((item) => item.label)).not.toContain('Stavy akcí');
    }
  });

  it('shows security advisory management only to administrators', () => {
    const adminItems = buildSidebarNavItems({ basePath: '/admin', appMode: 'admin', role: 'admin', t: fakeT });
    const supportItems = buildSidebarNavItems({ basePath: '/admin', appMode: 'admin', role: 'support', t: fakeT });

    expect(adminItems.map((item) => item.id)).toContain('security-advisories');
    expect(supportItems.map((item) => item.id)).not.toContain('security-advisories');
  });

  it('defensively removes action states from externally supplied navigation', () => {
    const items = [
      { id: 'dashboard', to: '/app', label: 'Přehled', icon: null },
      { id: 'action-states', to: '/app/action-states', label: 'Stavy akcí', icon: null },
      { id: 'legacy-action-states', to: '/app/action_states', label: 'Stavy akcí', icon: null },
    ] satisfies NavItem[];

    expect(primarySidebarNavItems(items).map((item) => item.id)).toEqual(['dashboard']);
  });
});
