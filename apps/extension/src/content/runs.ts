import type { PresetId, SummaryEvent } from '@dr-too-long/shared/contracts';
import type { PortSummarizer } from '../summarize-port.ts';
import { type CardState, type View, viewKey } from './card/Card.tsx';

export interface Runs {
  select(preset: PresetId): void;
  selectLanguage(language: string): void;
  regenerate(): void;
}

interface RunsOptions {
  summarizer: PortSummarizer;
  sentences: string[];
  initial: View;
  show: (view: View, state: CardState) => void;
  signal: AbortSignal;
}

// Aborting a run closes its port, which cancels the model call.
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
        { v: 2, preset: view.preset, outputLanguage: view.language, sentences },
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
