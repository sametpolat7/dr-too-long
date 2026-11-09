import { afterEach, describe, expect, it, vi } from 'vitest';
import { followChromeTheme } from '../src/ui/chrome-theme.ts';

function chromePrefersDark(dark: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: dark,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
  };
  const matchMedia = vi.fn(() => query);
  vi.stubGlobal('matchMedia', matchMedia);
  const change = (next: boolean) => {
    query.matches = next;
    for (const listener of listeners) listener();
  };
  return { matchMedia, change };
}

const theme = () => document.documentElement.dataset.theme;

describe('followChromeTheme', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it.each([
    [false, 'light'],
    [true, 'dark'],
  ] as const)("marks the page with Chrome's theme when it prefers dark is %s", (dark, expected) => {
    const { matchMedia } = chromePrefersDark(dark);
    followChromeTheme();
    expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    expect(theme()).toBe(expected);
  });

  it("keeps in step with Chrome's theme", () => {
    const { change } = chromePrefersDark(false);
    followChromeTheme();
    change(true);
    expect(theme()).toBe('dark');
    change(false);
    expect(theme()).toBe('light');
  });
});
