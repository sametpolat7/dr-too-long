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

// A run goes on while the reader looks at another view, so its call is not wasted and the view
// comes back where it got to. Aborting a run closes its port, which cancels the model call.
export function createRuns({ summarizer, sentences, initial, show, signal }: RunsOptions): Runs {
  const states = new Map<string, CardState>();
  const running = new Map<string, AbortController>();
  let shown = initial;
  signal.addEventListener(
    'abort',
    () => {
      for (const run of running.values()) run.abort();
    },
    { once: true },
  );

  async function start(view: View): Promise<void> {
    // The card can close, or a new gesture replace it, while it reads the saved view.
    if (signal.aborted) return;
    const key = viewKey(view);
    running.get(key)?.abort();
    const run = new AbortController();
    running.set(key, run);
    update(view, { status: 'summarizing', points: [] });
    try {
      const events = summarizer.summarize(
        { v: 2, preset: view.preset, outputLanguage: view.language, sentences },
        { signal: run.signal },
      );
      for await (const event of events) {
        if (run.signal.aborted) return;
        update(view, toState(event));
      }
    } catch {
      // runtime.connect throws in a script left behind by an update or reload of the extension,
      // and keeps throwing, so a retry from this card cannot work.
      if (!run.signal.aborted) update(view, { status: 'error', code: 'invalidated' });
    } finally {
      if (running.get(key) === run) running.delete(key);
    }
  }

  function update(view: View, state: CardState): void {
    states.set(viewKey(view), state);
    if (viewKey(view) === viewKey(shown)) show(view, state);
  }

  // A view that errored runs again when it is selected again.
  function switchTo(view: View): void {
    if (viewKey(view) === viewKey(shown)) return;
    shown = view;
    const state = states.get(viewKey(view));
    if (state && state.status !== 'error') show(view, state);
    else void start(view);
  }

  void start(initial);
  return {
    select: (preset) => switchTo({ ...shown, preset }),
    selectLanguage: (language) => switchTo({ ...shown, language }),
    regenerate: () => void start(shown),
  };
}

function toState(event: SummaryEvent): CardState {
  switch (event.type) {
    case 'partial':
      return { status: 'summarizing', points: event.points };
    case 'done':
      return { status: 'done', points: event.output.points };
    case 'error':
      return { status: 'error', code: event.code };
  }
}
