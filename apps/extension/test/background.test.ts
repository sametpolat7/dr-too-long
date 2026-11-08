import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { isBubbleHidden, setBubbleHidden } from '../src/background/hidden-bubble.ts';
import { handleMessage } from '../src/background/message-handler.ts';
import { SUMMARIZE_SCRIPT } from '../src/background/scripts.ts';
import background from '../src/entrypoints/background.ts';
import { HIGHLIGHT_CSS } from '../src/highlight.ts';
import { SUMMARIZE_PORT } from '../src/summarize-port.ts';

type Listener = (...args: never[]) => unknown;

// An event the fake browser leaves out, which the test fires itself.
function fakeEvent() {
  const listeners: Listener[] = [];
  return {
    addListener: (listener: Listener) => void listeners.push(listener),
    fire: (...args: unknown[]) => {
      for (const listener of listeners) (listener as (...args: unknown[]) => unknown)(...args);
    },
  };
}

function fakePort(name: string) {
  return { name, onMessage: { addListener: vi.fn() }, onDisconnect: { addListener: vi.fn() } };
}

const tab = { id: 3 } as Browser.tabs.Tab;

describe('the background worker', () => {
  const calls: string[] = [];
  const createMenuItem = vi.fn();
  const registerContentScripts = vi.fn();
  let granted: boolean;
  let menuClicked: ReturnType<typeof fakeEvent>;
  let permissionsAdded: ReturnType<typeof fakeEvent>;
  let permissionsRemoved: ReturnType<typeof fakeEvent>;
  let connected: ReturnType<typeof fakeEvent>;

  beforeEach(() => {
    fakeBrowser.reset();
    calls.length = 0;
    granted = false;
    menuClicked = fakeEvent();
    permissionsAdded = fakeEvent();
    permissionsRemoved = fakeEvent();
    connected = fakeEvent();
    Object.assign(fakeBrowser.contextMenus, {
      onClicked: menuClicked,
      removeAll: async () => undefined,
      create: createMenuItem.mockReset(),
    });
    Object.assign(fakeBrowser.permissions, {
      onAdded: permissionsAdded,
      onRemoved: permissionsRemoved,
      contains: async () => granted,
    });
    Object.assign(fakeBrowser.runtime, { onConnect: connected });
    Object.assign(fakeBrowser.scripting, {
      removeCSS: async () => void calls.push('removeCSS'),
      insertCSS: async (style: object) => void calls.push(`insertCSS ${JSON.stringify(style)}`),
      executeScript: async (script: object) => void calls.push(`execute ${JSON.stringify(script)}`),
      getRegisteredContentScripts: async () => [],
      unregisterContentScripts: async () => undefined,
      registerContentScripts: registerContentScripts.mockReset(),
    });
    background.main();
  });

  it('adds the menu item and syncs the every-site script on install', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    granted = true;
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' });
    await vi.waitFor(() => expect(registerContentScripts).toHaveBeenCalledOnce());
    expect(createMenuItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'summarize-selection', contexts: ['selection'] }),
    );
  });

  it.each([
    ['a click on the icon or the shortcut', () => fakeBrowser.action.onClicked.trigger(tab)],
    ['the menu item', () => menuClicked.fire({}, tab)],
  ])('summarizes the tab on %s, with one copy of the highlight style', async (_, click) => {
    await click();
    const style = { target: { tabId: 3 }, css: HIGHLIGHT_CSS };
    await vi.waitFor(() =>
      expect(calls).toEqual([
        'removeCSS',
        `insertCSS ${JSON.stringify(style)}`,
        `execute ${JSON.stringify({ target: { tabId: 3 }, files: [SUMMARIZE_SCRIPT] })}`,
      ]),
    );
  });

  it('answers the content scripts and the options page', () => {
    expect(fakeBrowser.runtime.onMessage.hasListener(handleMessage)).toBe(true);
  });

  it('forgets where the bubble was hidden once the tab closes', async () => {
    const sender = { tab: { id: 3 }, origin: 'https://example.com' };
    await setBubbleHidden(sender, true);
    await fakeBrowser.tabs.onRemoved.trigger(3, { windowId: 1, isWindowClosing: false });
    await vi.waitFor(async () => expect(await isBubbleHidden(sender)).toBe(false));
  });

  it.each([
    ['granted', () => permissionsAdded.fire({ origins: ['https://*/*'] })],
    ['withdrawn', () => permissionsRemoved.fire({ origins: ['https://*/*'] })],
  ])('syncs the every-site script when access is %s', async (_, change) => {
    granted = true;
    change();
    await vi.waitFor(() => expect(registerContentScripts).toHaveBeenCalledOnce());
  });

  it('serves the summarize port and ignores any other', () => {
    const other = fakePort('other');
    const summarize = fakePort(SUMMARIZE_PORT);
    connected.fire(other);
    connected.fire(summarize);
    expect(other.onMessage.addListener).not.toHaveBeenCalled();
    expect(summarize.onMessage.addListener).toHaveBeenCalledOnce();
  });
});
