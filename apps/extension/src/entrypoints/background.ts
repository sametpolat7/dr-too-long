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
  // Content scripts never read storage, and Chrome can enforce that for local storage from version
  // 140. Older versions refuse the call and keep their default.
  browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => undefined);
  browser.runtime.onInstalled.addListener(({ reason }) => {
    void addMenuItem();
    void syncEverySite();
    // A first install starts with setting up a key; updates leave the reader where they were.
    if (reason === 'install') void browser.runtime.openOptionsPage();
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
