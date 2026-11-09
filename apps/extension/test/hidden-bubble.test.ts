import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { forgetTab } from '../src/background/hidden-bubble.ts';
import { handleMessage } from '../src/background/message-handler.ts';
import { settle } from './helpers.ts';

const popup = { url: 'chrome-extension://test-extension-id/popup.html' };
// Chrome reports the page's address and origin with each message from a content script.
const page = (tabId: number, url: string, origin = new URL(url).origin) => ({
  tab: { id: tabId },
  url,
  origin,
});
const sendMessage = vi.fn();

async function openTab(url?: string): Promise<number> {
  const { id } = await fakeBrowser.tabs.create({ url });
  return id ?? -1;
}

// What a content script in the tab hears when it asks on start.
async function readFromPage(sender: { tab?: { id?: number }; url?: string }): Promise<unknown> {
  const sendResponse = vi.fn();
  expect(handleMessage({ type: 'read-bubble-hidden' }, sender, sendResponse)).toBe(true);
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce());
  return sendResponse.mock.calls[0]?.[0];
}

async function readFromPopup(tabId: number): Promise<unknown> {
  const sendResponse = vi.fn();
  expect(handleMessage({ type: 'read-tab-bubble-hidden', tabId }, popup, sendResponse)).toBe(true);
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce());
  return sendResponse.mock.calls[0]?.[0];
}

// Resolves once the worker has told the tab, which it does after saving.
async function turnOff(tabId: number, hidden = true) {
  sendMessage.mockClear();
  handleMessage({ type: 'save-tab-bubble-hidden', tabId, hidden }, popup, vi.fn());
  await vi.waitFor(() =>
    expect(sendMessage).toHaveBeenCalledWith(tabId, { type: 'bubble-hidden', hidden }),
  );
}

describe('the bubble turned off on a site', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    sendMessage.mockReset().mockResolvedValue(undefined);
    fakeBrowser.tabs.sendMessage = sendMessage;
  });

  it('is off on the tab’s site in that tab only', async () => {
    const tab = await openTab('https://news.example.com/story');
    const other = await openTab('https://news.example.com/other');
    expect(await readFromPopup(tab)).toBe(false);
    await turnOff(tab);
    expect(await readFromPopup(tab)).toBe(true);
    expect(await readFromPage(page(tab, 'https://news.example.com/other'))).toBe(true);
    expect(await readFromPage(page(tab, 'https://example.org/'))).toBe(false);
    expect(await readFromPopup(other)).toBe(false);
  });

  it('turns back on for that site and leaves the others off', async () => {
    const tab = await openTab('https://news.example.com/story');
    await turnOff(tab);
    await fakeBrowser.tabs.update(tab, { url: 'http://example.org:8080/' });
    await turnOff(tab);
    await fakeBrowser.tabs.update(tab, { url: 'https://news.example.com/next' });
    await turnOff(tab, false);
    expect(await readFromPopup(tab)).toBe(false);
    expect(await readFromPage(page(tab, 'http://example.org:8080/'))).toBe(true);
  });

  it('keeps each site once, in memory for its tab', async () => {
    const tab = await openTab('https://news.example.com/story');
    await turnOff(tab);
    await turnOff(tab);
    expect(await fakeBrowser.storage.session.get()).toEqual({
      [`hiddenBubble:${tab}`]: ['news.example.com'],
    });
    expect(await fakeBrowser.storage.local.get()).toEqual({});
  });

  it('keeps nothing for the tab once its last site shows again', async () => {
    const tab = await openTab('https://news.example.com/story');
    await turnOff(tab);
    await turnOff(tab, false);
    expect(await fakeBrowser.storage.session.get()).toEqual({});
  });

  it('is forgotten when the tab closes', async () => {
    const tab = await openTab('https://news.example.com/story');
    await turnOff(tab);
    await forgetTab(tab);
    expect(await readFromPopup(tab)).toBe(false);
  });

  it('is saved when the tab runs no script to tell', async () => {
    sendMessage.mockRejectedValue(
      new Error('Could not establish connection. Receiving end does not exist.'),
    );
    const tab = await openTab('https://news.example.com/story');
    await turnOff(tab);
    expect(await readFromPopup(tab)).toBe(true);
  });

  it.each([
    ['Chrome’s own page', 'chrome://extensions/'],
    ['a file', 'file:///notes.html'],
    ['a tab with no address yet', undefined],
  ])('keeps and tells nothing for %s', async (_, url) => {
    const tab = await openTab(url);
    handleMessage({ type: 'save-tab-bubble-hidden', tabId: tab, hidden: true }, popup, vi.fn());
    await settle();
    expect(await readFromPopup(tab)).toBe(false);
    expect(await fakeBrowser.storage.session.get()).toEqual({});
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('reads as off for a script in a sandboxed page, whose origin is opaque', async () => {
    const tab = await openTab('https://news.example.com/story');
    await turnOff(tab);
    expect(await readFromPage(page(tab, 'https://news.example.com/story', 'null'))).toBe(true);
  });

  it.each([
    ['an extension page', 'chrome-extension://abcdefghijklmnop/page.html'],
    ['a file', 'file:///Users/reader/story.html'],
  ])('reads as on for a script in %s', async (_, url) => {
    const tab = await openTab('https://news.example.com/story');
    await turnOff(tab);
    expect(await readFromPage(page(tab, url))).toBe(false);
  });

  it('reads as on for a script outside any tab', async () => {
    const tab = await openTab('https://news.example.com/story');
    await turnOff(tab);
    expect(await readFromPage({ url: 'https://news.example.com/story' })).toBe(false);
  });
});
