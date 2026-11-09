import { render } from 'preact';
import { browser } from 'wxt/browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from 'wxt/utils/content-script-ui/shadow-root';
import { type LanguageChoice, resolveLanguage } from '../languages.ts';
import { request, sendMessage, type TabMessage } from '../messages.ts';
import { portSummarizer } from '../summarize-port.ts';
import { type Anchors, createAnchors } from './anchoring/anchors.ts';
import { startBubble } from './bubble/bubble.tsx';
import { Card } from './card/Card.tsx';
import css from './card/card.css?inline';
import type { CardState, View } from './card/view.ts';
import { createRuns, type Runs } from './runs.ts';
import { isEditable, readSelection } from './selection.ts';
import { pageTheme } from './theme.ts';
import { CARD_UI, canHostShadowRoot, isOwnUi, SUMMARIZE_STARTED } from './ui.ts';

type CardUi = ShadowRootContentScriptUi<HTMLElement>;

export async function summarizeSelection(ctx: ContentScriptContext): Promise<void> {
  if (!canHostShadowRoot()) {
    sendMessage({ type: 'unsupported-page' });
    return;
  }
  document.dispatchEvent(new Event(SUMMARIZE_STARTED));

  let closeCard: (() => void) | undefined;
  // Hidden until the worker answers whether the reader turned it off for this site in this tab.
  const bubble = await startBubble(ctx, {
    hidden: true,
    // An extension reload orphans this script, and the check removes its card and bubble instead
    // of opening a card that cannot run.
    onSummarize: () => {
      if (ctx.isValid) summarize();
    },
  });
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

  // Undefined until the worker answers, so that its first answer always applies.
  let hidden: boolean | undefined;
  const setHidden = (next: boolean) => {
    if (next === hidden) return;
    hidden = next;
    bubble.setHidden(next);
  };
  const summarize = () => {
    closeCard?.();
    closeCard = openCard(ctx, ui);
  };
  const ask = () => {
    void request('read-bubble-hidden').then((next) => {
      if (ctx.isValid) setHidden(next);
    });
  };
  // A page back from the back-forward cache asks again: meanwhile the reader may have hidden the
  // bubble on another page of the site, or shown it again.
  window.addEventListener(
    'pageshow',
    (event) => {
      if (event.persisted && ctx.isValid) ask();
    },
    { signal: ctx.signal },
  );
  // The popup turns the bubble off or on for this tab's site.
  const onMessage = (message: TabMessage) => {
    if (message.type === 'bubble-hidden') setHidden(message.hidden);
  };
  browser.runtime.onMessage.addListener(onMessage);
  ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(onMessage));
  summarize();
  ask();
}

function openCard(ctx: ContentScriptContext, ui: CardUi): () => void {
  const controller = new AbortController();
  // The card takes the focus when it first paints and gives it back here when it closes.
  const focusBefore = document.activeElement;
  const theme = pageTheme();
  let focused = false;
  let anchors: Anchors | undefined;
  let runs: Runs | undefined;
  let choice: LanguageChoice = null;
  const close = () => {
    const focusInCard = ui.shadowHost.contains(document.activeElement);
    controller.abort();
    anchors?.clear();
    ui.remove();
    stopOnInvalidated();
    if (focusInCard && focusBefore instanceof HTMLElement && focusBefore.isConnected) {
      focusBefore.focus({ preventScroll: true });
    }
  };
  const stopOnInvalidated = ctx.onInvalidated(close);
  const show = (state: CardState, view?: View) => {
    render(
      <Card
        state={state}
        theme={theme}
        view={view}
        choice={choice}
        // The card switches first: in a script orphaned by an extension reload the saves throw.
        onSelect={(shape) => {
          runs?.select(shape);
          sendMessage({ type: 'save-shape', shape });
        }}
        // The picker shows the choice it is given. The card is drawn again here, because a choice
        // that resolves to the language shown, such as Auto, leaves the runs nothing to show.
        onLanguage={(next) => {
          choice = next;
          show(state, view);
          runs?.selectLanguage(resolveLanguage(next));
          sendMessage({ type: 'save-language', choice: next });
        }}
        onRetry={() => runs?.retry()}
        onClose={close}
        onOpenOptions={() => sendMessage({ type: 'open-options' })}
        onActivate={(point) => anchors?.activate(point) ?? false}
      />,
      ui.uiContainer,
    );
    if (!focused) {
      focused = true;
      ui.uiContainer.querySelector<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true });
    }
  };

  // The card handles keys and clicks of its own; these listeners are for the page's.
  const listening = { capture: true, signal: controller.signal };
  document.addEventListener(
    'keydown',
    (event) => {
      // Escape in the page's own field belongs to it, such as clearing a search box.
      const inField = event.target instanceof Node && isEditable(event.target);
      if (event.key === 'Escape' && !isOwnUi(event.target) && !inField) close();
    },
    listening,
  );
  // A click on the page closes the card, but not one that ends a drag selecting text, which can
  // start in the card or end in a text field, nor a click the page's own script sends.
  document.addEventListener(
    'click',
    (event) => {
      if (event.isTrusted && !isOwnUi(event.target) && document.getSelection()?.type !== 'Range') {
        close();
      }
    },
    listening,
  );
  ui.mount();

  const outcome = readSelection(window.getSelection());
  if (!outcome.ok) {
    show({ status: 'error', code: outcome.code, detail: outcome.detail });
    return close;
  }

  anchors = createAnchors(outcome.pageText, outcome.sentences);
  void Promise.all([request('read-language'), request('read-shape')]).then(([saved, shape]) => {
    choice = saved;
    runs = createRuns({
      summarizer: portSummarizer,
      sentences: outcome.sentences.map((sentence) => sentence.text),
      initial: { shape, language: resolveLanguage(saved) },
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
