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
import { Card, type CardProps, type CardState, type View } from './card/Card.tsx';
import css from './card/card.css?inline';
import { createRuns, type Runs } from './runs.ts';
import { readSelection } from './selection.ts';
import { CARD_UI } from './ui.ts';

type CardUi = ShadowRootContentScriptUi<HTMLElement>;
type BubbleProps = Pick<CardProps, 'bubbleHidden' | 'onBubble'>;

// Summarizes the current selection into a card on the page, then offers the bubble for the
// selections that follow until the page navigates or a new gesture replaces this script.
export async function summarizeSelection(ctx: ContentScriptContext): Promise<void> {
  if (!canHostShadowRoot()) {
    sendMessage({ type: 'unsupported-page' });
    return;
  }

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

  let closeCard: (() => void) | undefined;
  const summarize = () => {
    closeCard?.();
    closeCard = openCard(ctx, ui, { bubbleHidden: hidden, onBubble });
  };
  // An extension reload orphans this script, and the check removes its card and bubble instead of
  // opening a card that cannot run.
  const bubble = await startBubble(ctx, hidden, () => {
    if (ctx.isValid) summarize();
  });
  const onBubble = (next: boolean) => {
    hidden = next;
    bubble.setHidden(next);
    sendMessage({ type: 'save-bubble-hidden', hidden: next });
  };
  summarize();
}

// Opens the card for the current selection and starts its summary. Returns the function that closes
// the card and lets go of everything it held.
function openCard(ctx: ContentScriptContext, ui: CardUi, bubbleProps: BubbleProps): () => void {
  const controller = new AbortController();
  let anchors: Anchors | undefined;
  let runs: Runs | undefined;
  let choice: string | null = null;
  const close = () => {
    controller.abort();
    anchors?.clear();
    ui.remove();
    stopOnInvalidated();
  };
  const stopOnInvalidated = ctx.onInvalidated(close);
  const show = (state: CardState, view?: View) => {
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
        {...bubbleProps}
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
    return close;
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
  return close;
}

// Only HTML and XHTML documents create elements that can host a shadow root; Chrome's XML viewer
// and SVG documents cannot.
function canHostShadowRoot(): boolean {
  return document instanceof HTMLDocument || document.contentType === 'application/xhtml+xml';
}
