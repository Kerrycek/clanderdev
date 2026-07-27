import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  ClipboardList,
  CreditCard,
  Cpu,
  FileText,
  Globe,
  GitMerge,
  HardDrive,
  Inbox,
  LayoutDashboard,
  Layers,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  Settings,
  Share2,
  Shield,
  ShieldAlert,
  User,
  Users,
  Wifi,
} from 'lucide-react';

import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { clsx } from '../ui/clsx';
import type { UserRole } from '../../lib/roles';

export interface NavItem {
  id: string;
  to: string;
  label: string;
  icon: React.ReactNode;
}

export function primarySidebarNavItems(items: NavItem[]): NavItem[] {
  return items.filter((item) => item.id !== 'action-states' && !item.to.match(/\/action[_-]states(?:\/|$)/));
}

export function buildSidebarNavItems(opts: {
  basePath: string;
  appMode: 'user' | 'admin';
  role: UserRole;
  t: (key: any) => string;
}): NavItem[] {
  const { basePath, appMode, role, t } = opts;

  const items: NavItem[] = [
    { id: 'dashboard', to: basePath, label: t('nav.dashboard'), icon: <LayoutDashboard size={18} /> },
    { id: 'vps', to: `${basePath}/vps`, label: t('nav.vps'), icon: <Server size={18} /> },
    { id: 'datasets', to: `${basePath}/datasets`, label: t('nav.datasets'), icon: <HardDrive size={18} /> },
    { id: 'nas', to: `${basePath}/nas`, label: t('nav.nas'), icon: <Server size={18} /> },
    { id: 'exports', to: `${basePath}/exports`, label: t('nav.exports'), icon: <Share2 size={18} /> },
    { id: 'dns', to: `${basePath}/dns`, label: t('nav.dns'), icon: <Globe size={18} /> },
    ...(appMode === 'user'
      ? [{ id: 'networking', to: `${basePath}/networking`, label: t('nav.networking'), icon: <Wifi size={18} /> }]
      : []),
    { id: 'transactions', to: `${basePath}/transactions`, label: t('nav.transactions'), icon: <Activity size={18} /> },
    { id: 'monitoring', to: `${basePath}/monitoring`, label: t('nav.monitoring'), icon: <Activity size={18} /> },
    { id: 'incidents', to: `${basePath}/incidents`, label: t('nav.incidents'), icon: <Inbox size={18} /> },
    { id: 'oom-reports', to: `${basePath}/oom-reports`, label: t('nav.oom_reports'), icon: <Cpu size={18} /> },
  ];

  if (appMode === 'user') {
    items.push({ id: 'payments', to: `${basePath}/payments`, label: t('nav.payments'), icon: <CreditCard size={18} /> });
  }

  if (appMode === 'admin') {
    if (role === 'admin') {
      items.push({
        id: 'security-advisories',
        to: `${basePath}/security-advisories`,
        label: t('nav.security_advisories'),
        icon: <ShieldAlert size={18} />,
      });
    }
    items.push({ id: 'audit', to: `${basePath}/audit`, label: t('nav.audit'), icon: <ClipboardList size={18} /> });
    items.push({ id: 'users', to: `${basePath}/users`, label: t('nav.users'), icon: <Users size={18} /> });
    items.push({
      id: 'user-namespaces',
      to: `${basePath}/user-namespaces/namespaces`,
      label: t('nav.user_namespaces'),
      icon: <Layers size={18} />,
    });
    items.push({
      id: 'networking',
      to: `${basePath}/networking/ip-addresses`,
      label: t('nav.networking'),
      icon: <Wifi size={18} />,
    });
    items.push({ id: 'requests', to: `${basePath}/requests`, label: t('nav.requests'), icon: <Inbox size={18} /> });
    items.push({ id: 'mailer', to: `${basePath}/mailer/templates`, label: t('nav.mailer'), icon: <Mail size={18} /> });
    items.push({ id: 'content', to: `${basePath}/content/news`, label: t('nav.content'), icon: <FileText size={18} /> });
    items.push({
      id: 'payments-incoming',
      to: `${basePath}/payments/incoming`,
      label: t('nav.incoming_payments'),
      icon: <CreditCard size={18} />,
    });
    items.push({ id: 'cluster', to: `${basePath}/cluster/summary`, label: t('nav.cluster'), icon: <Settings size={18} /> });
    items.push({ id: 'nodes', to: `${basePath}/nodes`, label: t('nav.nodes'), icon: <Cpu size={18} /> });
    items.push({ id: 'migration-plans', to: `${basePath}/migration-plans`, label: t('nav.migration_plans'), icon: <GitMerge size={18} /> });
    items.push({ id: 'admin-info', to: `${basePath}/admin-info`, label: t('nav.admin'), icon: <Shield size={18} /> });
  }

  items.push({ id: 'account', to: `${basePath}/profile`, label: t('nav.account'), icon: <User size={18} /> });
  return items;
}

