import {
  type SummarizeRequest,
  type Summarizer,
  type SummaryEvent,
  summarizeRequestSchema,
} from '@dr-too-long/shared/contracts';
import { browser } from 'wxt/browser';
import { readApiKey } from '../settings/api-key.ts';
import { SUMMARIZE_PORT } from '../summarize-port.ts';
import { keepAlive } from './keep-alive.ts';

export type CreateSummarizer = (apiKey: string) => Summarizer;

// The slice of chrome.runtime.Port the server uses; tests pass a fake.
export interface SummarizePort {
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
  postMessage(event: SummaryEvent): void;
  disconnect(): void;
}

export function startPortServer(createSummarizer: CreateSummarizer): void {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name === SUMMARIZE_PORT) handleConnect(port, createSummarizer);
  });
}

// One request per connection. A malformed request closes the port without a reply.
export function handleConnect(port: SummarizePort, createSummarizer: CreateSummarizer): void {
  const controller = new AbortController();
  let started = false;

  port.onDisconnect.addListener(() => controller.abort());
  port.onMessage.addListener((message) => {
    if (started) return;
    started = true;
    const request = summarizeRequestSchema.safeParse(message);
    if (request.success) {
      void run(port, request.data, createSummarizer, controller.signal);
    } else {
      port.disconnect();
    }
  });
}

async function run(
  port: SummarizePort,
  request: SummarizeRequest,
  createSummarizer: CreateSummarizer,
  signal: AbortSignal,
): Promise<void> {
  const apiKey = await readApiKey();
  if (!apiKey) {
    port.postMessage({ type: 'error', code: 'no_key', message: 'No API key is saved' });
    port.disconnect();
    return;
  }

  const release = keepAlive();
  try {
    for await (const event of createSummarizer(apiKey).summarize(request, { signal })) {
      if (signal.aborted) return;
      port.postMessage(event);
    }
  } finally {
    release();
    port.disconnect();
  }
}
