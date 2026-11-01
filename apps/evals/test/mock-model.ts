import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>;
type StreamResult = Awaited<ReturnType<MockLanguageModelV4['doStream']>>;
type StreamPart = StreamResult['stream'] extends ReadableStream<infer Part> ? Part : never;

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};
const finishReason = { unified: 'stop', raw: 'stop' } as const;

export function textModel(text: string): MockLanguageModelV4 {
  const generated: GenerateResult = {
    content: [{ type: 'text', text }],
    finishReason,
    usage,
    warnings: [],
  };
  const parts: StreamPart[] = [
    { type: 'text-start', id: '1' },
    { type: 'text-delta', id: '1', delta: text },
    { type: 'text-end', id: '1' },
    { type: 'finish', finishReason, usage },
  ];
  return new MockLanguageModelV4({
    doGenerate: async () => generated,
    doStream: async () => ({ stream: simulateReadableStream({ chunks: parts }) }),
  });
}

export function failingModel(error: unknown): MockLanguageModelV4 {
  const fail = async () => {
    throw error;
  };
  return new MockLanguageModelV4({ doGenerate: fail, doStream: fail });
}
