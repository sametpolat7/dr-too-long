import { type DeepPartial, Output, streamText } from 'ai';
import {
  type Point,
  type Summarizer,
  type SummaryOutput,
  summaryOutputSchema,
} from '../contracts/index.ts';
import { toErrorEvent } from './error-event.ts';
import { buildPrompt } from './prompts.ts';
import type { ModelSetup } from './provider-model.ts';
import { validateOutput } from './validate.ts';

// A handful of points and the JSON around them fit well within this.
const MAX_OUTPUT_TOKENS = 1024;
// A provider that stops sending would otherwise hold the card on "Summarizing…" and keep the
// worker awake.
const FIRST_CHUNK_MS = 30_000;
const NEXT_CHUNK_MS = 15_000;

export function createSummarizer({ model, providerOptions }: ModelSetup): Summarizer {
  return {
    async *summarize(request, { signal }) {
      const call = watchCall(signal);
      let failure: unknown;
      const result = streamText({
        model,
        ...buildPrompt(request),
        output: Output.object({ schema: summaryOutputSchema, name: 'summary' }),
        providerOptions,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxRetries: 0,
        abortSignal: call.signal,
        onChunk: call.chunkArrived,
        onError: ({ error }) => {
          failure = error;
        },
      });

      try {
        for await (const partial of result.partialOutputStream) {
          yield { type: 'partial', points: partialPoints(partial) };
        }
        const points = validateOutput(await result.output, request.sentences.length);
        yield points.length > 0
          ? { type: 'done', output: { points } }
          : { type: 'error', code: 'invalid_output' };
      } catch (caught) {
        yield call.stalled()
          ? { type: 'error', code: 'timed_out' }
          : toErrorEvent(failure ?? caught, signal);
      } finally {
        call.end();
      }
    },
  };
}

// Aborts the call when the reader cancels or when the provider goes quiet. The SDK's own timeout
// option merges signals with AbortSignal.any, from Chrome 116; the floor is 114.
function watchCall(signal: AbortSignal) {
  const controller = new AbortController();
  const stall = new Error('The provider stopped sending');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wait = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(stall), ms);
  };
  const cancel = () => controller.abort(signal.reason);
  if (signal.aborted) cancel();
  else signal.addEventListener('abort', cancel, { once: true });
  wait(FIRST_CHUNK_MS);
  return {
    signal: controller.signal,
    chunkArrived: () => wait(NEXT_CHUNK_MS),
    stalled: () => controller.signal.reason === stall,
    end: () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
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
