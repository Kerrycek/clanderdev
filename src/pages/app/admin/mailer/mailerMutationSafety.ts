/**
 * Parse an identifier returned by HaveAPI without coercing booleans or
 * fractional values into a resource id. Mutation responses use this stricter
 * parser so malformed success envelopes remain fail-closed.
 */
export function strictPositiveIntegerId(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;

  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Capture every server field that an ordinary template edit could overwrite.
 * `updated_at` makes the preflight fail closed even when a newer API version
 * changes fields that are not currently exposed by this editor.
 */
export function mailTemplateEditFingerprint(template: {
  updated_at?: unknown;
  label?: unknown;
  user_visibility?: unknown;
}): string {
  return JSON.stringify([
    String(template.updated_at ?? ''),
    String(template.label ?? ''),
    String(template.user_visibility ?? ''),
  ]);
}
