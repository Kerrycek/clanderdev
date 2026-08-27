import type React from 'react';

export interface AppHeaderProps {
  t: (key: any, vars?: Record<string, unknown>) => string;
  mode: 'user' | 'admin';
  canSwitchMode: boolean;
  shortcutHint: string;
  onOpenMobileNav: () => void;
  showSyncIndicator: boolean;
  syncRef: React.RefObject<HTMLDivElement | null>;
  syncOpen: boolean;
  setSyncOpen: React.Dispatch<React.SetStateAction<boolean>>;
  syncStatus: 'offline' | 'error';
  syncTitle: string;
  syncBody: string;
  syncError: unknown;
  onRetrySync: () => void;
  tasksFailedCount: number;
  tasksActiveCount: number;
  onOpenTasks: () => void;
  userMenuRef: React.RefObject<HTMLDivElement | null>;
  userMenuOpen: boolean;
  setUserMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  authLogin?: string;
  authRole?: string;
  sessionExpiresAt?: number;
  theme: 'system' | 'light' | 'dark';
  language: 'system' | 'en' | 'cs';
  onSetTheme: (next: 'system' | 'light' | 'dark') => void;
  onSetLanguage: (next: 'system' | 'en' | 'cs') => void;
  onGoToOtherMode: () => void;
  onGoToProfile: () => void;
  onGoToPublicStatus: () => void;
  loginLogoutHref: string;
}
