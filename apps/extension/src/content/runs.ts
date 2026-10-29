import type { PresetId, SummaryEvent } from '@dr-too-long/shared/contracts';
import type { PortSummarizer } from '../summarize-port.ts';
import type { CardState } from './card/Card.tsx';

export interface Runs {
  // Shows the preset's summary, from memory once it is done.
  select(preset: PresetId): void;
  // Runs the shown preset again in place of its summary or error.
  regenerate(): void;
}

interface RunsOptions {
  summarizer: PortSummarizer;
  sentences: string[];
  // The preset the card opens with, which starts at once.
  initial: PresetId;
  show: (preset: PresetId, state: CardState) => void;
  // The card's own signal: aborting it ends the run in flight.
  signal: AbortSignal;
}

// One run at a time: a new run or a switch to a done preset aborts the one in flight, whose closed
// port cancels the model call. Done summaries are kept per preset while the card is open.
export function createRuns({ summarizer, sentences, initial, show, signal }: RunsOptions): Runs {
  const done = new Map<PresetId, CardState>();
  let shown = initial;
  let current = new AbortController();
  signal.addEventListener('abort', () => current.abort(), { once: true });

  async function start(preset: PresetId): Promise<void> {
    current.abort();
    const run = new AbortController();
    current = run;
    show(preset, { status: 'summarizing', points: [] });
    try {
      const events = summarizer.summarize({ v: 1, preset, sentences }, { signal: run.signal });
      for await (const event of events) {
        if (run.signal.aborted) return;
        const state = toState(event);
        if (state.status === 'done') done.set(preset, state);
        show(preset, state);
      }
    } catch {
      // runtime.connect throws in a script left behind by an update or reload of the extension,
      // and keeps throwing, so a retry from this card cannot work.
      if (!run.signal.aborted) show(preset, { status: 'error', code: 'invalidated' });
    }
  }

  void start(initial);
  return {
    select(preset) {
      if (preset === shown) return;
      shown = preset;
      const cached = done.get(preset);
      if (cached) {
        current.abort();
        show(preset, cached);
      } else {
        void start(preset);
      }
    },
    regenerate() {
      done.delete(shown);
      void start(shown);
    },
  };
}

function toState(event: SummaryEvent): CardState {
  switch (event.type) {
    case 'partial':
      return { status: 'summarizing', points: event.points };
    case 'done':
      return { status: 'done', points: event.output.points, dropped: event.dropped };
    case 'error':
      return { status: 'error', code: event.code };
  }
}
