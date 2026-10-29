import type { SummarizeRequest, Summarizer, SummaryEvent } from '@dr-too-long/shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { handleConnect, type SummarizePort } from '../src/background/port-server.ts';
import { writeApiKey } from '../src/settings/api-key.ts';
import { writeLanguageChoice } from '../src/settings/output-language.ts';
import type { PortRequest } from '../src/summarize-port.ts';

const request: PortRequest = { v: 1, preset: 'summary', sentences: ['One.', 'Two.'] };
const partial: SummaryEvent = { type: 'partial', points: [{ text: 'One', sentences: [1] }] };
const done: SummaryEvent = {
  type: 'done',
  output: { points: [{ text: 'One and two.', sentences: [1, 2] }] },
  dropped: 0,
  latencyMs: 5,
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
    expect(port.sent).toEqual([{ type: 'error', code: 'no_key', message: expect.any(String) }]);
    expect(createSummarizer).not.toHaveBeenCalled();
  });

  it('forwards every event in order and closes the port after the last one', async () => {
    await writeApiKey('secret');
    const port = new FakePort();
    handleConnect(port, () => summarizerOf([partial, done]));
    port.receive(request);

    await vi.waitFor(() => expect(port.disconnected).toBe(true));
    expect(port.sent).toEqual([partial, done]);
  });

  it.each([
    ["Chrome's UI language", null, 'en-US'],
    ['the chosen language', 'tr', 'tr'],
  ])('summarizes in %s', async (_, choice, outputLanguage) => {
    await writeApiKey('secret');
    await writeLanguageChoice(choice);
    const received: SummarizeRequest[] = [];
    const port = new FakePort();
    handleConnect(port, () => ({
      async *summarize(sent) {
        received.push(sent);
        yield done;
      },
    }));
    port.receive(request);

    await vi.waitFor(() => expect(port.disconnected).toBe(true));
    expect(received).toEqual([{ ...request, outputLanguage }]);
  });

  it('refuses a request that names its own output language', async () => {
    await writeApiKey('secret');
    const createSummarizer = vi.fn();
    const port = new FakePort();
    handleConnect(port, createSummarizer);
    port.receive({ ...request, outputLanguage: 'tr' });

    expect(port.disconnected).toBe(true);
    expect(createSummarizer).not.toHaveBeenCalled();
  });

  it('posts nothing once the client has closed the port during the settings read', async () => {
    const postMessage = vi.fn();
    const port = new FakePort();
    port.postMessage = postMessage;
    handleConnect(port, vi.fn());
    port.receive(request);
    port.closeFromClient();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('closes the port without a reply on a malformed request', async () => {
    await writeApiKey('secret');
    const createSummarizer = vi.fn();
    const port = new FakePort();
    handleConnect(port, createSummarizer);
    port.receive({ ...request, url: 'https://example.com' });

    expect(port.disconnected).toBe(true);
    expect(port.sent).toEqual([]);
    expect(createSummarizer).not.toHaveBeenCalled();
  });

  it('runs only the first message on a port', async () => {
    await writeApiKey('secret');
    const createSummarizer = vi.fn(() => summarizerOf([done]));
    const port = new FakePort();
    handleConnect(port, createSummarizer);
    port.receive(request);
    port.receive(request);

    await vi.waitFor(() => expect(port.disconnected).toBe(true));
    expect(createSummarizer).toHaveBeenCalledTimes(1);
  });

  it('aborts the run when the client disconnects mid-stream', async () => {
    await writeApiKey('secret');
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
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(port.sent).toEqual([partial]);
  });
});
