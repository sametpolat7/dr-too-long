import { browser } from 'wxt/browser';
import { isListedLanguage } from '../languages.ts';
import type { Message } from '../messages.ts';
import { readLanguageChoice, writeLanguageChoice } from '../settings/output-language.ts';
import { flashBadge } from './action.ts';
import { isBubbleHidden, type Sender, setBubbleHidden } from './hidden-bubble.ts';

// Returns true while an answer is still to come, which keeps Chrome's message channel open.
export function handleMessage(
  message: Message,
  sender: Sender,
  sendResponse: (response: unknown) => void,
): true | undefined {
  switch (message.type) {
    case 'open-options':
      void browser.runtime.openOptionsPage();
      return;
    case 'unsupported-page':
      if (sender.tab?.id !== undefined) void flashBadge(sender.tab.id);
      return;
    case 'read-language':
      void readLanguageChoice().then(sendResponse);
      return true;
    case 'save-language':
      // Auto or a listed language only, so the options page can always show the choice.
      if (message.choice === null || isListedLanguage(message.choice)) {
        void writeLanguageChoice(message.choice);
      }
      return;
    case 'read-bubble-hidden':
      void isBubbleHidden(sender).then(sendResponse);
      return true;
    case 'save-bubble-hidden':
      void setBubbleHidden(sender, message.hidden);
      return;
  }
}
