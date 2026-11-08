import type { SummarizeRequest, Summarizer, SummaryEvent } from '@dr-too-long/shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { handleConnect, type SummarizePort } from '../src/background/port-server.ts';
import { type ApiKey, writeApiKey } from '../src/settings/api-key.ts';
import { settle } from './helpers.ts';

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

class FakePort implements SummarizePort {
  readonly sent: SummaryEvent[] = [];
  disconnected = false;
  private readonly messageListeners: Array<(message: unknown) => void> = [];
  private readonly disconnectListeners: Array<() => void> = [];

  onMessage = {
    addListener: (listener: (message: unknown) => void) => {
      this.messageListeners.push(listener);
    },
  };

  onDisconnect = {
    addListener: (listener: () => void) => {
      this.disconnectListeners.push(listener);
    },
  };

  postMessage(event: SummaryEvent): void {
    this.sent.push(event);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  receive(message: unknown): void {
    for (const listener of this.messageListeners) listener(message);
  }

  closeFromClient(): void {
    this.disconnected = true;
    for (const listener of this.disconnectListeners) listener();
  }
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
    const port = new FakePort();
    handleConnect(port, createSummarizer);
    port.receive(request);

    await vi.waitFor(() => expect(port.disconnected).toBe(true));
    expect(port.sent).toEqual([{ type: 'error', code: 'no_key' }]);
    expect(createSummarizer).not.toHaveBeenCalled();
  });

  it('creates the summarizer with the saved key and its provider', async () => {
    await writeApiKey(apiKey);
    const createSummarizer = vi.fn(() => summarizerOf([done]));
    const port = new FakePort();
    handleConnect(port, createSummarizer);
    port.receive(request);

    await vi.waitFor(() => expect(port.disconnected).toBe(true));
    expect(createSummarizer).toHaveBeenCalledWith(apiKey);
  });

  it('forwards every event in order and closes the port after the last one', async () => {
    await writeApiKey(apiKey);
    const port = new FakePort();
    handleConnect(port, () => summarizerOf([partial, done]));
    port.receive(request);

    await vi.waitFor(() => expect(port.disconnected).toBe(true));
    expect(port.sent).toEqual([partial, done]);
  });

  it.each([
    ['a listed language', 'tr'],
    ["Chrome's own language, which Auto writes in", 'en-US'],
  ])('summarizes in %s', async (_, outputLanguage) => {
    await writeApiKey(apiKey);
    const received: SummarizeRequest[] = [];
    const port = new FakePort();
    handleConnect(port, () => ({
      async *summarize(sent) {
        received.push(sent);
        yield done;
      },
    }));
    port.receive({ ...request, outputLanguage });

    await vi.waitFor(() => expect(port.disconnected).toBe(true));
    expect(received).toEqual([{ ...request, outputLanguage }]);
  });

  it("refuses a language that is neither listed nor Chrome's own", async () => {
    await writeApiKey(apiKey);
    const createSummarizer = vi.fn();
    const port = new FakePort();
    handleConnect(port, createSummarizer);
    port.receive({ ...request, outputLanguage: 'th' });

    expect(port.disconnected).toBe(true);
    expect(createSummarizer).not.toHaveBeenCalled();
  });

  it('posts nothing once the client has closed the port during the key read', async () => {
    const postMessage = vi.fn();
    const port = new FakePort();
    port.postMessage = postMessage;
    handleConnect(port, vi.fn());
    port.receive(request);
    port.closeFromClient();

    await settle();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('reports an unexpected error when the key cannot be read, and logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValue(new Error('Storage is broken'));
    const port = new FakePort();
    handleConnect(port, vi.fn());
    port.receive(request);

    await vi.waitFor(() => expect(port.disconnected).toBe(true));
    expect(port.sent).toEqual([{ type: 'error', code: 'unexpected' }]);
    expect(log).toHaveBeenCalledOnce();
  });

  it('closes the port without a reply on a malformed request', async () => {
    await writeApiKey(apiKey);
    const createSummarizer = vi.fn();
    const port = new FakePort();
    handleConnect(port, createSummarizer);
    port.receive({ ...request, url: 'https://example.com' });

    expect(port.disconnected).toBe(true);
    expect(port.sent).toEqual([]);
    expect(createSummarizer).not.toHaveBeenCalled();
  });

  it('runs only the first message on a port', async () => {
    await writeApiKey(apiKey);
    const createSummarizer = vi.fn(() => summarizerOf([done]));
    const port = new FakePort();
    handleConnect(port, createSummarizer);
    port.receive(request);
    port.receive(request);

    await vi.waitFor(() => expect(port.disconnected).toBe(true));
    expect(createSummarizer).toHaveBeenCalledTimes(1);
  });

  it('keeps the worker awake during a run and lets it sleep after', async () => {
    await writeApiKey(apiKey);
    const getPlatformInfo = vi.fn();
    fakeBrowser.runtime.getPlatformInfo = getPlatformInfo;
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      let finish: (() => void) | undefined;
      const port = new FakePort();
      handleConnect(port, () => ({
        async *summarize() {
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
          yield done;
        },
      }));
      port.receive(request);
      await vi.waitFor(() => expect(finish).toBeDefined());
      vi.advanceTimersByTime(20_000);
      expect(getPlatformInfo).toHaveBeenCalledOnce();

      finish?.();
      await vi.waitFor(() => expect(port.disconnected).toBe(true));
      vi.advanceTimersByTime(60_000);
      expect(getPlatformInfo).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts the run when the client disconnects mid-stream', async () => {
    await writeApiKey(apiKey);
    let signal: AbortSignal | undefined;
    const summarizer: Summarizer = {
      async *summarize(_request, options) {
        signal = options.signal;
        yield partial;
        await new Promise((resolve) => options.signal.addEventListener('abort', resolve));
        yield done;
      },
    };
    const port = new FakePort();
    handleConnect(port, () => summarizer);
    port.receive(request);

    await vi.waitFor(() => expect(port.sent).toEqual([partial]));
    port.closeFromClient();
    expect(signal?.aborted).toBe(true);
    await settle();
    expect(port.sent).toEqual([partial]);
  });
});
