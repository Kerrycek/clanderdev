import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { HostIpAddress } from '../../lib/api/exports';
import { fetchHostIpAddresses } from '../../lib/api/exports';
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue';

import { Input } from './Input';
import { clsx } from './clsx';
import { parseLookupIdLike, formatLookupId } from '../../lib/lookupInput';

export function HostIpLookupInput(props: {
  value: number | null;
  onChange: (hostIpId: number | null) => void;
  userId?: number;
  filters?: {
    assigned?: boolean;
    purpose?: string;
    routed?: boolean;
  };
  limit?: number;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  label?: React.ReactNode;
  invalidSelectionMessage?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [invalidSelection, setInvalidSelection] = useState(false);
  const [needleRaw, setNeedleRaw] = useState('');
  const needle = useDebouncedValue(needleRaw, 150);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const generatedId = useId();
  const listboxId = `${generatedId}-host-ip-options`;
  const errorId = `${generatedId}-host-ip-error`;

  useEffect(() => {
    if (props.value === null) return;
    if (open && needleRaw.trim().length > 0) return;
    setNeedleRaw(`#${props.value}`);
  }, [props.value, open, needleRaw]);

  const idLike = useMemo(() => parseLookupIdLike(needle), [needle]);
  const browseEligibleAddresses = props.filters !== undefined;

  const q = useQuery({
    queryKey: [
      'host_ip_lookup',
      browseEligibleAddresses
        ? {
            user: props.userId ?? null,
            assigned: props.filters?.assigned ?? null,
            purpose: props.filters?.purpose ?? null,
            routed: props.filters?.routed ?? null,
            limit: props.limit ?? 100,
          }
        : { needle, user: props.userId ?? null },
    ],
    queryFn: async () => {
      if (browseEligibleAddresses) {
        const res = await fetchHostIpAddresses({
          limit: props.limit ?? 100,
          user: props.userId,
          assigned: props.filters?.assigned,
          purpose: props.filters?.purpose,
          routed: props.filters?.routed,
        });
        return res.data as HostIpAddress[];
      }
      if (!needle.trim()) return [] as HostIpAddress[];
      if (parseLookupIdLike(needle) !== null) return [] as HostIpAddress[];
      const res = await fetchHostIpAddresses({ q: needle.trim(), limit: 10, user: props.userId, assigned: true });
      return res.data as HostIpAddress[];
    },
    enabled:
      open
      && !props.disabled
      && (browseEligibleAddresses || (needle.trim().length >= 2 && idLike === null)),
    staleTime: 15_000,
  });

  const suggestions = useMemo(() => {
    const rows = q.data ?? [];
    if (!browseEligibleAddresses) return rows;

    const term = needle.trim().toLowerCase();
    if (!term) return rows;

    return rows.filter((ip) => {
      const id = Number(ip.id);
      const nestedAddress = ip.ip_address?.['ip_addr'];
      const haystack = [
        ip.addr,
        nestedAddress,
        Number.isFinite(id) ? formatLookupId(id) : '',
        Number.isFinite(id) ? String(id) : '',
      ]
        .map((value) => String(value ?? '').toLowerCase());
      return haystack.some((value) => value.includes(term));
    });
  }, [browseEligibleAddresses, needle, q.data]);

  const eligibleIds = useMemo(
    () => new Set((q.data ?? []).map((ip) => Number(ip.id)).filter((id) => Number.isFinite(id) && id > 0)),
    [q.data]
  );

  useEffect(() => {
    setActiveIdx(suggestions.length > 0 ? 0 : -1);
  }, [suggestions]);

  const onSelect = (ip: HostIpAddress) => {
    const id = Number(ip.id);
    if (!Number.isFinite(id) || id <= 0) return;
    props.onChange(Math.floor(id));
    setNeedleRaw(formatLookupId(id));
    setInvalidSelection(false);
    setActiveIdx(-1);
    setOpen(false);
  };

  const commitRawId = (value: string): boolean => {
    const id = parseLookupIdLike(value);
    if (id === null) return false;

    if (browseEligibleAddresses && !eligibleIds.has(id)) {
      props.onChange(null);
      setInvalidSelection(true);
      return false;
    }

    props.onChange(id);
    setNeedleRaw(formatLookupId(id));
    setInvalidSelection(false);
    return true;
  };

  const onBlur = () => {
    window.setTimeout(() => setOpen(false), 100);
    if (parseLookupIdLike(needleRaw) !== null) {
      commitRawId(needleRaw);
      return;
    }
    if (!needleRaw.trim()) {
      props.onChange(null);
      setInvalidSelection(false);
    }
  };

  const expanded = open && suggestions.length > 0;
  const activeOptionId =
    expanded && activeIdx >= 0 && suggestions[activeIdx]
      ? `${listboxId}-option-${String(suggestions[activeIdx]!.id)}`
      : undefined;

  return (
    <div className="relative" data-testid={props.testId ? `${props.testId}.wrap` : undefined}>
      <Input
        ref={inputRef}
        testId={props.testId}
        ariaLabel={props.ariaLabel}
        ariaControls={listboxId}
        ariaExpanded={expanded}
        ariaAutocomplete="list"
        ariaActiveDescendant={activeOptionId}
        ariaInvalid={invalidSelection || undefined}
        ariaDescribedBy={invalidSelection && props.invalidSelectionMessage ? errorId : undefined}
        role="combobox"
        label={props.label}
        value={needleRaw}
        onChange={(e) => {
          const v = e.target.value;
          setNeedleRaw(v);
          setOpen(true);
          setActiveIdx(-1);
          setInvalidSelection(false);
          const id = parseLookupIdLike(v);
          if (id !== null) {
            if (!browseEligibleAddresses) props.onChange(id);
            else props.onChange(null);
            return;
          }
          if (!v.trim()) props.onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
            setActiveIdx(-1);
            inputRef.current?.blur();
            return;
          }
          if (e.key === 'ArrowDown') {
            if (suggestions.length === 0) return;
            setOpen(true);
            setActiveIdx((index) => Math.min(suggestions.length - 1, Math.max(0, index + 1)));
            e.preventDefault();
            return;
          }
          if (e.key === 'ArrowUp') {
            if (suggestions.length === 0) return;
            setOpen(true);
            setActiveIdx((index) => Math.max(0, index - 1));
            e.preventDefault();
            return;
          }
          if (e.key === 'Enter') {
            const activeSuggestion = open && activeIdx >= 0 ? suggestions[activeIdx] : undefined;
            if (activeSuggestion) {
              e.preventDefault();
              onSelect(activeSuggestion);
              return;
            }
            if (parseLookupIdLike(needleRaw) !== null) {
              e.preventDefault();
              if (commitRawId(needleRaw)) {
                setOpen(false);
                inputRef.current?.blur();
              }
            }
          }
        }}
        disabled={props.disabled}
        placeholder={props.placeholder}
        className={clsx('h-10')}
      />

      {expanded ? (
        <div
          id={listboxId}
          role="listbox"
          className={clsx(
            'absolute z-10 mt-1 w-full rounded-md border border-border bg-overlay-surface shadow-panel',
            'max-h-64 overflow-auto'
          )}
          data-testid={props.testId ? `${props.testId}.menu` : undefined}
          data-overlay="popover"
          data-overlay-surface="overlay"
        >
          {suggestions.map((ip, index) => {
            const id = Number(ip.id);
            const addr = String(ip.addr ?? ip.ip_address?.['ip_addr'] ?? formatLookupId(id));
            const active = index === activeIdx;
            return (
              <button
                type="button"
                key={String(id)}
                id={`${listboxId}-option-${String(id)}`}
                role="option"
                aria-selected={active}
                className={clsx(
                  'block w-full px-3 py-2 text-left text-sm',
                  active ? 'bg-surface-2' : 'hover:bg-surface-2',
                  'focus:bg-surface-2 focus:outline-none'
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelect(ip)}
                onMouseEnter={() => setActiveIdx(index)}
                data-testid={props.testId ? `${props.testId}.opt.${id}` : undefined}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{addr}</div>
                  <div className="truncate text-xs text-faint">{formatLookupId(id)}</div>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {invalidSelection && props.invalidSelectionMessage ? (
        <div id={errorId} role="alert" className="mt-1 text-xs text-danger" data-testid={props.testId ? `${props.testId}.error` : undefined}>
          {props.invalidSelectionMessage}
        </div>
      ) : null}
    </div>
  );
}
