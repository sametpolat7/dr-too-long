import type { SummarizeRequest, Summarizer, SummaryEvent } from '@dr-too-long/shared/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { CardState, View } from '../src/content/card/view.ts';
import { createRuns } from '../src/content/runs.ts';
import { settle } from './helpers.ts';

const point = (text: string) => ({ text, sentences: [1] });
const summary: View = { shape: 'summary', language: 'en' };
const keyPoints: View = { shape: 'key-points', language: 'en' };
const doneEvent = (text: string): SummaryEvent => ({
  type: 'done',
  output: { points: [point(text)] },
});

interface Call {
  request: SummarizeRequest;
  signal: AbortSignal;
  send(event: SummaryEvent): void;
}

function fakeSummarizer() {
  const calls: Call[] = [];
  const summarizer: Summarizer = {
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
          yield { type: 'error', code: 'aborted' };
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
  const shown: Array<[View, CardState]> = [];
  const card = new AbortController();
  const runs = createRuns({
    summarizer,
    sentences: ['One.', 'Two.'],
    initial: summary,
    show: (view, state) => shown.push([view, state]),
    signal: card.signal,
  });
  const last = () => shown.at(-1);
  return { runs, calls, shown, last, card };
}

describe('createRuns', () => {
  it('starts with the initial view over the sentences and shows its states', async () => {
    const { calls, last } = setup();
    expect(last()).toEqual([summary, { status: 'summarizing', points: [] }]);
    expect(calls[0]?.request).toEqual({
      shape: 'summary',
      outputLanguage: 'en',
      sentences: ['One.', 'Two.'],
    });

    calls[0]?.send({ type: 'partial', points: [point('Half')] });
    await vi.waitFor(() =>
      expect(last()).toEqual([summary, { status: 'summarizing', points: [point('Half')] }]),
    );
    calls[0]?.send(doneEvent('Whole.'));
    await vi.waitFor(() =>
      expect(last()).toEqual([summary, { status: 'done', points: [point('Whole.')] }]),
    );
  });

  it('keeps a run going on a switch and shows the view where it got to when it comes back', async () => {
    const { runs, calls, shown, last } = setup();
    runs.select('key-points');
    expect(calls[0]?.signal.aborted).toBe(false);
    expect(calls[1]?.request).toMatchObject({ shape: 'key-points', outputLanguage: 'en' });
    expect(last()).toEqual([keyPoints, { status: 'summarizing', points: [] }]);

    calls[0]?.send({ type: 'partial', points: [point('Half')] });
    await settle();
    expect(shown.filter(([view]) => view.shape === 'summary')).toHaveLength(1);
    runs.select('summary');
    expect(last()).toEqual([summary, { status: 'summarizing', points: [point('Half')] }]);
    calls[0]?.send(doneEvent('Whole.'));
    await vi.waitFor(() =>
      expect(last()).toEqual([summary, { status: 'done', points: [point('Whole.')] }]),
    );

    calls[1]?.send(doneEvent('Kept.'));
    await settle();
    expect(last()?.[0]).toEqual(summary);
    runs.select('key-points');
    expect(calls).toHaveLength(2);
    expect(last()).toEqual([keyPoints, { status: 'done', points: [point('Kept.')] }]);
  });

  it('runs the shown shape in another language and keeps each language', async () => {
    const { runs, calls, last } = setup();
    calls[0]?.send(doneEvent('English.'));
    await vi.waitFor(() => expect(last()?.[1]).toMatchObject({ status: 'done' }));

    runs.selectLanguage('tr');
    expect(calls[1]?.request).toMatchObject({ shape: 'summary', outputLanguage: 'tr' });
    calls[1]?.send(doneEvent('Türkçe.'));
    await vi.waitFor(() =>
      expect(last()).toEqual([
        { shape: 'summary', language: 'tr' },
        { status: 'done', points: [point('Türkçe.')] },
      ]),
    );

    runs.selectLanguage('en');
    expect(calls).toHaveLength(2);
    expect(last()).toEqual([summary, { status: 'done', points: [point('English.')] }]);
  });

  it('does nothing when the shown shape or language is selected again', () => {
    const { runs, calls } = setup();
    runs.select('summary');
    runs.selectLanguage('en');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.signal.aborted).toBe(false);
  });

  it('regenerates the shown view in place of its run and leaves another run going', async () => {
    const { runs, calls, shown, last } = setup();
    runs.select('key-points');
    runs.select('summary');
    runs.regenerate();
    expect(calls[0]?.signal.aborted).toBe(true);
    expect(calls[1]?.signal.aborted).toBe(false);
    expect(calls[2]?.request).toMatchObject({ shape: 'summary', outputLanguage: 'en' });
    expect(last()).toEqual([summary, { status: 'summarizing', points: [] }]);

    calls[0]?.send(doneEvent('Stale.'));
    calls[2]?.send(doneEvent('Fresh.'));
    await vi.waitFor(() => expect(last()?.[1]).toMatchObject({ status: 'done' }));
    expect(
      shown.some(([, state]) => state.status === 'done' && state.points[0]?.text === 'Stale.'),
    ).toBe(false);
    expect(last()).toEqual([summary, { status: 'done', points: [point('Fresh.')] }]);
  });

  it('runs an errored shape again when it is selected again', async () => {
    const { runs, calls, last } = setup();
    calls[0]?.send({ type: 'error', code: 'network' });
    await vi.waitFor(() => expect(last()?.[1]).toEqual({ status: 'error', code: 'network' }));

    runs.select('key-points');
    runs.select('summary');
    expect(calls.map((call) => call.request.shape)).toEqual(['summary', 'key-points', 'summary']);
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
      initial: summary,
      show: (_, state) => shown.push(state),
      signal: new AbortController().signal,
    });
    await vi.waitFor(() => expect(shown.at(-1)).toEqual({ status: 'error', code: 'invalidated' }));
  });

  it('starts nothing for a card that closed while it read the saved view', () => {
    const { summarizer, calls } = fakeSummarizer();
    const shown: CardState[] = [];
    const card = new AbortController();
    card.abort();
    createRuns({
      summarizer,
      sentences: ['One.'],
      initial: summary,
      show: (_, state) => shown.push(state),
      signal: card.signal,
    });
    expect(calls).toHaveLength(0);
    expect(shown).toHaveLength(0);
  });

  it('aborts every run in flight when the card closes', () => {
    const { runs, calls, card } = setup();
    runs.select('key-points');
    card.abort();
    expect(calls.map((call) => call.signal.aborted)).toEqual([true, true]);
  });
});
