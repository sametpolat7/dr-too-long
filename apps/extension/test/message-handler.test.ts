import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { handleMessage } from '../src/background/message-handler.ts';
import { readLanguageChoice, writeLanguageChoice } from '../src/settings/output-language.ts';

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
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await readLanguageChoice()).toBe('tr');
  });

  it('opens the options page', () => {
    const openOptionsPage = vi.fn(() => Promise.resolve());
    fakeBrowser.runtime.openOptionsPage = openOptionsPage;
    expect(handleMessage({ type: 'open-options' }, {}, vi.fn())).toBeUndefined();
    expect(openOptionsPage).toHaveBeenCalledOnce();
  });
});
