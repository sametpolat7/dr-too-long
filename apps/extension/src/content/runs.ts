import type { PresetId, SummaryEvent } from '@dr-too-long/shared/contracts';
import type { PortSummarizer } from '../summarize-port.ts';
import { type CardState, type View, viewKey } from './card/Card.tsx';

export interface Runs {
  // Shows the preset's summary in the shown language, from memory once it is done.
  select(preset: PresetId): void;
  // Shows the shown preset's summary in the language, from memory once it is done.
  selectLanguage(language: string): void;
  // Runs the shown view again in place of its summary or error.
  regenerate(): void;
}

interface RunsOptions {
  summarizer: PortSummarizer;
  sentences: string[];
  // The view the card opens with, which starts at once.
  initial: View;
  show: (view: View, state: CardState) => void;
  // The card's own signal: aborting it ends the run in flight.
  signal: AbortSignal;
}

// One run at a time: a new run or a switch to a done view aborts the one in flight, whose closed
// port cancels the model call. Done summaries are kept per preset and language while the card is
// open.
export function createRuns({ summarizer, sentences, initial, show, signal }: RunsOptions): Runs {
  const done = new Map<string, CardState>();
  let shown = initial;
  let current = new AbortController();
  signal.addEventListener('abort', () => current.abort(), { once: true });

  async function start(view: View): Promise<void> {
    // The card can close, or a new gesture replace it, while it reads the saved language.
    if (signal.aborted) return;
    current.abort();
    const run = new AbortController();
    current = run;
    show(view, { status: 'summarizing', points: [] });
    try {
      const events = summarizer.summarize(
        { v: 1, preset: view.preset, outputLanguage: view.language, sentences },
        { signal: run.signal },
      );
      for await (const event of events) {
        if (run.signal.aborted) return;
        const state = toState(event);
        if (state.status === 'done') done.set(viewKey(view), state);
        show(view, state);
      }
    } catch {
      // runtime.connect throws in a script left behind by an update or reload of the extension,
      // and keeps throwing, so a retry from this card cannot work.
      if (!run.signal.aborted) show(view, { status: 'error', code: 'invalidated' });
    }
  }

  function switchTo(view: View): void {
    if (viewKey(view) === viewKey(shown)) return;
    shown = view;
    const cached = done.get(viewKey(view));
    if (cached) {
      current.abort();
      show(view, cached);
    } else {
      void start(view);
    }
  }

  void start(initial);
  return {
    select: (preset) => switchTo({ ...shown, preset }),
    selectLanguage: (language) => switchTo({ ...shown, language }),
    regenerate() {
      done.delete(viewKey(shown));
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
