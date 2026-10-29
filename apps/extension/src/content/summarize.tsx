import { DEFAULT_PRESET, type PresetId } from '@dr-too-long/shared/contracts';
import { render } from 'preact';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { MESSAGES, sendMessage } from '../messages.ts';
import { portSummarizer } from '../summarize-port.ts';
import { type Anchors, createAnchors } from './anchoring/anchors.ts';
import { Card, type CardState } from './card/Card.tsx';
import css from './card/card.css?inline';
import { createRuns, type Runs } from './runs.ts';
import { readSelection } from './selection.ts';

// Reads the current selection and streams its summary into a card on the page.
export async function summarizeSelection(ctx: ContentScriptContext): Promise<void> {
  if (!canHostShadowRoot()) {
    sendMessage(MESSAGES.unsupportedPage);
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
  const close = () => {
    controller.abort();
    ui.remove();
  };
  const show = (state: CardState, preset?: PresetId) => {
    render(
      <Card
        state={state}
        preset={preset}
        onSelect={(next) => runs?.select(next)}
        onRegenerate={() => runs?.regenerate()}
        onClose={close}
        onOpenOptions={() => sendMessage(MESSAGES.openOptions)}
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
  runs = createRuns({
    summarizer: portSummarizer,
    sentences: outcome.sentences.map((sentence) => sentence.text),
    initial: DEFAULT_PRESET,
    // Each new state replaces the summary whose point the page may have highlighted.
    show: (preset, state) => {
      anchors?.clear();
      show(state, preset);
    },
    signal: controller.signal,
  });
}

// Only HTML and XHTML documents create elements that can host a shadow root; Chrome's XML viewer
// and SVG documents cannot.
function canHostShadowRoot(): boolean {
  return document instanceof HTMLDocument || document.contentType === 'application/xhtml+xml';
}
