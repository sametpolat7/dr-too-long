import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ACTION_TITLE } from '../src/action-title.ts';
import { summarizeTab } from '../src/background/action.ts';

const badge = () => fakeBrowser.action.getBadgeText({ tabId: 5 });
const title = () => fakeBrowser.action.getTitle({ tabId: 5 });

describe('summarizeTab', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flashes "!" on the icon for three seconds where it cannot run, and says why', async () => {
    Object.assign(fakeBrowser.scripting, {
      removeCSS: async () => {
        throw new Error('Cannot access contents of url "chrome://extensions/".');
      },
    });
    const running = summarizeTab(5);
    await vi.advanceTimersByTimeAsync(0);
    expect(await badge()).toBe('!');
    expect(await title()).toBe('Dr. Too Long cannot run on this page');
    await vi.advanceTimersByTimeAsync(3000);
    await running;
    expect(await badge()).toBe('');
    expect(await title()).toBe(ACTION_TITLE);
  });
});
