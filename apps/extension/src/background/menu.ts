import { browser } from 'wxt/browser';

// runtime.onInstalled also fires on extension and Chrome updates, when Chrome may still hold the
// item, so it is replaced rather than added twice.
export async function addMenuItem(): Promise<void> {
  await browser.contextMenus.removeAll();
  // Chrome shows the start of the selection in place of %s.
  browser.contextMenus.create({
    id: 'summarize-selection',
    title: 'Summarize “%s”',
    contexts: ['selection'],
  });
}
