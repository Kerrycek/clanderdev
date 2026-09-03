import React, { useState } from 'react';

import { useI18n } from '../../../app/i18n';
import { Button } from '../../../components/ui/Button';
import { isMissingActionStateError } from '../../../lib/api/haveapi';
import type { ApiResult, VpsGeneratedPassword, VpsPasswordType, VpsPublicKey } from '../../../lib/api/vpsAccess';

export type GeneratedCredential = {
  password: string;
  passwordType: VpsPasswordType;
};

export type PendingGeneratedCredential = GeneratedCredential & {
  asId: number;
  vpsId: number;
};

export type PendingPublicKeyDeployment = {
  asId: number;
  keyLabel: string;
  vpsId: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nestedValue(value: unknown, path: string[]): unknown {
  let current: unknown = value;

  for (const segment of path) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }

  return current;
}

function presentString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value);
  return s === '' ? undefined : s;
}


export function recordField(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

export function actionStateFinished(value: unknown): boolean {
  return recordField(value, 'finished') === true;
}

export function actionStateFailed(value: unknown): boolean {
  return recordField(value, 'status') === false;
}

export function errorMessage(error: unknown, missingActionStateMessage?: string): string {
  if (missingActionStateMessage && isMissingActionStateError(error)) return missingActionStateMessage;
  if (isRecord(error) && typeof error['message'] === 'string') return error['message'];
  return String(error);
}

export function isBusyError(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'BUSY';
}

export function boolValue(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export function resourceLabel(value: unknown): string {
  if (!value) return '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (isRecord(value)) {
    return String(value['label'] ?? value['name'] ?? value['full_name'] ?? value['login'] ?? value['id'] ?? '—');
  }
  return '—';
}

export function resourceId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  if (isRecord(value)) {
    const id = value['id'];
    if (typeof id === 'number' && Number.isFinite(id)) return id;
    if (typeof id === 'string' && /^\d+$/.test(id)) return Number(id);
  }
  return null;
}

export function extractPassword(res: ApiResult<VpsGeneratedPassword>): string {
  const direct = presentString(nestedValue(res.data, ['password']));
  if (direct) return direct;

  return (
    presentString(nestedValue(res.raw, ['response', 'vps', 'password'])) ??
    presentString(nestedValue(res.raw, ['response', 'password'])) ??
    presentString(nestedValue(res.raw, ['vps', 'password'])) ??
    presentString(nestedValue(res.raw, ['password'])) ??
    ''
  );
}

export function publicKeyLabel(key: VpsPublicKey | null | undefined): string {
  if (!key) return '—';
  const label = key.label || key.comment || `#${key.id}`;
  return key.fingerprint ? `${label} · ${key.fingerprint}` : label;
}

export function StatusItem(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-xs text-muted">{props.label}</div>
      <div className="mt-1 text-sm font-medium text-fg">{props.value}</div>
    </div>
  );
}

export function PasswordBox(props: { password: string; onClear: () => void; testId?: string }) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyPassword = async () => {
    if (!navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(props.password);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  const prefix = props.testId;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4" data-testid={prefix}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          readOnly
          value={props.password}
          type={revealed ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-fg"
          data-testid={prefix ? `${prefix}.field` : undefined}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setRevealed((value) => !value)} testId={prefix ? `${prefix}.toggle` : undefined}>
            {revealed ? t('vps.access.secret.hide') : t('vps.access.secret.reveal')}
          </Button>
          <Button variant="secondary" onClick={() => void copyPassword()} testId={prefix ? `${prefix}.copy` : undefined}>
            {copied ? t('vps.access.secret.copied') : t('vps.access.secret.copy')}
          </Button>
          <Button variant="secondary" onClick={props.onClear} testId={prefix ? `${prefix}.clear` : undefined}>
            {t('vps.access.secret.clear')}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted">{t('vps.access.secret.once')}</p>
    </div>
  );
}
