import type { SummarizeRequest, SummaryEvent } from '@dr-too-long/shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { portSummarizer, SUMMARIZE_PORT } from '../src/summarize-port.ts';
import { connectWorker, type PortEnd } from './ports.ts';

const request: SummarizeRequest = {
  shape: 'summary',
  outputLanguage: 'en',
  sentences: ['One.'],
};
const partial: SummaryEvent = { type: 'partial', points: [{ text: 'One', sentences: [1] }] };
const done: SummaryEvent = {
  type: 'done',
  output: { points: [{ text: 'One.', sentences: [1] }] },
};

let workerEnd: PortEnd | undefined;
let received: unknown[];
let cardLeft: boolean;

function start(signal = new AbortController().signal) {
  const events = portSummarizer.summarize(request, { signal })[Symbol.asyncIterator]();
  const first = events.next();
  if (!workerEnd) throw new Error('The card never connected');
  return { events, first, worker: workerEnd };
}

describe('portSummarizer', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    workerEnd = undefined;
    received = [];
    cardLeft = false;
    connectWorker((worker) => {
      workerEnd = worker;
      worker.onMessage.addListener((message) => received.push(message));
      worker.onDisconnect.addListener(() => {
        cardLeft = true;
      });
    });
  });

  it('sends the request on the summarize port and yields events until the terminal one', async () => {
    const { events, first, worker } = start();
    expect(worker.name).toBe(SUMMARIZE_PORT);
    await vi.waitFor(() => expect(received).toEqual([request]));
    worker.postMessage(partial);
    worker.postMessage(done);
    expect((await first).value).toEqual(partial);
    expect((await events.next()).value).toEqual(done);
    expect((await events.next()).done).toBe(true);
    await vi.waitFor(() => expect(cardLeft).toBe(true));
  });

  it('yields disconnected when the worker closes the port first', async () => {
    const { events, first, worker } = start();
    worker.disconnect();
    expect((await first).value).toEqual({ type: 'error', code: 'disconnected' });
    expect((await events.next()).done).toBe(true);
  });

  it('yields aborted and closes the port when the caller aborts mid-stream', async () => {
    const controller = new AbortController();
    const { events, first, worker } = start(controller.signal);
    worker.postMessage(partial);
    expect((await first).value).toEqual(partial);
    const second = events.next();
    controller.abort();
    expect((await second).value).toEqual({ type: 'error', code: 'aborted' });
    expect((await events.next()).done).toBe(true);
    await vi.waitFor(() => expect(cardLeft).toBe(true));
  });
});
