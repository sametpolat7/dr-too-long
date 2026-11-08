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

export function createSummarizer({ model, providerOptions }: ModelSetup): Summarizer {
  return {
    async *summarize(request, { signal }) {
      let failure: unknown;
      const result = streamText({
        model,
        ...buildPrompt(request),
        output: Output.object({ schema: summaryOutputSchema, name: 'summary' }),
        providerOptions,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxRetries: 0,
        abortSignal: signal,
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
        yield toErrorEvent(failure ?? caught, signal);
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
