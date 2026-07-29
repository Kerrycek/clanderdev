import React from 'react';

export function ProfilePreferenceRow(props: {
  label: React.ReactNode;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 rounded-md border border-border bg-surface-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] sm:items-start">
      <div>
        <div className="text-sm font-semibold text-fg">{props.label}</div>
        <div className="mt-1 text-xs leading-5 text-muted">{props.description}</div>
      </div>
      <div className="min-w-0">{props.children}</div>
    </div>
  );
}
