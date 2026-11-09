import type { ShapeId } from '@dr-too-long/shared/contracts';
import { browser } from 'wxt/browser';
import type { LanguageChoice } from './languages.ts';

// A lint rule and the bundle check keep content scripts away from storage, so the background reads
// and saves the summary language and shape for them and keeps the sites where the reader turned the
// bubble off. The popup's messages name the tab it opened over, which only the popup may do.
// What the every-site script does with its bubble: show it, keep it hidden on a site the reader
// turned it off on, or stop, since a page keeps the script it was loaded with after the opt-in is
// withdrawn.
export type EverySiteBubble = 'shown' | 'hidden' | 'off';

export type Message =
  | { type: 'open-options' }
  | { type: 'unsupported-page' }
  | { type: 'read-language' }
  | { type: 'save-language'; choice: LanguageChoice }
  | { type: 'read-shape' }
  | { type: 'save-shape'; shape: ShapeId }
  | { type: 'read-bubble-hidden' }
  | { type: 'read-every-site-bubble' }
  | { type: 'summarize-from-bubble' }
  | { type: 'summarize-tab'; tabId: number }
  | { type: 'read-tab-bubble-hidden'; tabId: number }
  | { type: 'save-tab-bubble-hidden'; tabId: number; hidden: boolean };

// The worker's answer to each message that asks for one.
export interface Replies {
  'read-language': LanguageChoice;
  'read-shape': ShapeId;
  'read-bubble-hidden': boolean;
  'read-every-site-bubble': EverySiteBubble;
  // False once the opt-in is withdrawn.
  'summarize-from-bubble': boolean;
  'read-tab-bubble-hidden': boolean;
}

// The worker's message to a tab when the popup turns the bubble off or on for the tab's site.
export type TabMessage = { type: 'bubble-hidden'; hidden: boolean };

type Question = Extract<Message, { type: keyof Replies }>;
// The questions that carry nothing but their type.
type BareQuestion<M = Question> = M extends unknown ? (keyof M extends 'type' ? M : never) : never;

export function sendMessage(message: Message): void {
  void browser.runtime.sendMessage(message);
}

export function request<T extends BareQuestion['type']>(type: T): Promise<Replies[T]> {
  const message: Message = { type };
  return browser.runtime.sendMessage(message);
}

// For a question that carries data, such as the popup's about its tab.
export function ask<M extends Question>(message: M): Promise<Replies[M['type']]> {
  return browser.runtime.sendMessage(message);
}
