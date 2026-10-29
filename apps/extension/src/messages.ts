import { browser } from 'wxt/browser';

// Requests from the content script that only the background can carry out. The content script
// cannot reach storage, so the background reads and saves the summary language for it and keeps
// the sites where the reader hid the bubble.
export type Message =
  | { type: 'open-options' }
  | { type: 'unsupported-page' }
  | { type: 'read-language' }
  | { type: 'save-language'; choice: string | null }
  | { type: 'read-bubble-hidden' }
  | { type: 'save-bubble-hidden'; hidden: boolean };

export function sendMessage(message: Message): void {
  void browser.runtime.sendMessage(message);
}

// The saved language choice; null is Auto.
export function requestLanguageChoice(): Promise<string | null> {
  const message: Message = { type: 'read-language' };
  return browser.runtime.sendMessage(message);
}

// Whether the reader hid the bubble on this page's site in this tab.
export function requestBubbleHidden(): Promise<boolean> {
  const message: Message = { type: 'read-bubble-hidden' };
  return browser.runtime.sendMessage(message);
}
