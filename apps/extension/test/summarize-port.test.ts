import type { SummaryEvent } from '@dr-too-long/shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type PortRequest, portSummarizer } from '../src/summarize-port.ts';

// Mirrors chrome.runtime.Port: disconnect() reaches the other end only and ends delivery here.
class FakePort {
  disconnects = 0;
  readonly sent: unknown[] = [];
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

  postMessage(message: unknown): void {
    this.sent.push(message);
  }

  disconnect(): void {
    this.disconnects += 1;
  }

  deliver(event: SummaryEvent): void {
    if (this.disconnects === 0) for (const listener of this.messageListeners) listener(event);
  }

  closeFromWorker(): void {
    for (const listener of this.disconnectListeners) listener();
  }
}

let port: FakePort;
vi.mock('wxt/browser', () => ({ browser: { runtime: { connect: () => port } } }));

const request: PortRequest = { v: 1, preset: 'summary', sentences: ['One.'] };
const partial: SummaryEvent = { type: 'partial', points: [{ text: 'One', sentences: [1] }] };
const done: SummaryEvent = {
  type: 'done',
  output: { points: [{ text: 'One.', sentences: [1] }] },
  dropped: 0,
  latencyMs: 5,
};

function start(signal = new AbortController().signal) {
  return portSummarizer.summarize(request, { signal })[Symbol.asyncIterator]();
}

describe('portSummarizer', () => {
  beforeEach(() => {
    port = new FakePort();
  });

  it('sends the request and yields events until the terminal one', async () => {
    const events = start();
    const first = events.next();
    expect(port.sent).toEqual([request]);
    port.deliver(partial);
    port.deliver(done);
    expect((await first).value).toEqual(partial);
    expect((await events.next()).value).toEqual(done);
    expect((await events.next()).done).toBe(true);
    expect(port.disconnects).toBe(1);
  });

  it('yields disconnected when the worker closes the port first', async () => {
    const events = start();
    const first = events.next();
    port.closeFromWorker();
    expect((await first).value).toMatchObject({ type: 'error', code: 'disconnected' });
    expect((await events.next()).done).toBe(true);
  });

  it('yields aborted and ends when the caller aborts mid-stream', async () => {
    const controller = new AbortController();
    const events = start(controller.signal);
    const first = events.next();
    port.deliver(partial);
    expect((await first).value).toEqual(partial);
    const second = events.next();
    controller.abort();
    expect((await second).value).toMatchObject({ type: 'error', code: 'aborted' });
    expect((await events.next()).done).toBe(true);
    expect(port.disconnects).toBeGreaterThanOrEqual(1);
  });
});
