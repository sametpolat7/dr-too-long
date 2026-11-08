import {
  APICallError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  StreamProviderError,
} from 'ai';
import type { ErrorCode, SummaryEvent } from '../contracts/index.ts';
import { ProviderUnreachable } from './provider-model.ts';

const CODE_KEYS = ['code', 'type', 'error_code', 'reason'];
const NO_CREDIT_CODES = ['insufficient_quota', 'billing_error', 'enforced_spend_limit_reached'];
// Anthropic answers a spend limit the reader set with a 400 whose only mark is how its message
// starts.
const SPEND_LIMIT_MESSAGE = /^You have reached your specified (workspace )?API usage limits/;

// Never the provider's own message: an OpenAI 401 body echoes part of the key.
export function toErrorEvent(error: unknown, signal: AbortSignal): SummaryEvent {
  const code = toErrorCode(error, signal);
  if (code === 'unexpected') reportUnexpected(error);
  return { type: 'error', code, httpStatus: statusOf(error) };
}

// The name and stack only: a message can quote the selection or the model's output.
export function reportUnexpected(error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  const frames = error instanceof Error ? (error.stack ?? '').split('\n').slice(1) : [];
  console.error(['Dr. Too Long hit an unexpected error:', name, ...frames].join('\n'));
}

function toErrorCode(error: unknown, signal: AbortSignal): ErrorCode {
  if (signal.aborted) return 'aborted';
  if (error instanceof ProviderUnreachable) return 'network';
  if (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error)) {
    return 'invalid_output';
  }
  if (!APICallError.isInstance(error) && !StreamProviderError.isInstance(error)) {
    return 'unexpected';
  }
  const status = error.statusCode;
  if (status === undefined && APICallError.isInstance(error)) return 'network';
  const payload = payloadOf(error);
  const codes = stringsIn(payload, CODE_KEYS);
  if (status === 401 || status === 403 || codes.includes('API_KEY_INVALID')) return 'unauthorized';
  if (
    status === 402 ||
    codes.some((code) => NO_CREDIT_CODES.includes(code)) ||
    (status === 400 && stringsIn(payload, ['message']).some((m) => SPEND_LIMIT_MESSAGE.test(m)))
  ) {
    return 'quota_exceeded';
  }
  // The fixed model was retired, or its id is wrong; only an update can fix it.
  if (status === 404) return 'model_unavailable';
  if (status === 429) return 'rate_limited';
  return 'provider';
}

function statusOf(error: unknown): number | undefined {
  return APICallError.isInstance(error) || StreamProviderError.isInstance(error)
    ? error.statusCode
    : undefined;
}

// The raw body too: Anthropic names its spend cap in a field its parsed data drops.
function payloadOf(error: APICallError | StreamProviderError): unknown {
  return APICallError.isInstance(error)
    ? [error.data, parseJson(error.responseBody)]
    : { type: error.type, data: error.data };
}

function parseJson(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function stringsIn(value: unknown, keys: string[], found: string[] = []): string[] {
  if (typeof value !== 'object' || value === null) return found;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (keys.includes(key) && typeof item === 'string') found.push(item);
    else stringsIn(item, keys, found);
  }
  return found;
}
