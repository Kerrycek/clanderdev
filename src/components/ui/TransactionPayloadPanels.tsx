import React from 'react';

import { safeJson } from '../../lib/txFormat';

import { CopyButton } from './CopyButton';
import { clsx } from './clsx';

/**
 * TransactionPayloadPanels
 *
 * Shared rendering for transaction input/output payloads.
 *
 * - Uses opaque surfaces (no alpha hacks)
 * - Uses tabular numerals via surrounding table/list contracts
 * - Provides Copy buttons for power users
 */
export function TransactionPayloadPanels(props: {
  t: (k: any, vars?: any) => string;
  input: string;
  output: string;
  /** e.g. "max-h-72", "max-h-80", or "max-h-96" */
  maxHeightClass?: string;
  layout?: 'grid' | 'stacked';
}) {
  const maxH = (() => {
    // Keep the allowed values explicit so Tailwind can statically see them.
    if (props.maxHeightClass === 'max-h-72') return 'max-h-72';
    if (props.maxHeightClass === 'max-h-80') return 'max-h-80';
    return 'max-h-96';
  })();
  const layoutClass = props.layout === 'stacked' ? 'grid min-w-0 gap-3' : 'grid min-w-0 gap-3 lg:grid-cols-2';

  return (
    <div className={layoutClass}>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-muted">{props.t('transactions.tx.input')}</div>
          {props.input ? <CopyButton text={props.input} /> : null}
        </div>
        {props.input ? (
          <pre
            className={clsx('mt-2 w-0 min-w-full max-w-full overflow-auto rounded-md border border-border bg-surface p-3 text-xs text-muted', maxH)}
          >
            {props.input}
          </pre>
        ) : (
          <div className="mt-2 text-xs text-muted">{props.t('transactions.tx.no_payload')}</div>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-muted">{props.t('transactions.tx.output')}</div>
          {props.output ? <CopyButton text={props.output} /> : null}
        </div>
        {props.output ? (
          <pre
            className={clsx('mt-2 w-0 min-w-full max-w-full overflow-auto rounded-md border border-border bg-surface p-3 text-xs text-muted', maxH)}
          >
            {props.output}
          </pre>
        ) : (
          <div className="mt-2 text-xs text-muted">{props.t('transactions.tx.no_payload')}</div>
        )}
      </div>
    </div>
  );
}

export function TransactionDebugSections(props: {
  t: (k: any, vars?: any) => string;
  input?: string;
  output?: string;
  errorText?: string;
  source?: Record<string, unknown> | null | undefined;
  raw?: unknown;
  maxHeightClass?: string;
  payloadLayout?: 'grid' | 'stacked';
  rawInitiallyOpen?: boolean;
  rawTestId?: string;
  testId?: string;
}) {
  const maxH = (() => {
    if (props.maxHeightClass === 'max-h-72') return 'max-h-72';
    if (props.maxHeightClass === 'max-h-80') return 'max-h-80';
    return 'max-h-96';
  })();
  const source = props.source ?? {};
  const extraKeys = ['result', 'response', 'exception', 'stdout', 'stderr', 'backtrace', 'message', 'details', 'detail', 'log', 'logs'];
  const extras = extraKeys
    .map((key) => {
      const value = source[key];
      if (value === null || value === undefined || value === '') return null;
      const text = typeof value === 'string' ? value : safeJson(value);
      if (!text || text === props.errorText) return null;
      return { key, text };
    })
    .filter((item): item is { key: string; text: string } => Boolean(item));
  const rawText = props.raw === undefined ? '' : safeJson(props.raw);

  return (
    <div className="min-w-0 space-y-4" data-testid={props.testId}>
      {props.errorText ? (
        <div>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-danger">{props.t('transactions.tx.error_label')}</div>
            <CopyButton text={props.errorText} />
          </div>
          <pre className={clsx('mt-2 max-w-full whitespace-pre-wrap break-all overflow-auto rounded-md border border-danger-border bg-danger-bg p-3 text-xs text-muted', maxH)}>
            {props.errorText}
          </pre>
        </div>
      ) : null}

      <TransactionPayloadPanels
        t={props.t}
        input={props.input ?? ''}
        output={props.output ?? ''}
        maxHeightClass={props.maxHeightClass}
        layout={props.payloadLayout}
      />

      {extras.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {extras.map((item) => (
            <div key={item.key} className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted">{props.t(`transactions.tx.section.${item.key}`)}</div>
                <CopyButton text={item.text} />
              </div>
              <pre className={clsx('mt-2 max-w-full whitespace-pre-wrap break-all overflow-auto rounded-md border border-border bg-surface p-3 text-xs text-muted', maxH)}>
                {item.text}
              </pre>
            </div>
          ))}
        </div>
      ) : null}

      {props.raw !== undefined ? (
        <details className="min-w-0 max-w-full rounded-md border border-border bg-surface p-3" open={props.rawInitiallyOpen} data-testid={props.rawTestId}>
          <summary className="cursor-pointer select-none text-sm font-medium">{props.t('transactions.items.detail.section.raw')}</summary>
          <pre className={clsx('mt-2 w-0 min-w-full max-w-full overflow-auto text-xs text-muted', maxH)} data-testid={props.rawTestId ? `${props.rawTestId}.json` : undefined}>
            {rawText}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
