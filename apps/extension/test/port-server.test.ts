import type { SummarizeRequest, Summarizer, SummaryEvent } from '@dr-too-long/shared/contracts';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { handleConnect } from '../src/background/port-server.ts';
import { type ApiKey, writeApiKey } from '../src/settings/api-key.ts';
import { SUMMARIZE_PORT } from '../src/summarize-port.ts';
import { settle } from './helpers.ts';
import { linkedPorts } from './ports.ts';

const request: SummarizeRequest = {
  shape: 'summary',
  outputLanguage: 'tr',
  sentences: ['One.', 'Two.'],
};
const apiKey: ApiKey = { provider: 'anthropic', key: 'test-claude-key' };
const partial: SummaryEvent = { type: 'partial', points: [{ text: 'One', sentences: [1] }] };
const done: SummaryEvent = {
  type: 'done',
  output: { points: [{ text: 'One and two.', sentences: [1, 2] }] },
};

function connect(createSummarizer: Parameters<typeof handleConnect>[1]) {
  const [card, worker] = linkedPorts(SUMMARIZE_PORT);
  const sent: SummaryEvent[] = [];
  let closed = false;
  card.onMessage.addListener((event: SummaryEvent) => sent.push(event));
  card.onDisconnect.addListener(() => {
    closed = true;
  });
  handleConnect(worker, createSummarizer);
  return { card, worker, sent, closed: () => closed };
}

function summarizerOf(events: SummaryEvent[]): Summarizer {
  return {
    async *summarize() {
      yield* events;
    },
  };
}

describe('handleConnect', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    fakeBrowser.i18n.getUILanguage = () => 'en-US';
  });

  it('answers no_key and closes the port when no key is saved', async () => {
    const createSummarizer = vi.fn();
    const { card, sent, closed } = connect(createSummarizer);
    card.postMessage(request);

    await vi.waitFor(() => expect(closed()).toBe(true));
    expect(sent).toEqual([{ type: 'error', code: 'no_key' }]);
    expect(createSummarizer).not.toHaveBeenCalled();
  });

  it('creates the summarizer with the saved key and its provider', async () => {
    await writeApiKey(apiKey);
    const createSummarizer = vi.fn(() => summarizerOf([done]));
    const { card, closed } = connect(createSummarizer);
    card.postMessage(request);

    await vi.waitFor(() => expect(closed()).toBe(true));
    expect(createSummarizer).toHaveBeenCalledWith(apiKey);
  });

  it('forwards every event in order and closes the port after the last one', async () => {
    await writeApiKey(apiKey);
    const { card, sent, closed } = connect(() => summarizerOf([partial, done]));
    card.postMessage(request);

    await vi.waitFor(() => expect(closed()).toBe(true));
    expect(sent).toEqual([partial, done]);
  });

  it.each([
    ['a listed language', 'tr'],
    ["Chrome's own language, which Auto writes in", 'en-US'],
  ])('summarizes in %s', async (_, outputLanguage) => {
    await writeApiKey(apiKey);
    const received: SummarizeRequest[] = [];
    const { card, closed } = connect(() => ({
      async *summarize(sent) {
        received.push(sent);
        yield done;
      },
    }));
    card.postMessage({ ...request, outputLanguage });

    await vi.waitFor(() => expect(closed()).toBe(true));
    expect(received).toEqual([{ ...request, outputLanguage }]);
  });

  it("refuses a language that is neither listed nor Chrome's own", async () => {
    await writeApiKey(apiKey);
    const createSummarizer = vi.fn();
    const { card, sent, closed } = connect(createSummarizer);
    card.postMessage({ ...request, outputLanguage: 'th' });

    await vi.waitFor(() => expect(closed()).toBe(true));
    expect(sent).toEqual([]);
    expect(createSummarizer).not.toHaveBeenCalled();
  });

  it('closes the port without a reply on a malformed request', async () => {
    await writeApiKey(apiKey);
    const createSummarizer = vi.fn();
    const { card, sent, closed } = connect(createSummarizer);
    card.postMessage({ ...request, url: 'https://example.com' });

    await vi.waitFor(() => expect(closed()).toBe(true));
    expect(sent).toEqual([]);
    expect(createSummarizer).not.toHaveBeenCalled();
  });

  it('runs only the first message on a port', async () => {
    await writeApiKey(apiKey);
    const createSummarizer = vi.fn(() => summarizerOf([done]));
    const { card, closed } = connect(createSummarizer);
    card.postMessage(request);
    card.postMessage(request);

    await vi.waitFor(() => expect(closed()).toBe(true));
    expect(createSummarizer).toHaveBeenCalledOnce();
  });

  it('posts nothing once the card has closed the port during the key read', async () => {
    const { card, worker } = connect(vi.fn());
    const post = vi.spyOn(worker, 'postMessage');
    card.postMessage(request);
    card.disconnect();

    await settle();
    expect(post).not.toHaveBeenCalled();
  });

  it('reports an unexpected error when the key cannot be read, and logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValue(new Error('Storage is broken'));
    const { card, sent, closed } = connect(vi.fn());
    card.postMessage(request);

    await vi.waitFor(() => expect(closed()).toBe(true));
    expect(sent).toEqual([{ type: 'error', code: 'unexpected' }]);
    expect(log).toHaveBeenCalledOnce();
  });

  it('keeps the worker awake during a run and lets it sleep after', async () => {
    await writeApiKey(apiKey);
    const getPlatformInfo = vi.fn();
    fakeBrowser.runtime.getPlatformInfo = getPlatformInfo;
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    onTestFinished(() => void vi.useRealTimers());
    let finish: (() => void) | undefined;
    const { card, closed } = connect(() => ({
      async *summarize() {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        yield done;
      },
    }));
    card.postMessage(request);
    await vi.waitFor(() => expect(finish).toBeDefined());
    vi.advanceTimersByTime(20_000);
    expect(getPlatformInfo).toHaveBeenCalledOnce();

    finish?.();
    await vi.waitFor(() => expect(closed()).toBe(true));
    vi.advanceTimersByTime(60_000);
    expect(getPlatformInfo).toHaveBeenCalledOnce();
  });

  it('aborts the run when the card disconnects mid-stream', async () => {
    await writeApiKey(apiKey);
    let signal: AbortSignal | undefined;
    const { card, worker, sent } = connect(() => ({
      async *summarize(_request, options) {
        signal = options.signal;
        yield partial;
        await new Promise((resolve) => options.signal.addEventListener('abort', resolve));
        yield done;
      },
    }));
    const post = vi.spyOn(worker, 'postMessage');
    card.postMessage(request);

    await vi.waitFor(() => expect(sent).toEqual([partial]));
    card.disconnect();
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
    await settle();
    expect(post.mock.calls).toEqual([[partial]]);
  });
});
