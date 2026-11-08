import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { forgetTab, isBubbleHidden } from '../src/background/hidden-bubble.ts';
import { handleMessage } from '../src/background/message-handler.ts';
import { settle } from './helpers.ts';

const site = { tab: { id: 7 }, origin: 'https://news.example.com' };

async function read(sender: { tab?: { id?: number }; origin?: string }): Promise<unknown> {
  const sendResponse = vi.fn();
  expect(handleMessage({ type: 'read-bubble-hidden' }, sender, sendResponse)).toBe(true);
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce());
  return sendResponse.mock.calls[0]?.[0];
}

async function hide(sender: { tab?: { id?: number }; origin?: string }, hidden = true) {
  handleMessage({ type: 'save-bubble-hidden', hidden }, sender, vi.fn());
  await vi.waitFor(async () => expect(await isBubbleHidden(sender)).toBe(hidden));
}

describe('the bubble hidden on a site', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('is hidden on that site in that tab only', async () => {
    expect(await read(site)).toBe(false);
    await hide(site);
    expect(await read(site)).toBe(true);
    expect(await read({ ...site, origin: 'https://example.org' })).toBe(false);
    expect(await read({ ...site, tab: { id: 8 } })).toBe(false);
  });

  it('shows again on that site and leaves the others hidden', async () => {
    const other = { ...site, origin: 'http://example.org:8080' };
    await hide(site);
    await hide(other);
    await hide(site, false);
    expect(await read(site)).toBe(false);
    expect(await read(other)).toBe(true);
  });

  it('keeps each site once, in memory for its tab', async () => {
    await hide(site);
    await hide(site);
    expect(await fakeBrowser.storage.session.get()).toEqual({
      'hiddenBubble:7': ['news.example.com'],
    });
    expect(await fakeBrowser.storage.local.get()).toEqual({});
  });

  it('keeps nothing for the tab once its last site shows again', async () => {
    await hide(site);
    await hide(site, false);
    expect(await fakeBrowser.storage.session.get()).toEqual({});
  });

  it('is forgotten when the tab closes', async () => {
    await hide(site);
    await forgetTab(7);
    expect(await read(site)).toBe(false);
  });

  it.each([
    ['an opaque origin', { ...site, origin: 'null' }],
    ['an extension page', { ...site, origin: 'chrome-extension://abcdefghijklmnop' }],
    ['a file', { ...site, origin: 'file://' }],
    ['no tab', { origin: site.origin }],
  ])('keeps nothing for %s', async (_, sender) => {
    handleMessage({ type: 'save-bubble-hidden', hidden: true }, sender, vi.fn());
    await settle();
    expect(await read(sender)).toBe(false);
    expect(await fakeBrowser.storage.session.get()).toEqual({});
  });
});
