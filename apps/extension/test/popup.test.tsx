import { render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BUBBLE_UI } from '../src/content/ui.ts';
import type { Message } from '../src/messages.ts';
import { Popup } from '../src/popup/Popup.tsx';
import { writeApiKey } from '../src/settings/api-key.ts';

const PAGE = 'https://news.example.com/story';
const BLOCKED = 'Chrome doesn’t let extensions run on this page.';
const NOTHING_SELECTED = 'Select a few sentences on the page first.';
const IN_FRAME = 'Text inside embedded frames can’t be summarized.';
const BUSY = 'This page is busy. Try again in a moment.';
const TURN_OFF = 'Turn off on this site';
const SENTENCE = 'The keeper logged every ship that passed the cape.';

let granted: boolean;
let hiddenHere: boolean;
let sent: Message[];
const executeScript = vi.fn();
const getAll = vi.fn();
const openOptionsPage = vi.fn(async () => undefined);
const request = vi.fn(async () => {
  granted = true;
  return true;
});

interface Injection {
  func: (...args: unknown[]) => unknown;
  args: unknown[];
}

// Runs the probe in this document, as Chrome runs it in the page.
const runInPage = async ({ func, args }: Injection) => [
  { frameId: 0, documentId: 'page', result: func(...args) },
];

function selectText(text: string) {
  const paragraph = document.body.appendChild(document.createElement('p'));
  paragraph.textContent = text;
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  getSelection()?.addRange(range);
}

async function show() {
  const container = document.body.appendChild(document.createElement('div'));
  await act(async () => {
    render(<Popup />, container);
  });
  await vi.waitFor(() => expect(container.querySelector('main')).not.toBeNull());
  return container;
}

const button = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll('button')].find((each) => each.textContent?.startsWith(label));

// The text an ARIA reference on the element points at.
const referred = (element: Element | undefined, attribute: string) =>
  document.getElementById(element?.getAttribute(attribute) ?? '')?.textContent;

async function click(element: HTMLElement | null | undefined) {
  await act(async () => {
    element?.click();
  });
}

