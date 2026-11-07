import { createSummarizer, providerModel } from '@dr-too-long/shared/model';
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { summarizeTab } from '../background/action.ts';
import { syncEverySite } from '../background/every-site.ts';
import { forgetTab } from '../background/hidden-bubble.ts';
import { addMenuItem } from '../background/menu.ts';
import { handleMessage } from '../background/message-handler.ts';
import { startPortServer } from '../background/port-server.ts';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    console.info(`Dr. Too Long service worker ready (${reason})`);
    void addMenuItem();
    void syncEverySite();
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
  browser.runtime.onMessage.addListener(handleMessage);
  browser.tabs.onRemoved.addListener((tabId) => void forgetTab(tabId));
  browser.permissions.onAdded.addListener(() => void syncEverySite());
  browser.permissions.onRemoved.addListener(() => void syncEverySite());
  startPortServer(({ provider, key }) => createSummarizer(providerModel(provider, key)));
});
