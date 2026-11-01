import { APICallError, simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import type { SummarizeRequest, Summarizer, SummaryEvent } from '../src/contracts/index.ts';
import { createSummarizer } from '../src/model/index.ts';

type StreamResult = Awaited<ReturnType<MockLanguageModelV4['doStream']>>;
type StreamPart = StreamResult['stream'] extends ReadableStream<infer Part> ? Part : never;

const request: SummarizeRequest = {
  v: 2,
  preset: 'summary',
  outputLanguage: 'en',
  sentences: ['Rivers carve valleys.', 'Valleys collect towns.', 'Towns grow into cities.'],
};

const usage = {
  inputTokens: { total: 40, noCache: 40, cacheRead: 0, cacheWrite: undefined },
  outputTokens: { total: 12, text: 12, reasoning: 0 },
};

function textParts(deltas: string[]): StreamPart[] {
  return [
    { type: 'text-start', id: '1' },
    ...deltas.map((delta): StreamPart => ({ type: 'text-delta', id: '1', delta })),
    { type: 'text-end', id: '1' },
    { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
  ];
}

function streaming(parts: StreamPart[], chunkDelayInMs: number | null = null): Summarizer {
  const model = new MockLanguageModelV4({
    doStream: async () => ({ stream: simulateReadableStream({ chunks: parts, chunkDelayInMs }) }),
  });
  return createSummarizer({ model });
}

function failing(error: unknown): Summarizer {
  const model = new MockLanguageModelV4({
    doStream: async () => {
      throw error;
    },
  });
  return createSummarizer({ model });
}

async function collect(
  summarizer: Summarizer,
  signal = new AbortController().signal,
): Promise<SummaryEvent[]> {
  const events: SummaryEvent[] = [];
  for await (const event of summarizer.summarize(request, { signal })) events.push(event);
  return events;
}

describe('createSummarizer', () => {
  it('streams partial points and ends with validated output, usage and latency', async () => {
    const events = await collect(
      streaming(
        textParts([
          '{"points":[{"text":"Rivers shape ',
          'where towns grow.","sentences":[1,2]}',
          ',{"text":"Cities follow.","sentences":[3]}]}',
        ]),
      ),
    );

    expect(events[0]).toEqual({
      type: 'partial',
      points: [{ text: 'Rivers shape ', sentences: [] }],
    });
    expect(events.at(-1)).toEqual({
      type: 'done',
      output: {
        points: [
          { text: 'Rivers shape where towns grow.', sentences: [1, 2] },
          { text: 'Cities follow.', sentences: [3] },
        ],
      },
      dropped: 0,
      usage: { inputTokens: 40, outputTokens: 12 },
      latencyMs: expect.any(Number),
    });
  });

  it('sends the prompt the builder given returns', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: textParts(['{"points":[{"text":"Rivers.","sentences":[1]}]}']),
        }),
      }),
    });
    const custom = () => ({ system: 'Custom system.', prompt: 'Custom input.' });
    await collect(createSummarizer({ model }, custom));

    const sent = JSON.stringify(model.doStreamCalls[0]?.prompt);
    expect(sent).toContain('Custom system.');
    expect(sent).toContain('Custom input.');
  });

  it('drops a point that cites no valid sentence and counts it', async () => {
    const events = await collect(
      streaming(
        textParts([
          '{"points":[{"text":"Kept.","sentences":[2]},{"text":"Lost.","sentences":[9]}]}',
        ]),
      ),
    );

    expect(events.at(-1)).toMatchObject({
      type: 'done',
      output: { points: [{ text: 'Kept.', sentences: [2] }] },
      dropped: 1,
    });
  });

  it('reports invalid_output when the model returns no object', async () => {
    const events = await collect(streaming(textParts(['not json'])));
    expect(events).toEqual([
      { type: 'error', code: 'invalid_output', message: expect.any(String) },
    ]);
  });

  it('reports invalid_output when no point survives validation', async () => {
    const events = await collect(
      streaming(textParts(['{"points":[{"text":"","sentences":[1]}]}'])),
    );
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'invalid_output' });
  });

  it.each([
    [401, 'unauthorized'],
    [429, 'rate_limited'],
    [500, 'provider'],
  ])('maps HTTP %i to %s', async (statusCode, code) => {
    const error = new APICallError({
      message: 'failed',
      url: '',
      requestBodyValues: {},
      statusCode,
    });
    expect(await collect(failing(error))).toEqual([
      { type: 'error', code, message: `HTTP ${statusCode}` },
    ]);
  });

  it.each([
    ['a 429 body', { error: { code: 'insufficient_quota' } }],
    ['a failed stream frame', { response: { error: { code: 'insufficient_quota' } } }],
    ['an error stream frame', { type: 'error', code: 'insufficient_quota' }],
  ])('reports quota_exceeded when %s names insufficient_quota', async (_, data) => {
    const error = new APICallError({
      message: 'failed',
      url: '',
      requestBodyValues: {},
      statusCode: 429,
      data,
    });
    expect(await collect(failing(error))).toEqual([
      { type: 'error', code: 'quota_exceeded', message: 'HTTP 429' },
    ]);
  });

  it('keeps rate_limited for a 429 with another error code', async () => {
    const error = new APICallError({
      message: 'failed',
      url: '',
      requestBodyValues: {},
      statusCode: 429,
      data: { error: { code: 'rate_limit_exceeded' } },
    });
    expect(await collect(failing(error))).toEqual([
      { type: 'error', code: 'rate_limited', message: 'HTTP 429' },
    ]);
  });

  it('reports network when the request never reaches the provider', async () => {
    const events = await collect(failing(new TypeError('Failed to fetch')));
    expect(events).toEqual([{ type: 'error', code: 'network', message: 'TypeError' }]);
  });

  it('reports aborted when the signal fires mid-stream', async () => {
    const controller = new AbortController();
    const summarizer = streaming(
      textParts(['{"points":[{"text":"Slow ', 'river.","sentences":[1]}]}']),
      10,
    );
    const events: SummaryEvent[] = [];
    for await (const event of summarizer.summarize(request, { signal: controller.signal })) {
      events.push(event);
      controller.abort();
    }

    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'aborted' });
  });
});
