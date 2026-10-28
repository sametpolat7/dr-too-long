export const HIGHLIGHT_NAME = 'dr-too-long-passage';

// Styles page text, so it must live in the page's tree scope, never in the card's shadow root.
export const HIGHLIGHT_CSS = `::highlight(${HIGHLIGHT_NAME}) { background-color: #ffe58f; color: #1a1a1a; }`;
