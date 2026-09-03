export type ConsoleConnectionState =
  | 'connecting' | 'connected' | 'disconnected' | 'failed'
  | 'reconnecting' | 'expired' | 'revoked' | 'unavailable';

export const CONSOLE_CONNECTION_STATE_VARIANT: Record<ConsoleConnectionState, string> = {
  connecting: 'bg-info',
  connected: 'bg-ok',
  disconnected: 'bg-warn',
  failed: 'bg-danger',
  reconnecting: 'bg-info',
  expired: 'bg-warn',
  revoked: 'bg-neutral',
  unavailable: 'bg-neutral',
};

export function hasKnownConsoleToken(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const token = (value as Record<string, unknown>)['token'];
  return typeof token === 'string' && token.length > 0;
}

export function markConsoleSessionStateUncertain(error: unknown): Error & { sessionStateUncertain: true } {
  const markedError = error instanceof Error ? error : new Error(String(error));
  return Object.assign(markedError, { sessionStateUncertain: true as const });
}

export function isConsoleSessionStateUncertain(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as Record<string, unknown>)['sessionStateUncertain']);
}

export function getConsoleConnectionState(input: {
  hasServer: boolean;
  sessionActionPending: boolean;
  manualReconnect: boolean;
  tokenError: boolean;
  sessionSuspended: boolean;
  tokenExpired: boolean;
  tokenFetching: boolean;
  hasActiveToken: boolean;
  iframeProblem: boolean;
  iframeLoaded: boolean;
}): ConsoleConnectionState {
  if (!input.hasServer) return 'unavailable';
  if (input.sessionActionPending || input.manualReconnect) return 'reconnecting';
  if (input.tokenError) return 'failed';
  if (input.sessionSuspended) return 'revoked';
  if (input.tokenExpired) return 'expired';
  if (input.tokenFetching) return 'connecting';
  if (!input.hasActiveToken || input.iframeProblem) return 'disconnected';
  return input.iframeLoaded ? 'connected' : 'connecting';
}

export function formatConsoleExpiration(expiration: string | null | undefined): string | null {
  if (!expiration || Number.isNaN(Date.parse(expiration))) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(expiration));
}

export function consoleMutationErrorMessage(error: unknown): string {
  return String((error as { message?: unknown } | null | undefined)?.message ?? error);
}
