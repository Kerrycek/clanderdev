import React from 'react';

import { clsx } from './clsx';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function Select(props: {
  testId?: string;
  selectId?: string;
  value?: string;
  defaultValue?: string;
  name?: string;
  disabled?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  className?: string;
  ariaLabel?: string;
  'aria-label'?: string;
  label?: React.ReactNode;
  options?: SelectOption[];
  children?: React.ReactNode;
}) {
  const ariaLabel = props.ariaLabel ?? props['aria-label'];

  const content = props.children ?? props.options?.map((o) => (
    <option key={o.value} value={o.value} disabled={o.disabled}>
      {o.label}
    </option>
  ));

  const select = (
    <select
      id={props.selectId}
      data-testid={props.testId}
      name={props.name}
      value={props.value}
      defaultValue={props.defaultValue}
      disabled={props.disabled}
      onChange={props.onChange}
      aria-label={ariaLabel}
      className={clsx(
        'h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none transition',
        'focus:border-accent/70 focus:ring-2 focus:ring-focus/35 focus:ring-offset-2 focus:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-disabled',
        props.className
      )}
    >
      {content}
    </select>
  );

  if (!props.label) return select;

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{props.label}</span>
      {select}
    </label>
  );
}