function isExactNavItem(item: NavItem): boolean {
  return item.id === 'dashboard' || item.to === '/';
}

export function AppLogo(props: { subtitle: string; collapsed?: boolean }) {
  if (props.collapsed) {
    return (
      <div className="grid h-8 w-8 place-items-center rounded-md bg-accent text-sm font-semibold text-accent-fg">
        VA
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="grid h-8 w-8 place-items-center rounded-md bg-accent text-sm font-semibold text-accent-fg">VA</div>
      <div className="leading-tight">
        <div className="text-sm font-semibold">vpsAdmin</div>
        <div className="text-xs text-muted">{props.subtitle}</div>
      </div>
    </div>
  );
}

export function AppSidebar(props: {
  mobileNavOpen: boolean;
  onCloseMobileNav: () => void;
  navItems: NavItem[];
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  t: (key: any) => string;
  sidebarTips?: React.ReactNode;
}) {
  const { mobileNavOpen, onCloseMobileNav, navItems, sidebarCollapsed, onToggleSidebar, t, sidebarTips } = props;
  const primaryNavItems = primarySidebarNavItems(navItems);
  const compactDesktopNav = !sidebarCollapsed && primaryNavItems.length > 18;

  return (
    <>
      <Drawer
        open={mobileNavOpen}
        side="left"
        title={t('nav.navigation')}
        onClose={onCloseMobileNav}
        testId="nav.drawer"
        closeTestId="nav.drawer.close"
      >
        <div className="space-y-4">
          <AppLogo subtitle={t('app.logo.subtitle')} />

          <nav className="space-y-1" data-document-title-nav="section">
            {primaryNavItems.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={isExactNavItem(it)}
                data-testid={`nav.drawer.${it.id}`}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive ? 'bg-accent/15 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'
                  )
                }
                onClick={onCloseMobileNav}
              >
                {it.icon}
                <span>{it.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </Drawer>

      <aside
        data-testid="shell.sidebar"
        className={clsx(
          'sticky top-0 hidden h-screen shrink-0 border-r border-border bg-surface md:block',
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 p-4">
            <AppLogo subtitle={t('app.logo.subtitle')} collapsed={sidebarCollapsed} />
          </div>

          <nav
            className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 pb-2"
            data-document-title-nav="section"
          >
            {primaryNavItems.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={isExactNavItem(it)}
                data-testid={`nav.sidebar.${it.id}`}
                className={({ isActive }) =>
                  clsx(
                    'flex min-w-0 items-center gap-2 rounded-md px-3 text-sm transition-colors',
                    compactDesktopNav ? 'py-1.5' : 'py-2',
                    isActive ? 'bg-accent/15 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'
                  )
                }
                title={sidebarCollapsed ? it.label : undefined}
              >
                <span className="shrink-0">{it.icon}</span>
                {sidebarCollapsed ? null : <span className="min-w-0 truncate">{it.label}</span>}
              </NavLink>
            ))}
          </nav>

          {sidebarTips ? <div className="shrink-0">{sidebarTips}</div> : null}

          <div className="shrink-0 border-t border-border p-2">
            <Button
              variant="ghost"
              onClick={onToggleSidebar}
              className="w-full justify-start"
            >
              {sidebarCollapsed ? (
                <>
                  <PanelLeftOpen size={18} />
                  <span className="sr-only">{t('settings.sidebar.expand')}</span>
                </>
              ) : (
                <>
                  <PanelLeftClose size={18} />
                  <span className="ml-2">{t('settings.sidebar.collapse')}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
