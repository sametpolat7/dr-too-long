import { render } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { Mark } from '../card/Mark.tsx';
import { inSight } from '../sight.ts';
import { pageTheme, type Theme } from '../theme.ts';
import { BUBBLE_UI } from '../ui.ts';
import { type Place, viewportSize } from '../viewport.ts';
import css from './bubble.css?inline';
import { anchorOf, atOffset, type Lines, offsetFrom, placeBubble } from './position.ts';
import { type Watcher, watchSelections } from './watch.ts';

export interface Bubble {
  setHidden(hidden: boolean): void;
}

interface BubbleOptions {
  hidden: boolean;
  // Offers the selection already on the page, which no card has summarized.
  offerCurrent?: boolean;
  onSummarize: () => void;
}

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
  const offer = (lines: Lines, following: boolean, visible: boolean) =>
    render(
      <BubbleButton
        lines={lines}
        following={following}
        visible={visible}
        theme={pageTheme()}
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
  following: boolean;
  visible: boolean;
  theme: Theme;
  onClick: () => void;
}

// A press on it keeps the page selection, which the card then reads.
function BubbleButton({ lines, following, visible, theme, onClick }: BubbleButtonProps) {
  const button = useRef<HTMLButtonElement>(null);
  const offset = useRef<Place>(undefined);
  useLayoutEffect(() => {
    button.current?.showPopover();
  }, []);
  useLayoutEffect(() => {
    const element = button.current;
    if (!element) return;
    if (!following) offset.current = undefined;
    element.style.visibility = visible ? '' : 'hidden';
    if (!visible) return;
    const { left, top } = offset.current
      ? atOffset(lines, offset.current)
      : placeBubble(lines, element.getBoundingClientRect(), viewportSize());
    // A place kept inside the viewport for a line outside it would part the button from the text.
    if (!offset.current && inSight(anchorOf(lines))) {
      offset.current = offsetFrom(lines, { left, top });
    }
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }, [lines, following, visible]);

  return (
    <button
      ref={button}
      type="button"
      class="bubble"
      popover="manual"
      data-theme={theme}
      lang="en"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <Mark size={14} />
      Summarize
    </button>
  );
}
