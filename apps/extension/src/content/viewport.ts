export interface Size {
  width: number;
  height: number;
}

export interface Place {
  left: number;
  top: number;
}

// How far the summary window and the Summarize button stay inside the viewport's edges.
export const VIEWPORT_MARGIN = 8;

// The layout viewport without scrollbars. The root element's client size would serve on most pages,
// but in quirks mode it measures the whole document.
export const viewportSize = (): Size =>
  window.visualViewport ?? { width: window.innerWidth, height: window.innerHeight };

export function keepInside({ left, top }: Place, box: Size, viewport: Size): Place {
  return {
    left: clamp(left, VIEWPORT_MARGIN, viewport.width - VIEWPORT_MARGIN - box.width),
    top: clamp(top, VIEWPORT_MARGIN, viewport.height - VIEWPORT_MARGIN - box.height),
  };
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));
