import React from 'react';
import { clsx } from './clsx';

export function Card(props: { id?: string; testId?: string; className?: string; children: React.ReactNode }) {
  return (
    <div
      id={props.id}
      data-testid={props.testId}
      className={clsx('min-w-0 rounded-lg border border-border bg-surface shadow-card', props.className)}
    >
      {props.children}
    </div>
  );
}

export function CardHeader(props: {
  className?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Backward-compatible alias. */
  right?: React.ReactNode;
}) {
  const actions = props.actions ?? props.right;

  return (
    <div className={clsx('flex items-start gap-3 border-b border-border p-4', props.className)}>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{props.title}</div>
        {props.subtitle ? <div className="mt-0.5 text-sm text-muted">{props.subtitle}</div> : null}
      </div>

      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody(props: { className?: string; children: React.ReactNode }) {
  return <div className={clsx('p-4', props.className)}>{props.children}</div>;
}
