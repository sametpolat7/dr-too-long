import { browser } from 'wxt/browser';
import { HIGHLIGHT_CSS } from '../highlight.ts';

// WXT emits the runtime-registered content script under this path.
const CONTENT_SCRIPT = '/content-scripts/summarize.js';
const BADGE_MS = 3000;

// Runs the content script in the tab's top frame, with the highlight rule in place before it.
export async function summarizeTab(tabId: number): Promise<void> {
  const style = { target: { tabId }, css: HIGHLIGHT_CSS };
  try {
    // Chrome inserts a copy per call and removes the last match; this keeps one copy per tab.
    await browser.scripting.removeCSS(style);
    await browser.scripting.insertCSS(style);
    await browser.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
  } catch {
    await flashBadge(tabId);
  }
}

// Shown where the extension cannot work: Chrome's own pages, the Web Store, the PDF viewer and
// documents that cannot host the card.
export async function flashBadge(tabId: number): Promise<void> {
  try {
    await browser.action.setBadgeText({ tabId, text: '!' });
    await new Promise((resolve) => setTimeout(resolve, BADGE_MS));
    await browser.action.setBadgeText({ tabId, text: '' });
  } catch {
    // The tab is gone, and its badge with it.
  }
}
