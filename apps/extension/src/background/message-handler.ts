import { DEFAULT_SHAPE, isShapeId } from '@dr-too-long/shared/contracts';
import { browser } from 'wxt/browser';
import { isListedLanguage } from '../languages.ts';
import type { Message, Replies } from '../messages.ts';
import { readLanguageChoice, writeLanguageChoice } from '../settings/output-language.ts';
import { readShape, writeShape } from '../settings/shape.ts';
import { flashBadge, summarizeTab } from './action.ts';
import { everySiteBubble, summarizeFromBubble } from './every-site.ts';
import {
  isBubbleHidden,
  isTabBubbleHidden,
  type Sender,
  setTabBubbleHidden,
} from './hidden-bubble.ts';

// Messages that name a tab are taken from the popup alone. Chrome sets the sender's address, and the
// popup, unlike a page open in a tab, has no tab.
const fromPopup = ({ tab, url }: Sender): boolean =>
  tab === undefined && url === browser.runtime.getURL('/popup.html');

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
      // Auto or a listed language only, so the summary window can always show the choice.
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
    case 'read-every-site-bubble':
      return reply(message.type, everySiteBubble(sender), 'off');
    case 'summarize-from-bubble':
      return reply(message.type, summarizeFromBubble(sender), false);
    case 'summarize-tab':
      if (fromPopup(sender) && Number.isInteger(message.tabId)) void summarizeTab(message.tabId);
      return;
    case 'read-tab-bubble-hidden':
      if (!fromPopup(sender) || !Number.isInteger(message.tabId)) return;
      return reply(message.type, isTabBubbleHidden(message.tabId), false);
    case 'save-tab-bubble-hidden':
      if (
        fromPopup(sender) &&
        Number.isInteger(message.tabId) &&
        typeof message.hidden === 'boolean'
      ) {
        void setTabBubbleHidden(message.tabId, message.hidden);
      }
      return;
  }
}
