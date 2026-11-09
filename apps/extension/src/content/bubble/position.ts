import { keepInside, type Place, type Size, VIEWPORT_MARGIN, viewportSize } from '../viewport.ts';

// Between the line and the button.
const GAP = 6;
// The button starts this far before the point where the reader let go, so the pointer rests on it.
const LEAD = 14;

// Where the reader let go: at the start of the first line rather than the end of the last, and in
// lines that run right to left.
export interface End {
  backward: boolean;
  rtl: boolean;
}

export interface Lines extends End {
  first: DOMRect;
  last: DOMRect;
}

// Line boxes in viewport coordinates, skipping the empty ones Chrome adds at line ends.
export function selectedLines(range: Range, end: End): Lines | undefined {
  const boxes = [...range.getClientRects()].filter((box) => box.width > 0 && box.height > 0);
  const first = boxes[0];
  const last = boxes.at(-1);
  return first && last ? { first, last, ...end } : undefined;
}

export function endOf(selection: Selection): End {
  const node = selection.focusNode;
  const element = node instanceof Element ? node : node?.parentElement;
  const rtl = element ? getComputedStyle(element).direction === 'rtl' : false;
  return { backward: isBackward(selection), rtl };
}

function isBackward(selection: Selection): boolean {
  const { anchorNode, focusNode } = selection;
  if (!anchorNode || !focusNode) return false;
  const anchor = document.createRange();
  anchor.setStart(anchorNode, selection.anchorOffset);
  return anchor.comparePoint(focusNode, selection.focusOffset) < 0;
}

export const inView = ({ first, last }: Lines): boolean =>
  last.bottom > 0 && first.top < viewportSize().height;

export function placeBubble(
  { first, last, backward, rtl }: Lines,
  bubble: Size,
  viewport: Size,
): Place {
  if (backward) {
    const above = first.top - GAP - bubble.height;
    const top = above >= VIEWPORT_MARGIN ? above : first.bottom + GAP;
    const left = rtl ? first.right + LEAD - bubble.width : first.left - LEAD;
    return keepInside({ left, top }, bubble, viewport);
  }
  const below = last.bottom + GAP;
  const fits = below + bubble.height <= viewport.height - VIEWPORT_MARGIN;
  const top = fits ? below : last.top - GAP - bubble.height;
  const left = rtl ? last.left + LEAD - bubble.width : last.right - LEAD;
  return keepInside({ left, top }, bubble, viewport);
}

// The line the button stands by: the last, or the first after a backward selection.
export const anchorOf = ({ first, last, backward }: Lines): DOMRect => (backward ? first : last);

// Where the reader let go on that line: at its end, or at its start after a backward selection.
function letGo(lines: Lines): Place {
  const line = anchorOf(lines);
  return { left: lines.backward === lines.rtl ? line.right : line.left, top: line.top };
}

// Where the button stands from that point once placed.
export function offsetFrom(lines: Lines, place: Place): Place {
  const end = letGo(lines);
  return { left: place.left - end.left, top: place.top - end.top };
}

// The same offset after a scroll or a resize, with no clamping, so the button moves with the text,
// leaves the screen with it and comes back with it.
export function atOffset(lines: Lines, offset: Place): Place {
  const end = letGo(lines);
  return { left: end.left + offset.left, top: end.top + offset.top };
}
