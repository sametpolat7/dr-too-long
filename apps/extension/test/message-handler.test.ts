import type { ShapeId } from '@dr-too-long/shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { handleMessage } from '../src/background/message-handler.ts';
import type { Message } from '../src/messages.ts';
import { readLanguageChoice, writeLanguageChoice } from '../src/settings/output-language.ts';
import { readShape } from '../src/settings/shape.ts';
import { settle } from './helpers.ts';

const popup = { url: 'chrome-extension://test-extension-id/popup.html' };
const page = {
  tab: { id: 7 },
  url: 'https://news.example.com/story',
  origin: 'https://news.example.com',
};

describe('handleMessage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('answers the saved language choice and keeps the channel open for it', async () => {
    await writeLanguageChoice('tr');
    const sendResponse = vi.fn();
    expect(handleMessage({ type: 'read-language' }, {}, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith('tr'));
  });

  it.each([
    ['a listed language', 'de'],
    ['Auto', null],
  ])('saves %s', async (_, choice) => {
    await writeLanguageChoice('tr');
    handleMessage({ type: 'save-language', choice }, {}, vi.fn());
    await vi.waitFor(async () => expect(await readLanguageChoice()).toBe(choice));
  });

  it('saves no language that the list leaves out', async () => {
    await writeLanguageChoice('tr');
    handleMessage({ type: 'save-language', choice: 'th' }, {}, vi.fn());
    await settle();
    expect(await readLanguageChoice()).toBe('tr');
  });

  it('answers the saved shape, Summary until one is saved', async () => {
    const sendResponse = vi.fn();
    expect(handleMessage({ type: 'read-shape' }, {}, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith('summary'));
  });

  it('answers Summary when the saved shape cannot be read', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValue(new Error('Storage is broken'));
    const sendResponse = vi.fn();
    expect(handleMessage({ type: 'read-shape' }, {}, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith('summary'));
  });

  it('saves a shape, and none that the list leaves out', async () => {
    handleMessage({ type: 'save-shape', shape: 'key-points' }, {}, vi.fn());
    await vi.waitFor(async () => expect(await readShape()).toBe('key-points'));
    handleMessage({ type: 'save-shape', shape: 'essay' as ShapeId }, {}, vi.fn());
    await settle();
    expect(await readShape()).toBe('key-points');
  });

  describe('for the every-site script', () => {
    let granted = true;
    const executeScript = vi.fn(async () => []);

    beforeEach(() => {
      granted = true;
      executeScript.mockClear();
      fakeBrowser.permissions.contains = async () => granted;
      fakeBrowser.scripting.removeCSS = async () => undefined;
      fakeBrowser.scripting.insertCSS = async () => undefined;
      fakeBrowser.scripting.executeScript = executeScript;
    });

    async function answer(message: Message, sender: object = page): Promise<unknown> {
      const sendResponse = vi.fn();
      expect(handleMessage(message, sender, sendResponse)).toBe(true);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce());
      return sendResponse.mock.calls[0]?.[0];
    }

    it('shows the bubble while the opt-in stands', async () => {
      expect(await answer({ type: 'read-every-site-bubble' })).toBe('shown');
    });

    it('stops the every-site script once the opt-in is withdrawn', async () => {
      granted = false;
      expect(await answer({ type: 'read-every-site-bubble' })).toBe('off');
    });

    it('keeps the bubble hidden where the reader turned it off in this tab', async () => {
      const { id = -1 } = await fakeBrowser.tabs.create({ url: 'https://news.example.com/story' });
      fakeBrowser.tabs.sendMessage = async () => undefined;
      handleMessage({ type: 'save-tab-bubble-hidden', tabId: id, hidden: true }, popup, vi.fn());
      const sender = { ...page, tab: { id } };
      await vi.waitFor(async () =>
        expect(await answer({ type: 'read-bubble-hidden' }, sender)).toBe(true),
      );
      expect(await answer({ type: 'read-every-site-bubble' }, sender)).toBe('hidden');
    });

    it("runs the summarize script in the sender's tab on a click", async () => {
      expect(await answer({ type: 'summarize-from-bubble' })).toBe(true);
      expect(executeScript).toHaveBeenCalledWith({
        target: { tabId: 7 },
        files: ['/content-scripts/summarize.js'],
      });
    });

    it('runs nothing once the opt-in is withdrawn, or without a tab', async () => {
      expect(await answer({ type: 'summarize-from-bubble' }, {})).toBe(false);
      granted = false;
      expect(await answer({ type: 'summarize-from-bubble' })).toBe(false);
      expect(executeScript).not.toHaveBeenCalled();
    });
  });

  describe('from the popup', () => {
    const executeScript = vi.fn(async () => []);
    const tellTab = vi.fn(async () => undefined);
    let tabId: number;

    beforeEach(async () => {
      executeScript.mockClear();
      tellTab.mockClear();
      fakeBrowser.scripting.removeCSS = async () => undefined;
      fakeBrowser.scripting.insertCSS = async () => undefined;
      fakeBrowser.scripting.executeScript = executeScript;
      fakeBrowser.tabs.sendMessage = tellTab;
      tabId = (await fakeBrowser.tabs.create({ url: 'https://news.example.com/story' })).id ?? -1;
    });

    async function nothingHappened() {
      await settle();
      expect(executeScript).not.toHaveBeenCalled();
      expect(tellTab).not.toHaveBeenCalled();
      expect(await fakeBrowser.storage.session.get()).toEqual({});
    }

    it('runs the summarize script in the tab it names', async () => {
      expect(handleMessage({ type: 'summarize-tab', tabId }, popup, vi.fn())).toBeUndefined();
      await vi.waitFor(() =>
        expect(executeScript).toHaveBeenCalledWith({
          target: { tabId },
          files: ['/content-scripts/summarize.js'],
        }),
      );
    });

    it('answers that the bubble is on in a tab that is gone', async () => {
      const sendResponse = vi.fn();
      handleMessage({ type: 'read-tab-bubble-hidden', tabId: 99 }, popup, sendResponse);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith(false));
    });

    it.each([
      ['the popup page open in a tab', { ...popup, tab: { id: 2 } }],
      ['the options page', { url: 'chrome-extension://test-extension-id/options.html' }],
      ['a content script', page],
    ])('takes no message about a tab from %s', async (_, sender) => {
      const sendResponse = vi.fn();
      const read = { type: 'read-tab-bubble-hidden', tabId } as const;
      expect(handleMessage(read, sender, sendResponse)).toBeUndefined();
      handleMessage({ type: 'summarize-tab', tabId }, sender, vi.fn());
      handleMessage({ type: 'save-tab-bubble-hidden', tabId, hidden: true }, sender, vi.fn());
      await nothingHappened();
      expect(sendResponse).not.toHaveBeenCalled();
    });

    it('takes no tab but by its whole number, and no setting but true or false', async () => {
      const malformed = [
        { type: 'summarize-tab', tabId: String(tabId) },
        { type: 'read-tab-bubble-hidden', tabId: tabId + 0.5 },
        { type: 'save-tab-bubble-hidden', tabId: String(tabId), hidden: true },
        { type: 'save-tab-bubble-hidden', tabId, hidden: 'true' },
      ] as unknown as Message[];
      for (const message of malformed) {
        expect(handleMessage(message, popup, vi.fn())).toBeUndefined();
      }
      await nothingHappened();
    });
  });

  it('opens the options page', () => {
    const openOptionsPage = vi.fn(() => Promise.resolve());
    fakeBrowser.runtime.openOptionsPage = openOptionsPage;
    expect(handleMessage({ type: 'open-options' }, {}, vi.fn())).toBeUndefined();
    expect(openOptionsPage).toHaveBeenCalledOnce();
  });
});
