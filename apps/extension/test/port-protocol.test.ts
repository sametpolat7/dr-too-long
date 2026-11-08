import type { SummarizeRequest, Summarizer, SummaryEvent } from '@dr-too-long/shared/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { handleConnect } from '../src/background/port-server.ts';
import { writeApiKey } from '../src/settings/api-key.ts';
import { portSummarizer, SUMMARIZE_PORT } from '../src/summarize-port.ts';
import { linkedPorts } from './ports.ts';

const request: SummarizeRequest = { shape: 'summary', outputLanguage: 'en', sentences: ['One.'] };
const partial: SummaryEvent = { type: 'partial', points: [{ text: 'One', sentences: [1] }] };
const done: SummaryEvent = { type: 'done', output: { points: [{ text: 'One.', sentences: [1] }] } };

// The card's end of the port talks to the worker's, as in Chrome.
function serve(summarizer: Summarizer): void {
  Object.assign(fakeBrowser.runtime, {
    connect: ({ name }: { name: string }) => {
      const [client, worker] = linkedPorts(name);
      if (name === SUMMARIZE_PORT) handleConnect(worker, () => summarizer);
      return client;
    },
  });
}

async function collect(signal = new AbortController().signal): Promise<SummaryEvent[]> {
  const events: SummaryEvent[] = [];
  for await (const event of portSummarizer.summarize(request, { signal })) events.push(event);
  return events;
}

describe('the summarize port between a card and the worker', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    fakeBrowser.i18n.getUILanguage = () => 'en-US';
  });

  it('carries the request there and every event back, then ends', async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    const received: SummarizeRequest[] = [];
    serve({
      async *summarize(sent) {
        received.push(sent);
        yield partial;
        yield done;
      },
    });
    expect(await collect()).toEqual([partial, done]);
    expect(received).toEqual([request]);
  });

  it('tells the card when no key is saved', async () => {
    serve({ async *summarize() {} });
    expect(await collect()).toEqual([{ type: 'error', code: 'no_key' }]);
  });

  it('cancels the model call when the card stops listening', async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    let modelSignal: AbortSignal | undefined;
    serve({
      async *summarize(_, { signal }) {
        modelSignal = signal;
        yield partial;
        await new Promise((resolve) => signal.addEventListener('abort', resolve));
      },
    });
    const card = new AbortController();
    const events: SummaryEvent[] = [];
    for await (const event of portSummarizer.summarize(request, { signal: card.signal })) {
      events.push(event);
      card.abort();
    }
    expect(events).toEqual([partial, { type: 'error', code: 'aborted' }]);
    expect(modelSignal?.aborted).toBe(true);
  });
});
