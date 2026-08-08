import { describe, expect, it } from 'vitest';

import { csCommon_navigation } from '../../i18n/locales/cs/common/navigation';
import {
  buildSidebarNavItems,
  primarySidebarNavItems,
  sidebarFooterNavItems,
  sidebarNavSections,
  type NavItem,
} from './AppSidebar';

function fakeT(key: string) {
  return key;
}

describe('buildSidebarNavItems', () => {
  it('does not expose action states as a primary navigation item', () => {
    for (const appMode of ['user', 'admin'] as const) {
      const items = buildSidebarNavItems({ basePath: appMode === 'user' ? '/app' : '/admin', appMode, role: 'admin', t: fakeT });

      expect(items.map((item) => item.id)).not.toContain('action-states');
      expect(items.map((item) => item.to)).not.toContain(`${appMode === 'user' ? '/app' : '/admin'}/action-states`);
    }
  });

  it('does not show the old Czech action states label in the sidebar', () => {
    const t = (key: keyof typeof csCommon_navigation) => csCommon_navigation[key] ?? key;

    for (const appMode of ['user', 'admin'] as const) {
      const items = buildSidebarNavItems({ basePath: appMode === 'user' ? '/app' : '/admin', appMode, role: 'admin', t });

      expect(items.map((item) => item.label)).not.toContain('Stavy akcí');
    }
  });

  it('shows security advisory management only to administrators', () => {
    const admin = buildSidebarNavItems({ basePath: '/admin', appMode: 'admin', role: 'admin', t: fakeT });
    const support = buildSidebarNavItems({ basePath: '/admin', appMode: 'admin', role: 'support', t: fakeT });

    expect(admin.map((item) => item.id)).toContain('security-advisories');
    expect(support.map((item) => item.id)).not.toContain('security-advisories');
  });

  it('groups admin navigation without hiding links behind another interaction', () => {
    const items = primarySidebarNavItems(
      buildSidebarNavItems({ basePath: '/admin', appMode: 'admin', role: 'admin', t: fakeT }),
    );
    const sections = sidebarNavSections(items);

    expect(sections.map((section) => section.id)).toEqual([
      'ungrouped',
      'services',
      'operations',
      'users-finance',
      'infrastructure',
      'content',
    ]);
    expect(sections.map((section) => section.labelKey)).toEqual([
      undefined,
      'nav.group.services',
      'nav.group.operations',
      'nav.group.users_finance',
      'nav.group.infrastructure',
      'nav.group.content',
    ]);
    expect(sections.flatMap((section) => section.items.map((item) => item.id))).toEqual([
      'dashboard',
      'vps',
      'datasets',
      'nas',
      'exports',
      'dns',
      'networking',
      'transactions',
      'monitoring',
      'incidents',
      'oom-reports',
      'security-advisories',
      'audit',
      'users',
      'user-namespaces',
      'requests',
      'payments-incoming',
      'cluster',
      'nodes',
      'migration-plans',
      'admin-info',
      'mailer',
      'content',
    ]);
    expect(sidebarFooterNavItems(items).map((item) => item.id)).toEqual(['account']);
  });

  it('keeps the user sidebar flat and keeps Account in its original list position', () => {
    const items = primarySidebarNavItems(
      buildSidebarNavItems({ basePath: '/app', appMode: 'user', role: 'user', t: fakeT }),
    );

    expect(sidebarNavSections(items)).toEqual([{ id: 'ungrouped', items }]);
    expect(sidebarFooterNavItems(items)).toEqual([]);
    expect(items.at(-1)?.id).toBe('account');
  });

  it('preserves support role gating inside the grouped admin navigation', () => {
    const items = primarySidebarNavItems(
      buildSidebarNavItems({ basePath: '/admin', appMode: 'admin', role: 'support', t: fakeT }),
    );
    const visibleIds = sidebarNavSections(items).flatMap((section) => section.items.map((item) => item.id));

    expect(visibleIds).not.toContain('security-advisories');
    expect(visibleIds).not.toContain('action-states');
    expect(sidebarFooterNavItems(items).map((item) => item.id)).toEqual(['account']);
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
