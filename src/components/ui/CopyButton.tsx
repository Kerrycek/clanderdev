import React, { useEffect, useState } from 'react';
import { Check, Copy, TriangleAlert } from 'lucide-react';

import { useI18n } from '../../app/i18n';

import { copyTextToClipboard } from '../../lib/clipboard';
import { Button } from './Button';

export function CopyButton(props: {
  text: string;
  label?: string;
  variant?: React.ComponentProps<typeof Button>['variant'];
  size?: React.ComponentProps<typeof Button>['size'];
  className?: string;
  /** Render a compact icon while keeping visible success/failure feedback. */
  iconOnly?: boolean;
  /** Optional test id for E2E / integration tests */
  testId?: string;
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const { t } = useI18n();

  useEffect(() => {
    if (status === 'idle') return;
    const t = window.setTimeout(() => setStatus('idle'), 1200);
    return () => window.clearTimeout(t);
  }, [status]);

  const idleLabel = props.label ?? t('common.copy');

  const label =
    status === 'copied' ? t('common.copied') : status === 'failed' ? t('common.copy_failed') : idleLabel;

  return (
    <>
      <Button
        testId={props.testId}
        variant={props.variant ?? 'secondary'}
        size={props.size ?? 'sm'}
        className={props.className}
        title={props.iconOnly ? label : undefined}
        ariaLabel={props.iconOnly ? label : undefined}
        onClick={async () => {
          const ok = await copyTextToClipboard(props.text);
          setStatus(ok ? 'copied' : 'failed');
        }}
      >
        {props.iconOnly ? (
          status === 'copied' ? (
            <Check className="h-4 w-4 text-ok" aria-hidden="true" />
          ) : status === 'failed' ? (
            <TriangleAlert className="h-4 w-4 text-danger" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )
        ) : (
          label
        )}
      </Button>
      {props.iconOnly && status !== 'idle' ? (
        <span className="sr-only" role="status" aria-live="polite">
          {label}
        </span>
      ) : null}
    </>
  );
}
