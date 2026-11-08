import type { ShapeId } from '@dr-too-long/shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { handleMessage } from '../src/background/message-handler.ts';
import type { Message } from '../src/messages.ts';
import { readLanguageChoice, writeLanguageChoice } from '../src/settings/output-language.ts';
import { readShape } from '../src/settings/shape.ts';
import { settle } from './helpers.ts';

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
    const page = { tab: { id: 7 }, origin: 'https://news.example.com' };
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

    it('allows the bubble while the opt-in stands', async () => {
      expect(await answer({ type: 'read-every-site-bubble' })).toBe(true);
    });

    it('refuses the bubble once the opt-in is withdrawn', async () => {
      granted = false;
      expect(await answer({ type: 'read-every-site-bubble' })).toBe(false);
    });

    it('refuses the bubble where the reader hid it in this tab', async () => {
      handleMessage({ type: 'save-bubble-hidden', hidden: true }, page, vi.fn());
      await vi.waitFor(async () => expect(await answer({ type: 'read-bubble-hidden' })).toBe(true));
      expect(await answer({ type: 'read-every-site-bubble' })).toBe(false);
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

  it('opens the options page', () => {
    const openOptionsPage = vi.fn(() => Promise.resolve());
    fakeBrowser.runtime.openOptionsPage = openOptionsPage;
    expect(handleMessage({ type: 'open-options' }, {}, vi.fn())).toBeUndefined();
    expect(openOptionsPage).toHaveBeenCalledOnce();
  });
});
