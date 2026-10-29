// The custom elements that host the extension's own UI on the page. Events from inside their
// closed shadow roots reach the document with the host as their target.
export const CARD_UI = 'dr-too-long-card';
export const BUBBLE_UI = 'dr-too-long-bubble';

export const isOwnUi = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(`${CARD_UI}, ${BUBBLE_UI}`) !== null;

// Dispatched on the document when a gesture or a bubble starts the summarize script, which brings
// its own bubble, so the every-site script stops.
export const SUMMARIZE_STARTED = 'dr-too-long:summarize-started';

// Only HTML and XHTML documents create elements that can host a shadow root; Chrome's XML viewer
// and SVG documents cannot.
export function canHostShadowRoot(): boolean {
  return document instanceof HTMLDocument || document.contentType === 'application/xhtml+xml';
}
