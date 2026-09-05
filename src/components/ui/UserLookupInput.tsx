import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { type User } from '../../lib/api/users';
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue';
import { searchUsers } from '../../lib/api/users';

import { Input } from './Input';
import { clsx } from './clsx';
import { parseLookupIdLike } from '../../lib/lookupInput';

export function UserLookupInput(props: {
  /** Raw input value (typically a user id string, but may be a query while searching). */
  value: string | number | null | undefined;
  onChange?: (value: string) => void;
  /** Backward-compatible alias used by older pages. */
  setValue?: (value: string) => void;

  /** Called when the user picks a suggestion. */
  onPick?: (user: User) => void;

  placeholder?: string;
  disabled?: boolean;
  testId?: string;
  ariaLabel?: string;
  label?: React.ReactNode;
  className?: string;

  /** Suggestion count limit. */
  limit?: number;
  /** Optional explicit lifecycle scopes for admin searches. */
  objectStates?: string[];

  loadingLabel?: string;
  noResultsLabel?: string;
  /** Backward-compatible flag kept for older call sites. */
  allowRawId?: boolean;
}) {
  const limit = typeof props.limit === 'number' && props.limit > 0 ? props.limit : 8;
  const setValue = props.onChange ?? props.setValue ?? (() => {});

  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const blurTimer = useRef<number | null>(null);

  const inputValue = props.value == null ? '' : String(props.value);
  const needle = useMemo(() => inputValue.trim(), [inputValue]);
  const debouncedNeedle = useDebouncedValue(needle, 200);
  const numeric = useMemo(() => parseLookupIdLike(needle) !== null, [needle]);

  const searchEnabled = open && !props.disabled && needle.length >= 2 && !numeric;

  const q = useQuery({
    queryKey: ['users', 'search', { q: debouncedNeedle, limit, objectStates: props.objectStates }],
    enabled: searchEnabled,
    queryFn: async () => (await searchUsers({
      q: debouncedNeedle,
      limit,
      objectStates: props.objectStates,
    })).data,
    staleTime: 10_000,
  });

  const users = q.data ?? [];
  const waitingForDebounce = needle !== debouncedNeedle;

  // Reset active index when the user list changes.
  useEffect(() => {
    setActiveIdx(users.length > 0 ? 0 : -1);
  }, [users.length]);

  function closeSoon() {
    if (blurTimer.current) window.clearTimeout(blurTimer.current);
    blurTimer.current = window.setTimeout(() => {
      setOpen(false);
      setActiveIdx(-1);
    }, 120);
  }

  function pick(u: User) {
    setValue(String(u.id));
    props.onPick?.(u);
    setOpen(false);
    setActiveIdx(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
      return;
    }

    if (!open) {
      if (e.key === 'ArrowDown' && users.length > 0) {
        setOpen(true);
        setActiveIdx(0);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      if (users.length === 0) return;
      setActiveIdx((i) => Math.min(users.length - 1, Math.max(0, i + 1)));
      e.preventDefault();
      return;
    }

    if (e.key === 'ArrowUp') {
      if (users.length === 0) return;
      setActiveIdx((i) => Math.max(0, i - 1));
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter') {
      if (users.length === 0 || activeIdx < 0) return;
      const u = users[activeIdx];
      if (u) pick(u);
      e.preventDefault();
    }
  }

  const showDropdown = open && !numeric && needle.length >= 2;

  return (
    <div className={clsx('relative', props.className)}>
      <Input
        value={inputValue}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActiveIdx(-1);
        }}
        onFocus={() => {
          if (blurTimer.current) window.clearTimeout(blurTimer.current);
          setOpen(true);
        }}
        onBlur={() => closeSoon()}
        onKeyDown={onKeyDown}
        placeholder={props.placeholder}
        disabled={props.disabled}
        testId={props.testId}
        ariaLabel={props.ariaLabel}
        label={props.label}
        autoComplete="off"
      />

      {showDropdown ? (
        <div
          className={clsx(
            'absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border border-border bg-overlay-surface shadow-panel',
            'max-h-64 overflow-y-auto'
          )}
          data-testid={props.testId ? `${props.testId}.dropdown` : undefined}
          data-overlay="popover"
          data-overlay-surface="overlay"
        >
          {q.isLoading || q.isFetching || (waitingForDebounce && users.length === 0) ? (
            <div className="px-3 py-2 text-xs text-muted">{props.loadingLabel ?? ''}</div>
          ) : users.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted">{props.noResultsLabel ?? ''}</div>
          ) : (
            <ul className="py-1">
              {users.map((u, idx) => {
                const active = idx === activeIdx;
                const login = u.login || `#${u.id}`;
                const fullName = u.full_name ? String(u.full_name) : '';
                const email = u.email ? String(u.email) : '';

                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      className={clsx(
                        'flex w-full items-start justify-between gap-3 px-3 py-2 text-left',
                        active ? 'bg-surface-2' : 'hover:bg-surface-2'
                      )}
                      onMouseDown={(e) => {
                        // Prevent input blur before we can pick.
                        e.preventDefault();
                        pick(u);
                      }}
                      onMouseEnter={() => setActiveIdx(idx)}
                      data-testid={props.testId ? `${props.testId}.opt.${u.id}` : undefined}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-fg">{login}</div>
                        {fullName || email ? (
                          <div className="mt-0.5 truncate text-xs text-muted">
                            {fullName}
                            {fullName && email ? ' · ' : ''}
                            {email}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-xs tabular-nums text-faint">#{u.id}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
