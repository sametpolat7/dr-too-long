import type { PresetId, SummaryEvent } from '@dr-too-long/shared/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { CardState } from '../src/content/card/Card.tsx';
import { createRuns } from '../src/content/runs.ts';
import type { PortRequest, PortSummarizer } from '../src/summarize-port.ts';

const point = (text: string) => ({ text, sentences: [1] });
const doneEvent = (text: string): SummaryEvent => ({
  type: 'done',
  output: { points: [point(text)] },
  dropped: 0,
  latencyMs: 5,
});

interface Call {
  request: PortRequest;
  signal: AbortSignal;
  send(event: SummaryEvent): void;
}

// Each call streams what the test sends it, and ends after a terminal event or an abort.
function fakeSummarizer() {
  const calls: Call[] = [];
  const summarizer: PortSummarizer = {
    async *summarize(request, { signal }) {
      const queue: SummaryEvent[] = [];
      let wake: () => void = () => undefined;
      calls.push({
        request,
        signal,
        send(event) {
          queue.push(event);
          wake();
        },
      });
      signal.addEventListener('abort', () => wake());
      for (;;) {
        const event = queue.shift();
        if (event) {
          yield event;
          if (event.type !== 'partial') return;
        } else if (signal.aborted) {
          yield { type: 'error', code: 'aborted', message: 'Aborted' };
          return;
        } else {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      }
    },
  };
  return { summarizer, calls };
}

function setup() {
  const { summarizer, calls } = fakeSummarizer();
  const shown: Array<[PresetId, CardState]> = [];
  const card = new AbortController();
  const runs = createRuns({
    summarizer,
    sentences: ['One.', 'Two.'],
    initial: 'summary',
    show: (preset, state) => shown.push([preset, state]),
    signal: card.signal,
  });
  const last = () => shown.at(-1);
  return { runs, calls, shown, last, card };
}

describe('createRuns', () => {
  it('starts with the initial preset over the sentences and shows its states', async () => {
    const { calls, last } = setup();
    expect(last()).toEqual(['summary', { status: 'summarizing', points: [] }]);
    expect(calls[0]?.request).toEqual({ v: 1, preset: 'summary', sentences: ['One.', 'Two.'] });

    calls[0]?.send({ type: 'partial', points: [point('Half')] });
    await vi.waitFor(() =>
      expect(last()).toEqual(['summary', { status: 'summarizing', points: [point('Half')] }]),
    );
    calls[0]?.send(doneEvent('Whole.'));
    await vi.waitFor(() =>
      expect(last()).toEqual([
        'summary',
        { status: 'done', points: [point('Whole.')], dropped: 0 },
      ]),
    );
  });

  it('aborts the run in flight on a switch and never shows its later events', async () => {
    const { runs, calls, shown, last } = setup();
    runs.select('bulleted-list');
    expect(calls[0]?.signal.aborted).toBe(true);
    expect(calls[1]?.request.preset).toBe('bulleted-list');

    calls[0]?.send(doneEvent('Stale.'));
    calls[1]?.send(doneEvent('Fresh.'));
    await vi.waitFor(() => expect(last()?.[1]).toMatchObject({ status: 'done' }));
    expect(shown.filter(([preset]) => preset === 'summary')).toHaveLength(1);
    expect(last()).toEqual([
      'bulleted-list',
      { status: 'done', points: [point('Fresh.')], dropped: 0 },
    ]);
  });

  it('shows a done preset again from memory without a new request', async () => {
    const { runs, calls, last } = setup();
    calls[0]?.send(doneEvent('Kept.'));
    await vi.waitFor(() => expect(last()?.[1]).toMatchObject({ status: 'done' }));

    runs.select('single-sentence');
    runs.select('summary');
    expect(calls).toHaveLength(2);
    expect(calls[1]?.signal.aborted).toBe(true);
    expect(last()).toEqual(['summary', { status: 'done', points: [point('Kept.')], dropped: 0 }]);
  });

  it('does nothing when the shown preset is selected again', () => {
    const { runs, calls } = setup();
    runs.select('summary');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.signal.aborted).toBe(false);
  });

  it('regenerates the shown preset with a new request in place of its summary', async () => {
    const { runs, calls, last } = setup();
    calls[0]?.send(doneEvent('First.'));
    await vi.waitFor(() => expect(last()?.[1]).toMatchObject({ status: 'done' }));

    runs.regenerate();
    expect(calls[1]?.request.preset).toBe('summary');
    expect(last()).toEqual(['summary', { status: 'summarizing', points: [] }]);
    runs.select('single-sentence');
    runs.select('summary');
    expect(calls).toHaveLength(4);
  });

  it('runs an errored preset again when it is selected again', async () => {
    const { runs, calls, last } = setup();
    calls[0]?.send({ type: 'error', code: 'network', message: 'HTTP 0' });
    await vi.waitFor(() => expect(last()?.[1]).toEqual({ status: 'error', code: 'network' }));

    runs.select('single-sentence');
    runs.select('summary');
    expect(calls.map((call) => call.request.preset)).toEqual([
      'summary',
      'single-sentence',
      'summary',
    ]);
  });

  it('shows invalidated when the extension was reloaded under the card', async () => {
    const shown: CardState[] = [];
    createRuns({
      summarizer: {
        // biome-ignore lint/correctness/useYield: it throws before its first event, as runtime.connect does.
        async *summarize() {
          throw new Error('Extension context invalidated.');
        },
      },
      sentences: ['One.'],
      initial: 'summary',
      show: (_, state) => shown.push(state),
      signal: new AbortController().signal,
    });
    await vi.waitFor(() => expect(shown.at(-1)).toEqual({ status: 'error', code: 'invalidated' }));
  });

  it('aborts the run in flight when the card closes', () => {
    const { calls, card } = setup();
    card.abort();
    expect(calls[0]?.signal.aborted).toBe(true);
  });
});
