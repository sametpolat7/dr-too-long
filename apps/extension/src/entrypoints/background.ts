import { createSummarizer } from '@dr-too-long/shared/model';
import { activeModel } from '@dr-too-long/shared/providers';
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { flashBadge, summarizeTab } from '../background/action.ts';
import { startPortServer } from '../background/port-server.ts';
import { MESSAGES, type Message } from '../messages.ts';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    console.info(`Dr. Too Long service worker ready (${reason})`);
  });
  browser.action.onClicked.addListener((tab) => {
    if (tab.id !== undefined) void summarizeTab(tab.id);
  });
  browser.runtime.onMessage.addListener((message: Message, sender) => {
    if (message === MESSAGES.openOptions) void browser.runtime.openOptionsPage();
    if (message === MESSAGES.unsupportedPage && sender.tab?.id !== undefined) {
      void flashBadge(sender.tab.id);
    }
  });
  startPortServer((apiKey) => createSummarizer(activeModel(apiKey)));
});
