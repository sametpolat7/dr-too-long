import { browser } from 'wxt/browser';
import { ACTION_TITLE } from '../action-title.ts';
import { HIGHLIGHT_CSS } from '../highlight.ts';
import { SUMMARIZE_SCRIPT } from './scripts.ts';

const BADGE_MS = 3000;

export async function summarizeTab(tabId: number): Promise<void> {
  const style = { target: { tabId }, css: HIGHLIGHT_CSS };
  try {
    // Chrome inserts a copy per call and removes the last match; this keeps one copy per tab.
    await browser.scripting.removeCSS(style);
    await browser.scripting.insertCSS(style);
    await browser.scripting.executeScript({ target: { tabId }, files: [SUMMARIZE_SCRIPT] });
  } catch {
    await flashBadge(tabId);
  }
}

// Shown where the extension cannot work: Chrome's own pages, the Web Store, the PDF viewer and
// documents that cannot host the card. The tooltip says why while the badge shows.
export async function flashBadge(tabId: number): Promise<void> {
  try {
    await browser.action.setBadgeText({ tabId, text: '!' });
    await browser.action.setTitle({ tabId, title: 'Dr. Too Long cannot run on this page' });
    await new Promise((resolve) => setTimeout(resolve, BADGE_MS));
    await browser.action.setBadgeText({ tabId, text: '' });
    await browser.action.setTitle({ tabId, title: ACTION_TITLE });
  } catch {
    // The tab is gone, and its badge with it.
  }
}
