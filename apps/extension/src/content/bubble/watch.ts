import { inEditable, inFrame } from '../selection.ts';
import { isOwnUi } from '../ui.ts';
import { inView, type Lines, selectedLines } from './position.ts';

export const BUBBLE_DELAY_MS = 300;
export const BUBBLE_MIN_CHARS = 150;
export const BUBBLE_SCROLL_PX = 80;

interface WatchOptions {
  // False once an extension reload has orphaned the script. Reading the context's isValid also
  // invalidates it, which removes the card and the bubble.
  isValid: () => boolean;
  signal: AbortSignal;
  // Shows the bubble beside the lines, or moves it there.
  offer: (lines: Lines) => void;
  withdraw: () => void;
  // Offers the selection already on the page, which no card has summarized.
  offerCurrent?: boolean;
}

export interface Watcher {
  // Withdraws the bubble and offers none for the same selection again.
  dismiss(): void;
}

// A selection outside frames and editable regions, long enough that copying a phrase never shows
// the bubble, on a page that is not pinch-zoomed.
export function offeredRange(selection: Selection | null): Range | null {
  if (!selection || selection.rangeCount === 0 || zoomed() || inFrame() || inEditable(selection)) {
    return null;
  }
  // Chrome moves both ends of a selection in a shadow tree to its host, so that range holds no text.
  const range = selection.getRangeAt(0);
  return range.toString().trim().length >= BUBBLE_MIN_CHARS ? range : null;
}

// Offers the bubble once the reader has finished selecting: a short delay after the mouse button or
// a key is released, never during a drag. The selection on the page when watching starts (unless
// offerCurrent), one dismissed with Escape or a click on the bubble, and one scrolled
// BUBBLE_SCROLL_PX from where it was offered are not offered again until the selection changes.
export function watchSelections({
  isValid,
  signal,
  offer,
  withdraw,
  offerCurrent = false,
}: WatchOptions): Watcher {
  let pressed = false;
  let dismissed = !offerCurrent;
  let following = false;
  let timer: number | undefined;
  let shown: Range | undefined;
  // Where the selection's first line stood when it was first offered.
  let origin: number | undefined;

  const hide = () => {
    clearTimeout(timer);
    if (!shown) return;
    shown = undefined;
    withdraw();
  };
  const dismiss = () => {
    dismissed = true;
    hide();
  };
  const place = (range: Range, lines: Lines | undefined) => {
    if (!lines) return dismiss();
    origin ??= lines.first.top;
    if (Math.abs(lines.first.top - origin) > BUBBLE_SCROLL_PX) return dismiss();
    shown = range;
    offer(lines);
  };
  const check = () => {
    if (!isValid()) return;
    const range = offeredRange(document.getSelection());
    const lines = range ? selectedLines(range) : undefined;
    if (range && lines && inView(lines)) place(range, lines);
    else hide();
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!pressed && !dismissed) timer = window.setTimeout(check, BUBBLE_DELAY_MS);
  };
  const follow = () => {
    if (!shown || following) return;
    following = true;
    window.requestAnimationFrame(() => {
      following = false;
      if (shown && !signal.aborted && isValid()) place(shown, selectedLines(shown));
    });
  };

  const options = { capture: true, passive: true, signal };
  document.addEventListener(
    'mousedown',
    (event) => {
      if (isOwnUi(event.target)) return;
      pressed = true;
      hide();
    },
    options,
  );
  document.addEventListener(
    'mouseup',
    (event) => {
      pressed = false;
      if (!isOwnUi(event.target)) schedule();
    },
    options,
  );
  document.addEventListener(
    'keyup',
    (event) => {
      if (!isOwnUi(event.target)) schedule();
    },
    options,
  );
  document.addEventListener(
    'selectionchange',
    () => {
      dismissed = false;
      origin = undefined;
      if (document.getSelection()?.isCollapsed !== false) hide();
    },
    options,
  );
  // Escape closes the bubble alone. The window's capture phase runs before the card's listener on
  // the document, which would close the card under it.
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape') return;
      if (shown) event.stopPropagation();
      dismiss();
    },
    options,
  );
  // Focus moving into a child frame leaves the top selection in place but out of reach.
  window.addEventListener('blur', hide, options);
  // Scroll events on elements do not bubble, but the capture phase reaches every scroller.
  document.addEventListener('scroll', follow, options);
  window.addEventListener('resize', follow, options);
  window.visualViewport?.addEventListener(
    'resize',
    () => {
      if (zoomed()) hide();
    },
    options,
  );
  signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  if (offerCurrent) schedule();
  return { dismiss };
}

const zoomed = (): boolean => (window.visualViewport?.scale ?? 1) > 1;
