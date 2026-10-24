import { browser } from 'wxt/browser';

// Requests from the content script that only the background can carry out.
export const MESSAGES = {
  openOptions: 'open-options',
  unsupportedPage: 'unsupported-page',
} as const;

export type Message = (typeof MESSAGES)[keyof typeof MESSAGES];

export function sendMessage(message: Message): void {
  void browser.runtime.sendMessage(message);
}
