import type { ShapeId } from '@dr-too-long/shared/contracts';
import { browser } from 'wxt/browser';
import type { LanguageChoice } from './languages.ts';

// A lint rule and the bundle check keep content scripts away from storage, so the background reads
// and saves the summary language and shape for them and keeps the sites where the reader hid the
// bubble.
export type Message =
  | { type: 'open-options' }
  | { type: 'unsupported-page' }
  | { type: 'read-language' }
  | { type: 'save-language'; choice: LanguageChoice }
  | { type: 'read-shape' }
  | { type: 'save-shape'; shape: ShapeId }
  | { type: 'read-bubble-hidden' }
  | { type: 'save-bubble-hidden'; hidden: boolean }
  | { type: 'read-every-site-bubble' }
  | { type: 'summarize-from-bubble' };

// The worker's answer to each message that asks for one.
export interface Replies {
  'read-language': LanguageChoice;
  'read-shape': ShapeId;
  'read-bubble-hidden': boolean;
  // Whether the every-site script may show the bubble on this page.
  'read-every-site-bubble': boolean;
  // False once the opt-in is withdrawn.
  'summarize-from-bubble': boolean;
}

export function sendMessage(message: Message): void {
  void browser.runtime.sendMessage(message);
}

export function request<T extends keyof Replies>(type: T): Promise<Replies[T]> {
  const message: Message = { type };
  return browser.runtime.sendMessage(message);
}
