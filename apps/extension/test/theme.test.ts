import { describe, expect, it, vi } from 'vitest';
import { pageTheme } from '../src/content/theme.ts';

function page({ body = 'rgba(0, 0, 0, 0)', html = 'rgba(0, 0, 0, 0)', scheme = 'normal' }) {
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (element) =>
      ({
        backgroundColor: element === document.body ? body : html,
        colorScheme: scheme,
      }) as CSSStyleDeclaration,
  );
}

function chromePrefersDark(dark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: dark && query.includes('dark') }));
}

describe('pageTheme', () => {
  it.each([
    ['a white body', { body: 'rgb(255, 255, 255)' }, 'light'],
    ['a dark body', { body: 'rgb(32, 33, 36)' }, 'dark'],
    ['a dark root behind a transparent body', { html: 'rgb(18, 18, 18)' }, 'dark'],
    ['a dark body at half opacity', { body: 'rgba(0, 0, 0, 0.5)' }, 'dark'],
  ] as const)('reads %s as %s', (_, colors, theme) => {
    chromePrefersDark(false);
    page(colors);
    expect(pageTheme()).toBe(theme);
  });

  it("follows the page, not Chrome's theme, when the page is white", () => {
    chromePrefersDark(true);
    page({ body: 'rgb(255, 255, 255)' });
    expect(pageTheme()).toBe('light');
  });

  it.each([
    ['dark', false, 'dark'],
    ['light dark', true, 'dark'],
    ['light dark', false, 'light'],
    ['normal', true, 'light'],
  ] as const)(
    'reads a transparent page with color-scheme %s as %s when Chrome prefers dark is %s',
    (scheme, prefersDark, theme) => {
      chromePrefersDark(prefersDark);
      page({ scheme });
      expect(pageTheme()).toBe(theme);
    },
  );

  it('measures a color that is not rgb(), such as oklch(), through a canvas', () => {
    chromePrefersDark(false);
    page({ body: 'oklch(0.2 0.01 285)' });
    const context = {
      fillStyle: '',
      fillRect: () => undefined,
      getImageData: () => ({ data: [24, 24, 27, 255] }),
    };
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return context;
        }
      },
    );
    expect(pageTheme()).toBe('dark');
    expect(context.fillStyle).toBe('oklch(0.2 0.01 285)');
  });
});
