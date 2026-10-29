import { browser } from 'wxt/browser';

// Requests from the content script that only the background can carry out. The content script
// cannot reach the settings, so the background reads and saves the summary language for it.
export type Message =
  | { type: 'open-options' }
  | { type: 'unsupported-page' }
  | { type: 'read-language' }
  | { type: 'save-language'; choice: string | null };

export function sendMessage(message: Message): void {
  void browser.runtime.sendMessage(message);
}

// The saved language choice; null is Auto.
export function requestLanguageChoice(): Promise<string | null> {
  const message: Message = { type: 'read-language' };
  return browser.runtime.sendMessage(message);
}
