import { browser } from 'wxt/browser';

// Content scripts cannot reach storage, so the background reads and saves the summary language for
// them and keeps the sites where the reader hid the bubble.
export type Message =
  | { type: 'open-options' }
  | { type: 'unsupported-page' }
  | { type: 'read-language' }
  | { type: 'save-language'; choice: string | null }
  | { type: 'read-bubble-hidden' }
  | { type: 'save-bubble-hidden'; hidden: boolean }
  | { type: 'read-every-site' }
  | { type: 'summarize' };

export function sendMessage(message: Message): void {
  void browser.runtime.sendMessage(message);
}

// Null is Auto.
export function requestLanguageChoice(): Promise<string | null> {
  const message: Message = { type: 'read-language' };
  return browser.runtime.sendMessage(message);
}

// Whether the reader hid the bubble on this page's site in this tab.
export function requestBubbleHidden(): Promise<boolean> {
  const message: Message = { type: 'read-bubble-hidden' };
  return browser.runtime.sendMessage(message);
}

// Whether the every-site script may show the bubble on this page.
export function requestEverySiteBubble(): Promise<boolean> {
  const message: Message = { type: 'read-every-site' };
  return browser.runtime.sendMessage(message);
}

// False once the opt-in is withdrawn.
export function requestSummarize(): Promise<boolean> {
  const message: Message = { type: 'summarize' };
  return browser.runtime.sendMessage(message);
}
