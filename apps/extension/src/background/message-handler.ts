import { DEFAULT_SHAPE, isShapeId } from '@dr-too-long/shared/contracts';
import { browser } from 'wxt/browser';
import { isListedLanguage } from '../languages.ts';
import type { Message, Replies } from '../messages.ts';
import { readLanguageChoice, writeLanguageChoice } from '../settings/output-language.ts';
import { readShape, writeShape } from '../settings/shape.ts';
import { flashBadge } from './action.ts';
import { everySiteBubbleShown, summarizeFromBubble } from './every-site.ts';
import { isBubbleHidden, type Sender, setBubbleHidden } from './hidden-bubble.ts';

// Returns true while an answer is still to come, which keeps Chrome's message channel open.
export function handleMessage(
  message: Message,
  sender: Sender,
  sendResponse: (response: unknown) => void,
): true | undefined {
  // Typed per message, so an answer of the wrong type fails to compile. A failed read answers what
  // a missing setting reads as, so the asking script never waits.
  const reply = <T extends keyof Replies>(
    _: T,
    answer: Promise<Replies[T]>,
    fallback: Replies[T],
  ): true => {
    void answer.catch(() => fallback).then(sendResponse);
    return true;
  };
  switch (message.type) {
    case 'open-options':
      void browser.runtime.openOptionsPage();
      return;
    case 'unsupported-page':
      if (sender.tab?.id !== undefined) void flashBadge(sender.tab.id);
      return;
    case 'read-language':
      return reply(message.type, readLanguageChoice(), null);
    case 'save-language':
      // Auto or a listed language only, so the options page can always show the choice.
      if (message.choice === null || isListedLanguage(message.choice)) {
        void writeLanguageChoice(message.choice);
      }
      return;
    case 'read-shape':
      return reply(message.type, readShape(), DEFAULT_SHAPE);
    case 'save-shape':
      if (isShapeId(message.shape)) void writeShape(message.shape);
      return;
    case 'read-bubble-hidden':
      return reply(message.type, isBubbleHidden(sender), false);
    case 'save-bubble-hidden':
      if (typeof message.hidden === 'boolean') void setBubbleHidden(sender, message.hidden);
      return;
    case 'read-every-site-bubble':
      return reply(message.type, everySiteBubbleShown(sender), false);
    case 'summarize-from-bubble':
      return reply(message.type, summarizeFromBubble(sender), false);
  }
}
