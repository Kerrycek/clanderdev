import React from 'react';
import { clsx } from './clsx';

export interface InputProps {
  testId?: string;
  inputId?: string;
  ariaLabel?: string;
  ariaControls?: string;
  ariaExpanded?: boolean;
  ariaAutocomplete?: React.AriaAttributes['aria-autocomplete'];
  ariaActiveDescendant?: string;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  role?: React.AriaRole;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  name?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
  min?: string | number;
  max?: string | number;
  maxLength?: number;
  step?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  className?: string;
  label?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(props, ref) {
  const input = (
    <input
      ref={ref}
      id={props.inputId}
      data-testid={props.testId}
      aria-label={props.ariaLabel}
      aria-controls={props.ariaControls}
      aria-expanded={props.ariaExpanded}
      aria-autocomplete={props.ariaAutocomplete}
      aria-activedescendant={props.ariaActiveDescendant}
      aria-invalid={props.ariaInvalid}
      aria-describedby={props.ariaDescribedBy}
      role={props.role}
      type={props.type ?? 'text'}
      name={props.name}
      inputMode={props.inputMode}
      value={props.value}
      defaultValue={props.defaultValue}
      placeholder={props.placeholder}
      autoComplete={props.autoComplete}
      min={props.min}
      max={props.max}
      maxLength={props.maxLength}
      step={props.step}
      disabled={props.disabled}
      onChange={props.onChange}
      onKeyDown={props.onKeyDown}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      className={clsx(
        'h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none transition',
        'focus:border-accent/70 focus:ring-2 focus:ring-focus/35 focus:ring-offset-2 focus:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-disabled',
        props.className
      )}
    />
  );

  if (!props.label) return input;

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{props.label}</span>
      {input}
    </label>
  );
});
