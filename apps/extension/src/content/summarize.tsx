import type { SummaryEvent } from '@dr-too-long/shared/contracts';
import { render } from 'preact';
import { browser } from 'wxt/browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { MESSAGES, sendMessage } from '../messages.ts';
import { portSummarizer } from '../summarize-port.ts';
import { Card, type CardState } from './card/Card.tsx';
import css from './card/card.css?inline';
import { selectionRequest } from './selection.ts';

// Reads the current selection and streams its summary into a card on the page.
export async function summarizeSelection(ctx: ContentScriptContext): Promise<void> {
  if (!canHostShadowRoot()) {
    sendMessage(MESSAGES.unsupportedPage);
    return;
  }

  const controller = new AbortController();
  const ui = await createShadowRootUi(ctx, {
    name: 'dr-too-long-card',
    position: 'inline',
    anchor: () => document.documentElement,
    mode: 'closed',
    isolateEvents: true,
    css,
    onMount: (container) => container,
    onRemove: (container) => container && render(null, container),
  });

  const close = () => {
    controller.abort();
    ui.remove();
  };
  const show = (state: CardState) => {
    render(
      <Card
        state={state}
        onClose={close}
        onOpenOptions={() => sendMessage(MESSAGES.openOptions)}
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

  const outcome = selectionRequest(window.getSelection(), browser.i18n.getUILanguage());
  if (!outcome.ok) {
    show({ status: 'error', code: outcome.code, detail: outcome.detail });
    return;
  }

  show({ status: 'summarizing', points: [] });
  for await (const event of portSummarizer.summarize(outcome.request, {
    signal: controller.signal,
  })) {
    if (controller.signal.aborted) return;
    show(toState(event));
  }
}

// Only HTML and XHTML documents create elements that can host a shadow root; Chrome's XML viewer
// and SVG documents cannot.
function canHostShadowRoot(): boolean {
  return document instanceof HTMLDocument || document.contentType === 'application/xhtml+xml';
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
