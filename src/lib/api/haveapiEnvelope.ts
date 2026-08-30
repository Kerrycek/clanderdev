import type { HaveApiEnvelope } from './haveapi';

export const MALFORMED_HAVEAPI_ENVELOPE_ERROR_CODE = 'MALFORMED_HAVEAPI_ENVELOPE' as const;

export async function parseHaveApiEnvelope(res: Response): Promise<HaveApiEnvelope> {
  try {
    const parsed: unknown = await res.json();
    if (
      !parsed
      || typeof parsed !== 'object'
      || Array.isArray(parsed)
      || typeof (parsed as { status?: unknown }).status !== 'boolean'
    ) {
      return {
        status: false,
        message: `Malformed HaveAPI response (HTTP ${res.status})`,
        errors: MALFORMED_HAVEAPI_ENVELOPE_ERROR_CODE,
        response: null,
      };
    }
    return parsed as HaveApiEnvelope;
  } catch {
    return {
      status: false,
      message: `Invalid JSON response (HTTP ${res.status})`,
      errors: 'INVALID_JSON_RESPONSE',
      response: null,
    };
  }
}
