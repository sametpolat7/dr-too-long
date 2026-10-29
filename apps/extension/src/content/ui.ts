// The custom elements that host the extension's own UI on the page. Events from inside their
// closed shadow roots reach the document with the host as their target.
export const CARD_UI = 'dr-too-long-card';
export const BUBBLE_UI = 'dr-too-long-bubble';

export const isOwnUi = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(`${CARD_UI}, ${BUBBLE_UI}`) !== null;
