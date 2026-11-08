import {
  APICallError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  StreamProviderError,
} from 'ai';
import type { ErrorCode, SummaryEvent } from '../contracts/index.ts';

const CODE_KEYS = ['code', 'type', 'error_code', 'reason'];
const NO_CREDIT_CODES = ['insufficient_quota', 'billing_error', 'enforced_spend_limit_reached'];

// Never the provider's own message: an OpenAI 401 body echoes part of the key.
export function toErrorEvent(error: unknown, signal: AbortSignal): SummaryEvent {
  return { type: 'error', code: toErrorCode(error, signal), httpStatus: statusOf(error) };
}

function toErrorCode(error: unknown, signal: AbortSignal): ErrorCode {
  if (signal.aborted) return 'aborted';
  if (error instanceof TypeError) return 'network';
  if (APICallError.isInstance(error) && error.statusCode === undefined) return 'network';
  if (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error)) {
    return 'invalid_output';
  }
  const status = statusOf(error);
  const codes = codesIn(payloadOf(error));
  if (status === 401 || status === 403 || codes.includes('API_KEY_INVALID')) return 'unauthorized';
  if (status === 402 || codes.some((code) => NO_CREDIT_CODES.includes(code))) {
    return 'quota_exceeded';
  }
  if (status === 429) return 'rate_limited';
  return 'provider';
}

function statusOf(error: unknown): number | undefined {
  return APICallError.isInstance(error) || StreamProviderError.isInstance(error)
    ? error.statusCode
    : undefined;
}

// The raw body too: Anthropic names its spend cap in a field its parsed data drops.
function payloadOf(error: unknown): unknown {
  if (APICallError.isInstance(error)) return [error.data, parseJson(error.responseBody)];
  if (StreamProviderError.isInstance(error)) return { type: error.type, data: error.data };
  return undefined;
}

function parseJson(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function codesIn(value: unknown, codes: string[] = []): string[] {
  if (typeof value !== 'object' || value === null) return codes;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (CODE_KEYS.includes(key) && typeof item === 'string') codes.push(item);
    else codesIn(item, codes);
  }
  return codes;
}