describe('Popup', () => {
  beforeEach(async () => {
    document.body.replaceChildren();
    getSelection()?.removeAllRanges();
    fakeBrowser.reset();
    granted = false;
    hiddenHere = false;
    sent = [];
    await fakeBrowser.windows.create({ focused: true });
    await fakeBrowser.tabs.create({ url: PAGE, active: true });
    executeScript.mockReset().mockImplementation(runInPage);
    getAll.mockReset().mockResolvedValue([{ name: 'summarize', shortcut: '⇧⌘S' }]);
    openOptionsPage.mockClear();
    request.mockClear();
    vi.spyOn(window, 'close').mockImplementation(() => undefined);
    fakeBrowser.scripting.executeScript = executeScript;
    fakeBrowser.commands.getAll = getAll;
    fakeBrowser.runtime.openOptionsPage = openOptionsPage;
    fakeBrowser.permissions.contains = async () => granted;
    fakeBrowser.permissions.request = request;
    fakeBrowser.permissions.onAdded.addListener = () => undefined;
    fakeBrowser.permissions.onAdded.removeListener = () => undefined;
    fakeBrowser.permissions.onRemoved.addListener = () => undefined;
    fakeBrowser.permissions.onRemoved.removeListener = () => undefined;
    fakeBrowser.runtime.onMessage.addListener((message: Message, _, sendResponse) => {
      sent.push(message);
      if (message.type !== 'read-tab-bubble-hidden') return;
      sendResponse(hiddenHere);
      return true;
    });
    await writeApiKey({ provider: 'google', key: 'test-gemini-key' });
  });

  it('asks for a key first, and opens the settings for it', async () => {
    await fakeBrowser.storage.local.clear();
    const container = await show();
    expect(container.querySelector('h1')?.textContent).toBe('Dr. Too Long');
    expect(container.querySelector('strong')?.textContent).toBe('Add your API key to start.');
    expect(container.textContent).toContain(
      'Dr. Too Long runs on your own OpenAI, Claude or Gemini key. You pay only your provider.',
    );
    expect(container.querySelectorAll('button, input')).toHaveLength(1);
    const setUp = button(container, 'Set up');
    await vi.waitFor(() => expect(document.activeElement).toBe(setUp));
    await click(setUp);
    expect(openOptionsPage).toHaveBeenCalledOnce();
    expect(window.close).toHaveBeenCalledOnce();
  });

  it('leaves the page and the tab alone when no key is saved', async () => {
    await fakeBrowser.storage.local.clear();
    const query = vi.spyOn(fakeBrowser.tabs, 'query');
    await show();
    expect(query).not.toHaveBeenCalled();
    expect(executeScript).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it('shows nothing until everything is read', async () => {
    let answer: (commands: object[]) => void = () => undefined;
    getAll.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const container = document.body.appendChild(document.createElement('div'));
    await act(async () => {
      render(<Popup />, container);
    });
    expect(container.innerHTML).toBe('');
    await act(async () => answer([]));
    await vi.waitFor(() => expect(container.querySelector('main')).not.toBeNull());
  });

  it('hands the selection to the worker for the tab, saying how much is selected', async () => {
    selectText(SENTENCE);
    const container = await show();
    const summarize = button(container, 'Summarize selection');
    expect(summarize?.getAttribute('aria-disabled')).toBe('false');
    expect(referred(summarize, 'aria-labelledby')).toBe('Summarize selection');
    expect(referred(summarize, 'aria-describedby')).toBe('About 9 words selected');
    expect(summarize?.textContent).toContain('→');
    await vi.waitFor(() => expect(document.activeElement).toBe(summarize));
    await click(summarize);
    expect(sent).toContainEqual({ type: 'summarize-tab', tabId: 1 });
    expect(window.close).toHaveBeenCalledOnce();
  });

  it.each([
    ['one word', 'Lighthouse', 'About 1 word selected'],
    ['many words', 'word '.repeat(1200), 'About 1,200 words selected'],
  ])('counts %s', async (_, text, line) => {
    selectText(text);
    const container = await show();
    expect(referred(button(container, 'Summarize selection'), 'aria-describedby')).toBe(line);
  });

  it('learns from the page how many words are selected and whether the bubble is there, never the text', async () => {
    selectText(SENTENCE);
    document.body.append(document.createElement(BUBBLE_UI));
    await show();
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 1 }, injectImmediately: true, args: [BUBBLE_UI] }),
    );
    expect(await executeScript.mock.results[0]?.value).toEqual([
      expect.objectContaining({ result: { selected: true, words: 9, frame: false, bubble: true } }),
    ]);
  });

  it('offers the shortcut under the button', async () => {
    selectText(SENTENCE);
    const container = await show();
    const key = container.querySelector('kbd');
    expect(key?.textContent).toBe('⇧⌘S');
    expect(key?.parentElement?.textContent).toBe(
      'Or press ⇧⌘S on any page to summarize without opening this card.',
    );
    expect(button(container, 'Summarize selection')?.contains(key ?? null)).toBe(false);
  });

  it('leaves the shortcut out when none is set', async () => {
    selectText(SENTENCE);
    getAll.mockResolvedValue([{ name: 'summarize', shortcut: '' }]);
    const container = await show();
    expect(container.querySelector('kbd')).toBeNull();
    expect(container.textContent).not.toContain('Or press');
  });

  it.each([
    ['nothing is selected', NOTHING_SELECTED, true, () => selectText('   ')],
    [
      'an embedded frame has the focus',
      IN_FRAME,
      true,
      () => {
        selectText(SENTENCE);
        document.body.appendChild(document.createElement('iframe')).focus();
      },
    ],
    [
      'Chrome keeps extensions off the page',
      BLOCKED,
      false,
      () => executeScript.mockRejectedValue(new Error('Cannot access a chrome:// URL')),
    ],
  ])('turns Summarize selection off and says why when %s', async (_, reason, shortcut, arrange) => {
    arrange();
    const container = await show();
    const summarize = button(container, 'Summarize selection');
    expect(summarize?.getAttribute('aria-disabled')).toBe('true');
    expect(referred(summarize, 'aria-describedby')).toBe(reason);
    expect(summarize?.textContent).not.toContain('→');
    expect(container.querySelector('kbd') !== null).toBe(shortcut);
    // It keeps the focus, so a screen reader reads why, and a click does nothing.
    await vi.waitFor(() => expect(document.activeElement).toBe(summarize));
    await click(summarize);
    expect(sent).not.toContainEqual(expect.objectContaining({ type: 'summarize-tab' }));
    expect(window.close).not.toHaveBeenCalled();
  });

  it('turns Summarize selection off when the page does not answer within a second', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    selectText(SENTENCE);
    executeScript.mockReturnValue(new Promise(() => undefined));
    const container = document.body.appendChild(document.createElement('div'));
    await act(async () => {
      render(<Popup />, container);
    });
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalled());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    vi.useRealTimers();
    const summarize = button(container, 'Summarize selection');
    expect(summarize?.getAttribute('aria-disabled')).toBe('true');
    expect(referred(summarize, 'aria-describedby')).toBe(BUSY);
    expect(summarize?.textContent).not.toContain('→');
  });

  it('offers the bubble on every site, asking Chrome from the click', async () => {
    const container = await show();
    const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(box?.closest('label')?.textContent).toBe(
      'Show a Summarize button when I select text, on every site',
    );
    expect(box?.checked).toBe(false);
    expect(container.textContent).toContain(
      'Chrome will ask for access to all https sites. Nothing is sent until you click the button.',
    );
    await click(box);
    expect(request).toHaveBeenCalledWith({ origins: ['https://*/*'] });
    expect(box?.checked).toBe(true);
    expect(container.textContent).not.toContain('Chrome will ask');
  });

  it('says so when Chrome cannot change the access', async () => {
    request.mockRejectedValueOnce(new Error('Chrome refused'));
    const container = await show();
    await click(container.querySelector<HTMLInputElement>('input[type="checkbox"]'));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Chrome could not change this access. Try again.',
    );
  });

  it.each([
    ['the bubble shows on every site', () => (granted = true)],
    ['the page holds the bubble', () => document.body.append(document.createElement(BUBBLE_UI))],
  ])('turns the bubble off and on for the site when %s', async (_, arrange) => {
    arrange();
    const container = await show();
    const toggle = button(container, TURN_OFF);
    await act(async () => toggle?.focus());
    await click(toggle);
    expect(sent).toContainEqual({ type: 'save-tab-bubble-hidden', tabId: 1, hidden: true });
    expect(toggle?.parentElement?.textContent).toBe(
      'Off on news.example.com until this tab closes. Turn back on',
    );
    expect(document.activeElement).toBe(toggle);
    await click(toggle);
    expect(sent).toContainEqual({ type: 'save-tab-bubble-hidden', tabId: 1, hidden: false });
    expect(toggle?.textContent).toBe(TURN_OFF);
  });

  it('shows the bubble off where the reader turned it off in this tab', async () => {
    granted = true;
    hiddenHere = true;
    const container = await show();
    expect(sent).toContainEqual({ type: 'read-tab-bubble-hidden', tabId: 1 });
    expect(button(container, 'Turn back on')).toBeDefined();
  });

  it.each([
    ['there is no bubble on the page or on every site', PAGE, () => undefined],
    [
      'Chrome keeps extensions off the page',
      PAGE,
      () => {
        granted = true;
        executeScript.mockRejectedValue(new Error('Cannot access a chrome:// URL'));
      },
    ],
    ['the page is not on the web', 'file:///notes.html', () => (granted = true)],
    ['every site does not cover the http page', 'http://example.com/', () => (granted = true)],
  ])('offers no switch for the site when %s', async (_, url, arrange) => {
    await fakeBrowser.tabs.update(1, { url });
    arrange();
    const container = await show();
    expect(button(container, TURN_OFF)).toBeUndefined();
  });

  it('opens even when the worker cannot answer', async () => {
    fakeBrowser.runtime.onMessage.removeAllListeners();
    granted = true;
    const container = await show();
    expect(button(container, TURN_OFF)).toBeDefined();
  });

  it('names the saved key and opens the settings', async () => {
    const container = await show();
    expect(container.querySelector('footer > span')?.textContent).toBe('Gemini key saved');
    await click(button(container, 'Settings'));
    expect(openOptionsPage).toHaveBeenCalledOnce();
    expect(window.close).toHaveBeenCalledOnce();
  });
});
