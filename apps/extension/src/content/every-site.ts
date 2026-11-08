import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { request } from '../messages.ts';
import { startBubble } from './bubble/bubble.tsx';
import { offeredRange } from './bubble/watch.ts';
import { BUBBLE_UI, canHostShadowRoot, SUMMARIZE_STARTED } from './ui.ts';

// The script adds nothing to the page and leaves the worker asleep until the first selection the
// bubble is offered for.
export async function watchEverySite(ctx: ContentScriptContext): Promise<void> {
  if (!canHostShadowRoot()) return;
  document.addEventListener(SUMMARIZE_STARTED, () => ctx.abort(), { signal: ctx.signal });

  await firstOfferedSelection(ctx.signal);
  const moving = new AbortController();
  const movedOn = noteMovingOn(moving.signal);
  const shown = await request('read-every-site-bubble');
  moving.abort();
  // A summarize script started meanwhile, or before this one, watches the page with its own bubble.
  if (!shown || ctx.signal.aborted || document.querySelector(BUBBLE_UI)) return;
  const bubble = await startBubble(ctx, {
    hidden: false,
    // A press or Escape while the worker answered means the reader has left that selection.
    offerCurrent: !movedOn(),
    onSummarize: () =>
      void request('summarize-from-bubble').then((started) => {
        if (!started) ctx.abort();
      }),
  });
  // A page back from the back-forward cache asks again: meanwhile the reader may have hidden the
  // bubble on another page of the site, or withdrawn the opt-in.
  window.addEventListener(
    'pageshow',
    (event) => {
      if (event.persisted) {
        void request('read-every-site-bubble').then((next) => bubble.setHidden(!next));
      }
    },
    { signal: ctx.signal },
  );
}

function firstOfferedSelection(signal: AbortSignal): Promise<void> {
  const listening = new AbortController();
  signal.addEventListener('abort', () => listening.abort(), { once: true });
  return new Promise((resolve) => {
    const check = () => {
      if (!offeredRange(document.getSelection())) return;
      listening.abort();
      resolve();
    };
    const options = { capture: true, passive: true, signal: listening.signal };
    document.addEventListener('mouseup', check, options);
    document.addEventListener('keyup', check, options);
  });
}

function noteMovingOn(signal: AbortSignal): () => boolean {
  let movedOn = false;
  const options = { capture: true, passive: true, signal };
  document.addEventListener(
    'mousedown',
    () => {
      movedOn = true;
    },
    options,
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') movedOn = true;
    },
    options,
  );
  return () => movedOn;
}
