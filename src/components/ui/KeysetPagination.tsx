import React, { useMemo, useState } from 'react';

import { useI18n } from '../../app/i18n';

import { Button } from './Button';
import { Select } from './Select';
import { clsx } from './clsx';

type PageItem = number | 'ellipsis';

function pageItems(current: number, total: number): PageItem[] {
  if (total <= 1) return [1];

  // Show everything when small.
  if (total <= 9) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const items: PageItem[] = [];
  const push = (v: PageItem) => {
    if (items.length === 0 || items[items.length - 1] !== v) items.push(v);
  };

  push(1);

  const windowStart = Math.max(2, current - 1);
  const windowEnd = Math.min(total - 1, current + 1);

  if (windowStart > 2) push('ellipsis');
  for (let p = windowStart; p <= windowEnd; p++) push(p);
  if (windowEnd < total - 1) push('ellipsis');

  push(total);
  return items;
}

export function KeysetPagination(props: {
  page?: number;
  pageCount?: number;
  totalPagesKnown?: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onGoToPage?: (pageNumber: number) => void | Promise<void>;
  /** Furthest page whose cursor can be resolved in one bounded interaction. */
  maxDirectPage?: number;
  /** Prevent duplicate cursor walks while a direct jump is being resolved. */
  jumpPending?: boolean;
  limit?: number;
  allowedLimits?: readonly number[];
  onLimitChange?: (limit: number) => void;
  /** Backward-compatible visual variant alias. */
  variant?: string;
  className?: string;
  testId?: string;
}) {
  const { t } = useI18n();
  const page = props.page ?? 1;
  const pageCount = props.pageCount ?? Math.max(page, props.canNext ? page + 1 : page);
  const allowedLimits = props.allowedLimits ?? [25, 50, 100];
  const limit = props.limit ?? allowedLimits[0] ?? 25;
  const items = useMemo(() => pageItems(page, pageCount), [page, pageCount]);
  const prefix = props.testId ?? 'pagination';
  const [jumpPage, setJumpPage] = useState('');
  const totalPagesKnown = Boolean(props.totalPagesKnown && pageCount >= page);
  const maxDirectPage = Math.max(
    page,
    Math.min(pageCount, Math.floor(props.maxDirectPage ?? pageCount))
  );
  const jumpPending = Boolean(props.jumpPending);

  const submitJump = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (jumpPending) return;
    const raw = Number(jumpPage);
    if (!Number.isFinite(raw)) return;
    const target = Math.max(1, Math.min(maxDirectPage, Math.floor(raw)));
    setJumpPage('');
    void props.onGoToPage?.(target);
  };

  return (
    <div
      className={clsx(
        'flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        props.className
      )}
      data-testid={prefix}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!props.canPrev || jumpPending}
          onClick={props.onPrev}
          testId={`${prefix}.prev`}
        >
          {t('pagination.prev')}
        </Button>

        <div className="flex flex-wrap items-center gap-1" aria-label={t('pagination.pages_label')}>
          {items.map((it, idx) =>
            it === 'ellipsis' ? (
              <span key={`e-${idx}`} className="px-2 text-xs text-muted">
                …
              </span>
            ) : (
              <Button
                key={it}
                variant="secondary"
                size="sm"
                className={clsx(
                  'min-w-8 px-2',
                  it === page ? 'border-accent/60 bg-surface-2' : undefined
                )}
                ariaLabel={
                  it === page
                    ? t('pagination.page_current', { page: it })
                    : t('pagination.go_to_page', { page: it })
                }
                onClick={() => props.onGoToPage?.(it)}
                disabled={!props.onGoToPage || it > maxDirectPage || jumpPending}
                testId={`${prefix}.page.${it}`}
              >
                {it}
              </Button>
            )
          )}
        </div>

        <Button
          variant="secondary"
          size="sm"
          disabled={!props.canNext || jumpPending}
          onClick={props.onNext}
          testId={`${prefix}.next`}
        >
          {t('pagination.next')}
        </Button>

        <span className="ml-1 text-xs text-muted">
          {totalPagesKnown ? t('pagination.page_of', { page, total: pageCount }) : t('pagination.page', { page })}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {props.onGoToPage && pageCount > 1 ? (
          <form className="flex items-center gap-2" onSubmit={submitJump}>
            <label htmlFor={`${prefix}.jump`} className="text-xs text-muted">
              {t('pagination.jump_label')}
            </label>
            <input
              id={`${prefix}.jump`}
              data-testid={`${prefix}.jump`}
              className="h-9 w-20 rounded-lg border border-border bg-surface px-2 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              type="number"
              min={1}
              max={maxDirectPage}
              inputMode="numeric"
              value={jumpPage}
              placeholder={String(maxDirectPage)}
              disabled={jumpPending}
              onChange={(event) => setJumpPage(event.target.value)}
            />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={!jumpPage.trim() || jumpPending}
              testId={`${prefix}.jump.submit`}
            >
              {t('pagination.jump_action')}
            </Button>
          </form>
        ) : null}

        {totalPagesKnown && maxDirectPage < pageCount ? (
          <span className="max-w-72 text-xs text-muted" data-testid={`${prefix}.progressive-hint`}>
            {t('pagination.progressive_hint', { page: maxDirectPage })}
          </span>
        ) : null}

        {props.onLimitChange ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{t('pagination.rows')}</span>
            <div className="w-24">
              <Select
                testId={`${prefix}.limit`}
                value={String(limit)}
                onChange={(e) => props.onLimitChange?.(Number(e.target.value))}
                options={allowedLimits.map((l) => ({ value: String(l), label: String(l) }))}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
