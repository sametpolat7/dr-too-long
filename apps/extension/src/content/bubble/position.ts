// Space between the text and the bubble, and between the bubble and the viewport's edge.
const GAP = 8;

export interface Lines {
  first: DOMRect;
  last: DOMRect;
}

interface Size {
  width: number;
  height: number;
}

// The selection's first and last line boxes in viewport coordinates, skipping the empty boxes
// Chrome adds at line ends.
export function selectedLines(range: Range): Lines | undefined {
  const boxes = [...range.getClientRects()].filter((box) => box.width > 0 && box.height > 0);
  const first = boxes[0];
  const last = boxes.at(-1);
  return first && last ? { first, last } : undefined;
}

// The layout viewport without scrollbars. The root element's client size would serve on most pages,
// but in quirks mode it measures the whole document.
export const viewportSize = (): Size =>
  window.visualViewport ?? { width: window.innerWidth, height: window.innerHeight };

export const inView = ({ first, last }: Lines): boolean =>
  last.bottom > 0 && first.top < viewportSize().height;

// Above the first line, or below the last when the first is too near the top, and inside the
// viewport either way.
export function placeBubble(
  { first, last }: Lines,
  bubble: Size,
  viewport: Size,
): { left: number; top: number } {
  const above = first.top - GAP - bubble.height;
  return {
    left: clamp(first.left, GAP, viewport.width - GAP - bubble.width),
    top: clamp(
      above >= GAP ? above : last.bottom + GAP,
      GAP,
      viewport.height - GAP - bubble.height,
    ),
  };
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));
