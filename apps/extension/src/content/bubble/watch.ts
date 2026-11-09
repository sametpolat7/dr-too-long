import { segmentSentences } from '@dr-too-long/shared/segmentation';
import { inEditable, inFrame } from '../selection.ts';
import { isVisible } from '../sight.ts';
import { isOwnUi } from '../ui.ts';
import { anchorOf, type End, endOf, inView, type Lines, selectedLines } from './position.ts';

const SENTENCE_END = /\p{Sentence_Terminal}[\p{Pe}\p{Pf}"']*$/u;

interface WatchOptions {
  // False once an extension reload has orphaned the script. Reading the context's isValid also
  // invalidates it, which removes the card and the bubble.
  isValid: () => boolean;
  signal: AbortSignal;
  // Shows the bubble beside the lines, or moves it there. While following a scroll or a resize, it
  // keeps its place from the text instead of being placed afresh, and is hidden while the page does
  // not show the line it stands by.
  offer: (lines: Lines, following: boolean, visible: boolean) => void;
  withdraw: () => void;
  offerCurrent?: boolean;
}

export interface Watcher {
  // Offers no bubble for the same selection again.
  dismiss(): void;
}

// A selection that holds a complete sentence, so that copying a word, a name, a number or a link
// never shows the bubble.
export function offeredRange(selection: Selection | null): Range | null {
  if (!selection || selection.rangeCount === 0 || zoomed() || inFrame() || inEditable(selection)) {
    return null;
  }
  // Chrome moves both ends of a selection in a shadow tree to its host, so that range holds no text.
  const range = selection.getRangeAt(0);
  return holdsSentence(range.toString()) ? range : null;
}

// Two sentences, or one that ends with a sentence mark, with closing quotes or brackets after it.
function holdsSentence(text: string): boolean {
  const trimmed = text.trim();
  return SENTENCE_END.test(trimmed) || segmentSentences(trimmed).length > 1;
}

// The range the bubble is offered for, where the reader let go, and whether the bubble shows.
interface Offered {
  range: Range;
  end: End;
  visible: boolean;
}

// The same text selected, whichever Range object holds it.
const isSame = (a: Range, b: Range): boolean =>
  a.compareBoundaryPoints(Range.START_TO_START, b) === 0 &&
  a.compareBoundaryPoints(Range.END_TO_END, b) === 0;

// Following, the bubble shows only while the page shows the line it stands by, judged against the
// element holding the end the reader let go at: a select-all's common ancestor is the body, which
// would count a sticky header inside it as part of the text.
function shows(range: Range, lines: Lines): boolean {
  const node = lines.backward ? range.startContainer : range.endContainer;
  const element = node instanceof Element ? node : node.parentElement;
  return element !== null && isVisible(anchorOf(lines), element);
}

// Offers the bubble as soon as the reader has finished selecting.
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
  let shown: Offered | undefined;

  const hide = () => {
    if (!shown) return;
    shown = undefined;
    withdraw();
  };
  const dismiss = () => {
    dismissed = true;
    clearTimeout(timer);
    hide();
  };
  const check = () => {
    if (!isValid()) return;
    const selection = document.getSelection();
    const range = offeredRange(selection);
    if (!range || !selection) return hide();
    // A key or a press that leaves the selection as it was, such as Page Down, keeps following it.
    if (shown && isSame(range, shown.range)) return;
    const end = endOf(selection);
    const lines = selectedLines(range, end);
    if (!lines || !inView(lines)) return hide();
    // A copy, which no later change to the selection moves.
    shown = { range: range.cloneRange(), end, visible: true };
    offer(lines, false, true);
  };
  // The next task, once the release has settled the selection.
  const schedule = () => {
    clearTimeout(timer);
    if (!pressed && !dismissed) timer = window.setTimeout(check);
  };
  // Once a frame, however far the text moves; only text the page removes or hides takes it away.
  const follow = () => {
    if (!shown || following) return;
    following = true;
    window.requestAnimationFrame(() => {
      following = false;
      if (!shown || signal.aborted || !isValid()) return;
      const lines = selectedLines(shown.range, shown.end);
      if (!lines) return dismiss();
      shown.visible = shows(shown.range, lines);
      offer(lines, true, shown.visible);
    });
  };

  const options = { capture: true, passive: true, signal };
  // A press that leaves the selection, as on a scrollbar, leaves the bubble too.
  document.addEventListener(
    'mousedown',
    (event) => {
      if (isOwnUi(event.target)) return;
      pressed = true;
      clearTimeout(timer);
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
  // Another selection takes the bubble away until the release or the key that ends it.
  document.addEventListener(
    'selectionchange',
    () => {
      dismissed = false;
      const selection = document.getSelection();
      if (shown && !(selection?.rangeCount && isSame(selection.getRangeAt(0), shown.range))) hide();
    },
    options,
  );
  // Escape closes a bubble that shows alone. The window's capture phase runs before the card's
  // listener on the document, which would close the card under it.
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape') return;
      if (shown?.visible) event.stopPropagation();
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
