import type { Point, SummaryOutput } from './output.ts';
import type { SummarizeRequest } from './request.ts';

export type ErrorCode =
  | 'no_key'
  | 'unauthorized'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'network'
  | 'aborted'
  | 'disconnected'
  | 'invalid_output'
  | 'too_long'
  | 'unsupported_selection'
  | 'provider';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export type SummaryEvent =
  | { type: 'partial'; points: Point[] }
  | { type: 'done'; output: SummaryOutput; dropped: number; usage?: TokenUsage; latencyMs: number }
  | { type: 'error'; code: ErrorCode; message: string };

export interface Summarizer {
  summarize(
    request: SummarizeRequest,
    options: { signal: AbortSignal },
  ): AsyncIterable<SummaryEvent>;
}
