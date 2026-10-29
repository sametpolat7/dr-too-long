import { render } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { BUBBLE_UI } from '../ui.ts';
import css from './bubble.css?inline';
import { type Lines, placeBubble, viewportSize } from './position.ts';
import { type Watcher, watchSelections } from './watch.ts';

export interface Bubble {
  // Stops or resumes offering the bubble as the reader hides it on this site or shows it again.
  setHidden(hidden: boolean): void;
}

interface BubbleOptions {
  hidden: boolean;
  // Offers the selection already on the page, which no card has summarized.
  offerCurrent?: boolean;
  onSummarize: () => void;
}

// Mounts the bubble's host, which stays empty until a selection is offered.
export async function startBubble(
  ctx: ContentScriptContext,
  { hidden, offerCurrent = false, onSummarize }: BubbleOptions,
): Promise<Bubble> {
  const ui = await createShadowRootUi(ctx, {
    name: BUBBLE_UI,
    position: 'inline',
    anchor: () => document.documentElement,
    mode: 'closed',
    // Presses, clicks and keys on the bubble stop at its shadow root, so the page's listeners in
    // the bubbling phase never see them.
    isolateEvents: ['mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'keypress'],
    css,
    onMount: (container) => container,
    onRemove: (container) => {
      if (container) render(null, container);
    },
  });
  ui.mount();

  let watching: AbortController | undefined;
  let watcher: Watcher | undefined;
  const withdraw = () => render(null, ui.uiContainer);
  const offer = (lines: Lines) =>
    render(
      <BubbleButton
        lines={lines}
        onClick={() => {
          watcher?.dismiss();
          onSummarize();
        }}
      />,
      ui.uiContainer,
    );
  const watch = (current: boolean) => {
    watching = new AbortController();
    watcher = watchSelections({
      isValid: () => ctx.isValid,
      signal: watching.signal,
      offer,
      withdraw,
      offerCurrent: current,
    });
  };
  ctx.onInvalidated(() => watching?.abort());

  if (!hidden) watch(offerCurrent);
  return {
    setHidden(next) {
      watching?.abort();
      withdraw();
      if (!next) watch(false);
    },
  };
}

interface BubbleButtonProps {
  lines: Lines;
  onClick: () => void;
}

// Placed from its own rendered size, so it stays inside the viewport. A press on it keeps the page
// selection, which the card then reads.
function BubbleButton({ lines, onClick }: BubbleButtonProps) {
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const element = button.current;
    if (!element) return;
    const { left, top } = placeBubble(lines, element.getBoundingClientRect(), viewportSize());
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }, [lines]);

  return (
    <button
      ref={button}
      type="button"
      class="bubble"
      lang="en"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      Summarize
    </button>
  );
}
