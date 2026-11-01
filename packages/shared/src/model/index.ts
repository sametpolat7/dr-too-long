import {
  APICallError,
  type DeepPartial,
  type LanguageModelUsage,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  streamText,
} from 'ai';
import { z } from 'zod';
import {
  buildPrompt,
  type ErrorCode,
  type Point,
  type PromptBuilder,
  type Summarizer,
  type SummaryEvent,
  type SummaryOutput,
  summaryOutputSchema,
  type TokenUsage,
  validateOutput,
} from '../contracts/index.ts';
import type { ModelSetup } from '../providers/index.ts';

// A handful of points and the JSON around them fit well within this.
const MAX_OUTPUT_TOKENS = 1024;

export function createSummarizer(
  { model, providerOptions }: ModelSetup,
  prompt: PromptBuilder = buildPrompt,
): Summarizer {
  return {
    async *summarize(request, { signal }) {
      const started = performance.now();
      let failure: unknown;
      const result = streamText({
        model,
        ...prompt(request),
        output: Output.object({ schema: summaryOutputSchema, name: 'summary' }),
        providerOptions,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxRetries: 0,
        abortSignal: signal,
        onError: ({ error }: { error: unknown }) => {
          failure = error;
        },
      });

      try {
        for await (const partial of result.partialOutputStream) {
          yield { type: 'partial', points: partialPoints(partial) };
        }
        const output = await result.output;
        const validated = validateOutput(output, request.sentences.length);
        if (validated.points.length === 0) {
          yield errorEvent('invalid_output', 'No point survived validation');
          return;
        }
        yield {
          type: 'done',
          output: { points: validated.points },
          dropped: validated.dropped,
          usage: tokenUsage(await result.usage),
          latencyMs: Math.round(performance.now() - started),
        };
      } catch (caught) {
        const error = failure ?? caught;
        yield errorEvent(toErrorCode(error, signal), describe(error));
      }
    },
  };
}

function partialPoints(partial: DeepPartial<SummaryOutput>): Point[] {
  return (partial.points ?? []).flatMap((point) =>
    point?.text
      ? [
          {
            text: point.text,
            sentences: (point.sentences ?? []).filter((n) => typeof n === 'number'),
          },
        ]
      : [],
  );
}

function tokenUsage({ inputTokens, outputTokens }: LanguageModelUsage): TokenUsage | undefined {
  return inputTokens === undefined || outputTokens === undefined
    ? undefined
    : { inputTokens, outputTokens };
}

function errorEvent(code: ErrorCode, message: string): SummaryEvent {
  return { type: 'error', code, message };
}

const providerError = z.object({ code: z.string() });

// OpenAI puts its error object at the top of a 429 body or inside a failed stream frame.
const providerErrorSchema = z.union([
  z.object({ error: providerError }).transform(({ error }) => error),
  z
    .object({ response: z.object({ error: providerError }) })
    .transform(({ response }) => response.error),
  providerError,
]);

function toErrorCode(error: unknown, signal: AbortSignal): ErrorCode {
  if (signal.aborted) return 'aborted';
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401) return 'unauthorized';
    if (error.statusCode === 429) return hasNoCredit(error) ? 'quota_exceeded' : 'rate_limited';
    return error.statusCode === undefined ? 'network' : 'provider';
  }
  if (error instanceof TypeError) return 'network';
  if (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error)) {
    return 'invalid_output';
  }
  return 'provider';
}

// An empty balance is a 429 with code insufficient_quota, also when it ends a stream behind a 200.
function hasNoCredit(error: APICallError): boolean {
  const parsed = providerErrorSchema.safeParse(error.data);
  return parsed.success && parsed.data.code === 'insufficient_quota';
}

// Never the provider's own message: an OpenAI 401 body echoes part of the key.
function describe(error: unknown): string {
  if (APICallError.isInstance(error)) {
    return error.statusCode === undefined
      ? 'No response from the provider'
      : `HTTP ${error.statusCode}`;
  }
  return error instanceof Error ? error.name : 'Unknown error';
}
