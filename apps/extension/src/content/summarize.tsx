import { DEFAULT_PRESET } from '@dr-too-long/shared/contracts';
import { render } from 'preact';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { resolveLanguage } from '../languages.ts';
import { requestLanguageChoice, sendMessage } from '../messages.ts';
import { portSummarizer } from '../summarize-port.ts';
import { type Anchors, createAnchors } from './anchoring/anchors.ts';
import { Card, type CardState, type View } from './card/Card.tsx';
import css from './card/card.css?inline';
import { createRuns, type Runs } from './runs.ts';
import { readSelection } from './selection.ts';

// Reads the current selection and streams its summary into a card on the page.
export async function summarizeSelection(ctx: ContentScriptContext): Promise<void> {
  if (!canHostShadowRoot()) {
    sendMessage({ type: 'unsupported-page' });
    return;
  }

  const controller = new AbortController();
  let anchors: Anchors | undefined;
  const ui = await createShadowRootUi(ctx, {
    name: 'dr-too-long-card',
    position: 'inline',
    anchor: () => document.documentElement,
    mode: 'closed',
    isolateEvents: true,
    css,
    onMount: (container) => container,
    onRemove: (container) => {
      if (!container) return;
      render(null, container);
      anchors?.clear();
    },
  });

  let runs: Runs | undefined;
  let choice: string | null = null;
  const close = () => {
    controller.abort();
    ui.remove();
  };
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
      />,
      ui.uiContainer,
    );
  };

  ctx.onInvalidated(() => controller.abort());
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
    return;
  }

  anchors = createAnchors(outcome.pageText, outcome.sentences);
  choice = await requestLanguageChoice();
  runs = createRuns({
    summarizer: portSummarizer,
    sentences: outcome.sentences.map((sentence) => sentence.text),
    initial: { preset: DEFAULT_PRESET, language: resolveLanguage(choice) },
    // Each new state replaces the summary whose point the page may have highlighted.
    show: (view, state) => {
      anchors?.clear();
      show(state, view);
    },
    signal: controller.signal,
  });
}

// Only HTML and XHTML documents create elements that can host a shadow root; Chrome's XML viewer
// and SVG documents cannot.
function canHostShadowRoot(): boolean {
  return document instanceof HTMLDocument || document.contentType === 'application/xhtml+xml';
}
