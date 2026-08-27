/**
 * Remove TSIG secrets from a complete HaveAPI response before it can enter a
 * query or mutation cache. Secrets may be nested in includes and envelopes,
 * so scrubbing only the public `data` field is not sufficient.
 */
export function withoutDnsSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => withoutDnsSecrets(item)) as T;
  }

  if (value === null || typeof value !== 'object') return value;

  const safe: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (key.toLowerCase() === 'secret') continue;
    safe[key] = withoutDnsSecrets(nestedValue);
  }

  return safe as T;
}
