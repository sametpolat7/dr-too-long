import type { SummarizeRequest, SummaryEvent } from '@dr-too-long/shared/contracts';
import { browser } from 'wxt/browser';

export const SUMMARIZE_PORT = 'summarize';

export const portSummarizer = {
  async *summarize(
    request: SummarizeRequest,
    { signal }: { signal: AbortSignal },
  ): AsyncGenerator<SummaryEvent> {
    const port = browser.runtime.connect({ name: SUMMARIZE_PORT });
    const pending: SummaryEvent[] = [];
    let closed = false;
    let wake: () => void = () => undefined;

    port.onMessage.addListener((event: SummaryEvent) => {
      pending.push(event);
      wake();
    });
    port.onDisconnect.addListener(() => {
      closed = true;
      wake();
    });
    signal.addEventListener(
      'abort',
      () => {
        port.disconnect();
        closed = true;
        wake();
      },
      { once: true },
    );
    port.postMessage(request);

    try {
      for (;;) {
        const event = pending.shift();
        if (event) {
          yield event;
          if (event.type !== 'partial') return;
        } else if (closed) {
          yield {
            type: 'error',
            code: signal.aborted ? 'aborted' : 'disconnected',
            message: 'The connection to the background worker closed',
          };
          return;
        } else {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      }
    } finally {
      port.disconnect();
    }
  },
};

export type PortSummarizer = typeof portSummarizer;
