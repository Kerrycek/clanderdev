import React from 'react';

import { clsx } from '../../components/ui/clsx';
import { useI18n } from '../../app/i18n';

export function OAuthShell(props: {
  children: React.ReactNode;
  testId?: string;
  variant?: 'progress' | 'error';
}) {
  const { t } = useI18n();

  return (
    <main
      className="flex min-h-dvh items-center bg-bg px-4 py-8 text-fg sm:px-6 lg:px-8"
      data-testid={props.testId}
    >
      <div className="mx-auto w-full max-w-content-sm">
        <div className="w-full">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-accent text-sm font-semibold text-accent-fg shadow-card">
              VA
            </div>
            <div className="leading-tight">
              <div className="text-base font-semibold text-fg">vpsAdmin</div>
              <div className="text-xs text-muted">{t('app.logo.subtitle')}</div>
            </div>
          </div>

          <div
            className={clsx(
              'rounded-lg border bg-surface shadow-panel',
              props.variant === 'error' ? 'border-danger-border' : 'border-border',
            )}
          >
            {props.children}
          </div>
        </div>
      </div>
    </main>
  );
}
