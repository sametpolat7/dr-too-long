import { DEFAULT_PRESET } from '@dr-too-long/shared/contracts';
import { render } from 'preact';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from 'wxt/utils/content-script-ui/shadow-root';
import { resolveLanguage } from '../languages.ts';
import { requestBubbleHidden, requestLanguageChoice, sendMessage } from '../messages.ts';
import { portSummarizer } from '../summarize-port.ts';
import { type Anchors, createAnchors } from './anchoring/anchors.ts';
import { startBubble } from './bubble/bubble.tsx';
import { Card, type CardState, type View } from './card/Card.tsx';
import css from './card/card.css?inline';
import { createRuns, type Runs } from './runs.ts';
import { readSelection } from './selection.ts';
import { CARD_UI, canHostShadowRoot, SUMMARIZE_STARTED } from './ui.ts';

type CardUi = ShadowRootContentScriptUi<HTMLElement>;

// Whether the bubble is hidden on this page's site in this tab, which the card's switch shows and
// changes.
interface BubbleState {
  isHidden(): boolean;
  setHidden(hidden: boolean): void;
}

interface OpenCard {
  close(): void;
  // Draws the card again, so its switch shows whether the bubble is hidden now.
  redraw(): void;
}

// Summarizes the current selection into a card on the page, then offers the bubble for the
// selections that follow until the page navigates or a new gesture replaces this script.
export async function summarizeSelection(ctx: ContentScriptContext): Promise<void> {
  if (!canHostShadowRoot()) {
    sendMessage({ type: 'unsupported-page' });
    return;
  }
  document.dispatchEvent(new Event(SUMMARIZE_STARTED));

  let hidden = await requestBubbleHidden();
  // One host serves every card, mounted after the bubble's so that a card is drawn over it.
  const ui = await createShadowRootUi(ctx, {
    name: CARD_UI,
    position: 'inline',
    anchor: () => document.documentElement,
    mode: 'closed',
    isolateEvents: true,
    css,
    onMount: (container) => container,
    onRemove: (container) => {
      if (container) render(null, container);
    },
  });

  let card: OpenCard | undefined;
  const summarize = () => {
    card?.close();
    card = openCard(ctx, ui, bubbleState);
  };
  // An extension reload orphans this script, and the check removes its card and bubble instead of
  // opening a card that cannot run.
  const bubble = await startBubble(ctx, {
    hidden,
    onSummarize: () => {
      if (ctx.isValid) summarize();
    },
  });
  const apply = (next: boolean) => {
    hidden = next;
    bubble.setHidden(next);
    card?.redraw();
  };
  let switches = 0;
  const bubbleState: BubbleState = {
    isHidden: () => hidden,
    // The card switches first: in a script orphaned by an extension reload the save throws.
    setHidden: (next) => {
      switches += 1;
      apply(next);
      sendMessage({ type: 'save-bubble-hidden', hidden: next });
    },
  };
  // A page back from the back-forward cache asks again: meanwhile the reader may have hidden the
  // bubble on another page of the site, or shown it again. The worker answers from before any click
  // on the card's switch made while it answers, so such a click wins.
  window.addEventListener(
    'pageshow',
    (event) => {
      if (!event.persisted || !ctx.isValid) return;
      const asked = switches;
      void requestBubbleHidden().then((next) => {
        if (switches === asked && ctx.isValid && next !== hidden) apply(next);
      });
    },
    { signal: ctx.signal },
  );
  summarize();
}

// Opens the card for the current selection and starts its summary.
function openCard(ctx: ContentScriptContext, ui: CardUi, bubbleState: BubbleState): OpenCard {
  const controller = new AbortController();
  let anchors: Anchors | undefined;
  let runs: Runs | undefined;
  let choice: string | null = null;
  let redraw: () => void = () => undefined;
  // Lets go of everything the card held.
  const close = () => {
    controller.abort();
    anchors?.clear();
    ui.remove();
    stopOnInvalidated();
  };
  const stopOnInvalidated = ctx.onInvalidated(close);
  const card: OpenCard = {
    close,
    redraw: () => {
      if (!controller.signal.aborted) redraw();
    },
  };
  const show = (state: CardState, view?: View) => {
    redraw = () => show(state, view);
    render(
      <Card
        state={state}
        view={view}
        choice={choice}
        onSelect={(preset) => runs?.select(preset)}
        // The card switches first: in a script orphaned by an extension reload the save throws.
        onLanguage={(next) => {
          runs?.selectLanguage(resolveLanguage(next));
          sendMessage({ type: 'save-language', choice: next });
        }}
        onRegenerate={() => runs?.regenerate()}
        onClose={close}
        onOpenOptions={() => sendMessage({ type: 'open-options' })}
        onActivate={(point) => anchors?.activate(point) ?? false}
        bubbleHidden={bubbleState.isHidden()}
        onBubble={bubbleState.setHidden}
      />,
      ui.uiContainer,
    );
  };

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') close();
    },
    { capture: true, signal: controller.signal },
  );
  ui.mount();

  const outcome = readSelection(window.getSelection());
  if (!outcome.ok) {
    show({ status: 'error', code: outcome.code, detail: outcome.detail });
    return card;
  }

  anchors = createAnchors(outcome.pageText, outcome.sentences);
  void requestLanguageChoice().then((saved) => {
    choice = saved;
    runs = createRuns({
      summarizer: portSummarizer,
      sentences: outcome.sentences.map((sentence) => sentence.text),
      initial: { preset: DEFAULT_PRESET, language: resolveLanguage(saved) },
      // Each new state replaces the summary whose point the page may have highlighted.
      show: (view, state) => {
        anchors?.clear();
        show(state, view);
      },
      signal: controller.signal,
    });
  });
  return card;
}
