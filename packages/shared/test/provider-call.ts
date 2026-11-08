import { vi } from 'vitest';
import type { SummarizeRequest, SummaryEvent } from '../src/contracts/index.ts';
import { createSummarizer, providerModel } from '../src/model/index.ts';
import type { ProviderId } from '../src/providers/index.ts';

const request: SummarizeRequest = {
  shape: 'summary',
  outputLanguage: 'en',
  sentences: ['Rivers carve valleys.'],
};

export async function callProvider(provider: ProviderId, respond: () => Response) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => respond());
  vi.stubGlobal('fetch', fetch);
  try {
    const summarizer = createSummarizer(providerModel(provider, 'test-key'));
    const events: SummaryEvent[] = [];
    for await (const event of summarizer.summarize(request, {
      signal: new AbortController().signal,
    })) {
      events.push(event);
    }
    const [url, init] = fetch.mock.calls[0] ?? [];
    return { events, url, init };
  } finally {
    vi.unstubAllGlobals();
  }
}
