import React from 'react';
import { ChevronDown } from 'lucide-react';

import type { BadgeVariant } from '../../lib/taskStatus';
import { Badge } from '../ui/Badge';
import { clsx } from '../ui/clsx';
import { StackedBar, type StackedBarSegment } from '../ui/StackedBar';

export function ClusterLocationPanel(props: {
  location: string;
  summary: string;
  compactSummary?: string;
  summaryVariant: BadgeVariant;
  segments: StackedBarSegment[];
  barAriaLabel: string;
  children: React.ReactNode;
  testId: string;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details
      open={props.defaultOpen ?? true}
      className={clsx(
        'group overflow-hidden rounded-lg border border-info-border bg-surface shadow-card',
        props.className,
      )}
      data-cluster-location={props.location}
      data-cluster-location-layout="panel"
      data-testid={props.testId}
    >
      <summary className="list-none cursor-pointer border-l-4 border-info bg-info-bg px-3 py-3 select-none">
        <div className="grid gap-2 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <ChevronDown
              className="h-4 w-4 shrink-0 text-info transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
            <span className="truncate text-base font-semibold text-fg">{props.location}</span>
          </div>
          <div
            className={clsx(
              'w-full items-center gap-3 sm:flex sm:w-auto sm:min-w-48 sm:justify-end',
              props.compactSummary ? 'flex' : 'grid min-w-0',
            )}
          >
            <StackedBar
              ariaLabel={props.barAriaLabel}
              segments={props.segments}
              className="min-w-20 flex-1 sm:max-w-32"
              testId={`${props.testId}.bar`}
            />
            <Badge
              variant={props.summaryVariant}
              className={clsx(
                'max-w-full',
                props.compactSummary ? 'whitespace-nowrap' : 'whitespace-normal sm:whitespace-nowrap',
              )}
              testId={`${props.testId}.summary`}
            >
              {props.compactSummary ? (
                <>
                  <span className="sm:hidden">{props.compactSummary}</span>
                  <span className="hidden sm:inline">{props.summary}</span>
                </>
              ) : (
                props.summary
              )}
            </Badge>
          </div>
        </div>
      </summary>
      <div className="border-t border-info-border">{props.children}</div>
    </details>
  );
}
