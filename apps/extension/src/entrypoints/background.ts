import { createSummarizer } from '@dr-too-long/shared/model';
import { activeModel } from '@dr-too-long/shared/providers';
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { flashBadge, summarizeTab } from '../background/action.ts';
import { addMenuItem } from '../background/menu.ts';
import { startPortServer } from '../background/port-server.ts';
import { MESSAGES, type Message } from '../messages.ts';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    console.info(`Dr. Too Long service worker ready (${reason})`);
    void addMenuItem();
  });
  // The keyboard shortcut is bound to _execute_action, so it arrives here as a click on the icon.
  browser.action.onClicked.addListener((tab) => {
    if (tab.id !== undefined) void summarizeTab(tab.id);
  });
  // The page's own selection is summarized rather than the menu's selectionText, which cannot be
  // anchored.
  browser.contextMenus.onClicked.addListener((_, tab) => {
    if (tab?.id !== undefined) void summarizeTab(tab.id);
  });
  browser.runtime.onMessage.addListener((message: Message, sender) => {
    if (message === MESSAGES.openOptions) void browser.runtime.openOptionsPage();
    if (message === MESSAGES.unsupportedPage && sender.tab?.id !== undefined) {
      void flashBadge(sender.tab.id);
    }
  });
  startPortServer((apiKey) => createSummarizer(activeModel(apiKey)));
});
