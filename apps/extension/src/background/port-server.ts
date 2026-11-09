import {
  type SummarizeRequest,
  type Summarizer,
  type SummaryEvent,
  summarizeRequestSchema,
} from '@dr-too-long/shared/contracts';
import { reportUnexpected } from '@dr-too-long/shared/model';
import { browser } from 'wxt/browser';
import { isListedLanguage } from '../languages.ts';
import { type ApiKey, readApiKey } from '../settings/api-key.ts';
import { SUMMARIZE_PORT } from '../summarize-port.ts';
import { keepAlive } from './keep-alive.ts';

// The card asks for a listed language, or for Chrome's own when the reader chose Auto.
const portRequestSchema = summarizeRequestSchema.refine(
  ({ outputLanguage }) =>
    isListedLanguage(outputLanguage) || outputLanguage === browser.i18n.getUILanguage(),
);

type CreateSummarizer = (apiKey: ApiKey) => Summarizer;

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

// A malformed request closes the port without a reply.
export function handleConnect(port: SummarizePort, createSummarizer: CreateSummarizer): void {
  const controller = new AbortController();
  let started = false;

  port.onDisconnect.addListener(() => controller.abort());
  port.onMessage.addListener((message) => {
    if (started) return;
    started = true;
    const request = portRequestSchema.safeParse(message);
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
  const release = keepAlive();
  try {
    const apiKey = await readApiKey();
    // The card closes its port when the reader closes it or starts another run; a closed port takes
    // no messages.
    if (signal.aborted) return;
    if (!apiKey) {
      port.postMessage({ type: 'error', code: 'no_key' });
      return;
    }
    for await (const event of createSummarizer(apiKey).summarize(request, { signal })) {
      if (signal.aborted) return;
      port.postMessage(event);
    }
  } catch (error) {
    // Such as a failed storage read: the card still hears that the run ended.
    reportUnexpected(error);
    if (!signal.aborted) port.postMessage({ type: 'error', code: 'unexpected' });
  } finally {
    release();
    port.disconnect();
  }
}
