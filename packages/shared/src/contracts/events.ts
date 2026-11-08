import type { Point, SummaryOutput } from './output.ts';
import type { SummarizeRequest } from './request.ts';

export type ErrorCode =
  | 'no_key'
  | 'unauthorized'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'network'
  | 'timed_out'
  | 'model_unavailable'
  | 'aborted'
  | 'disconnected'
  | 'invalidated'
  | 'invalid_output'
  | 'no_selection'
  | 'too_long'
  | 'unsupported_selection'
  | 'provider'
  | 'unexpected';

export type SummaryEvent =
  | { type: 'partial'; points: Point[] }
  | { type: 'done'; output: SummaryOutput }
  // The provider's HTTP status, when it answered with one.
  | { type: 'error'; code: ErrorCode; httpStatus?: number };

export interface Summarizer {
  summarize(
    request: SummarizeRequest,
    options: { signal: AbortSignal },
  ): AsyncIterable<SummaryEvent>;
}
