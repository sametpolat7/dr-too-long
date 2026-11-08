import type { ShapeId } from '@dr-too-long/shared/contracts';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { Card } from '../src/content/card/Card.tsx';
import type { CardState, View } from '../src/content/card/view.ts';

const view = (shape: ShapeId, language = 'en'): View => ({ shape, language });

function show(
  state: CardState,
  props: Partial<Parameters<typeof Card>[0]> = {},
  container = document.createElement('div'),
) {
  const noop = () => undefined;
  render(
    <Card
      state={state}
      view={view('summary')}
      choice={null}
      onSelect={noop}
      onLanguage={noop}
      onRegenerate={noop}
      onClose={noop}
      onOpenOptions={noop}
      onActivate={() => true}
      bubbleHidden={false}
      onBubble={noop}
      {...props}
    />,
    container,
  );
  return container;
}

const points = [
  { text: 'The keeper logged every ship.', sentences: [1] },
  { text: 'The notebooks dated the decline.', sentences: [2] },
];
const done: CardState = { status: 'done', points };

const pointsOf = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('[role="button"]'),
];

function button(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((each) => each.textContent === label);
}

const HIDE = 'Hide the bubble on this site until the tab closes';
const SHOW = 'Show the bubble on this site';

describe('Card', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    fakeBrowser.i18n.getUILanguage = () => 'en-US';
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('joins the points into one paragraph while summarizing', () => {
    const container = show({ status: 'summarizing', points });
    expect(container.querySelector('p')?.textContent).toBe(
      'The keeper logged every ship. The notebooks dated the decline.',
    );
    expect(container.textContent).toContain('Summarizing…');
    expect(pointsOf(container)).toHaveLength(0);
    expect(button(container, 'Copy')).toBeUndefined();
  });

  it('makes each point clickable once the summary is done', () => {
    const container = show(done);
    expect(container.textContent).not.toContain('Summarizing…');
    expect(container.querySelector('p')?.textContent).toBe(
      'The keeper logged every ship. The notebooks dated the decline.',
    );
    expect(pointsOf(container).map((point) => point.textContent)).toEqual(
      points.map((point) => point.text),
    );
  });

  it('shows key points as one list item per point', () => {
    const container = show(done, { view: view('key-points') });
    const items = [...container.querySelectorAll('li')];
    expect(items.map((item) => item.textContent)).toEqual(points.map((point) => point.text));
    expect(items[0]?.querySelector('[role="button"]')).not.toBeNull();
  });

  it('presses the shown shape and asks for another on a click', () => {
    const onSelect = vi.fn();
    const container = show(done, { onSelect });
    const pressed = [...container.querySelectorAll('[aria-pressed="true"]')];
    expect(pressed.map((each) => each.textContent)).toEqual(['Summary']);
    button(container, 'Key points')?.click();
    expect(onSelect).toHaveBeenCalledWith('key-points');
  });

  it('offers no shape, language or bubble switch when the selection was refused', () => {
    const container = show({ status: 'error', code: 'no_selection' }, { view: undefined });
    expect(button(container, 'Summary')).toBeUndefined();
    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelector('.bubble-switch')).toBeNull();
    expect(container.textContent).toContain('Select some text first.');
  });

  it("writes the points in the view's language and direction, and the card in English", () => {
    const container = show(done, { view: view('summary', 'ar') });
    const card = container.querySelector('section');
    expect([card?.lang, card?.dir]).toEqual(['en', 'ltr']);
    const paragraph = container.querySelector('p');
    expect([paragraph?.lang, paragraph?.dir]).toEqual(['ar', 'rtl']);
    const list = show(done, { view: view('key-points', 'en-US') }).querySelector('ul');
    expect([list?.lang, list?.dir]).toEqual(['en-US', 'ltr']);
  });

  function picker(container: HTMLElement) {
    const select = container.querySelector('select');
    const pick = (value: string) =>
      act(() => {
        if (!select) return;
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    return { select, pick };
  }

  it('opens the language picker on the saved choice, after Auto', () => {
    const { select } = picker(show(done, { choice: 'tr' }));
    expect(select?.value).toBe('tr');
    expect(select?.options[0]?.textContent).toBe(
      "Auto: Chrome's language (English (United States))",
    );
  });

  it('reports only the language the reader settles on, and keeps showing it', () => {
    vi.useFakeTimers();
    const onLanguage = vi.fn();
    const container = show(done, { choice: 'tr', onLanguage });
    const { select, pick } = picker(container);
    pick('uk');
    pick('de');
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(onLanguage).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onLanguage.mock.calls).toEqual([['de']]);

    act(() => {
      show(done, { choice: 'tr', onLanguage }, container);
    });
    expect(select?.value).toBe('de');
    pick('');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onLanguage).toHaveBeenLastCalledWith(null);
  });

  it('drops a pick the reader has not settled on when the card closes', () => {
    vi.useFakeTimers();
    const onLanguage = vi.fn();
    const container = show(done, { onLanguage });
    picker(container).pick('de');
    act(() => render(null, container));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onLanguage).not.toHaveBeenCalled();
  });

  it('offers to hide the bubble on this site or show it again, as the card is told', () => {
    const onBubble = vi.fn();
    const container = show(done, { onBubble, bubbleHidden: true });
    expect(button(container, HIDE)).toBeUndefined();
    show(done, { onBubble, bubbleHidden: false }, container);
    expect(button(container, SHOW)).toBeUndefined();
    act(() => button(container, HIDE)?.click());
    expect(onBubble).toHaveBeenLastCalledWith(true);
    // The switch changes once the card is told the bubble is hidden.
    expect(button(container, HIDE)).toBeDefined();
    show(done, { onBubble, bubbleHidden: true }, container);
    act(() => button(container, SHOW)?.click());
    expect(onBubble).toHaveBeenLastCalledWith(false);
  });

  it('activates a clicked point and marks it', () => {
    const onActivate = vi.fn(() => true);
    const container = show(done, { onActivate });
    act(() => pointsOf(container)[1]?.click());
    expect(onActivate).toHaveBeenCalledWith(points[1]);
    const [first, second] = pointsOf(container);
    expect(second?.className).toBe('point active');
    expect(second?.getAttribute('aria-pressed')).toBe('true');
    expect(first?.className).toBe('point');
  });

  it.each(['Enter', ' '])('activates a point on %j and cancels the default action', (key) => {
    const onActivate = vi.fn(() => true);
    const container = show(done, { onActivate });
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    act(() => {
      pointsOf(container)[0]?.dispatchEvent(event);
    });
    expect(onActivate).toHaveBeenCalledWith(points[0]);
    expect(pointsOf(container)[0]?.className).toBe('point active');
    expect(event.defaultPrevented).toBe(true);
  });

  it('says when the passage is no longer on the page', () => {
    const container = show(done, { onActivate: () => false });
    act(() => pointsOf(container)[0]?.click());
    expect(pointsOf(container)[0]?.className).toBe('point missing');
    expect(container.textContent).toContain('The passage is no longer on the page.');
  });

  it.each([
    ['shape', view('key-points')],
    ['language', view('summary', 'tr')],
  ])('shows another %s from memory with no point marked', (_, next) => {
    const container = show(done, { onActivate: () => false });
    act(() => pointsOf(container)[0]?.click());
    expect(container.textContent).toContain('The passage is no longer on the page.');

    act(() => {
      show(done, { view: next }, container);
    });
    expect(container.querySelectorAll('[role="button"][aria-pressed="true"]')).toHaveLength(0);
    expect(container.textContent).not.toContain('The passage is no longer on the page.');
  });

  it('regenerates from its Regenerate button', () => {
    const onRegenerate = vi.fn();
    const container = show(done, { onRegenerate });
    button(container, 'Regenerate')?.click();
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it('copies the summary in its shape and says so', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const container = show(done, { view: view('key-points') });
    await act(async () => button(container, 'Copy')?.click());
    expect(writeText).toHaveBeenCalledWith(
      '- The keeper logged every ship.\n- The notebooks dated the decline.',
    );
    expect(button(container, 'Copied')).toBeDefined();
  });

  it('says so when the page refuses the clipboard', async () => {
    vi.stubGlobal('navigator', {});
    const container = show(done);
    await act(async () => button(container, 'Copy')?.click());
    expect(button(container, 'Copy failed')).toBeDefined();
  });

  it('shows the message and detail of an error', () => {
    const container = show({
      status: 'error',
      code: 'too_long',
      detail: '10,001 characters; the limit is 10,000.',
    });
    expect(container.textContent).toContain('The selection is too long.');
    expect(container.textContent).toContain('10,001 characters; the limit is 10,000.');
    expect(container.querySelector('.actions button')).toBeNull();
  });

  it.each(['no_key', 'unauthorized'] as const)('offers the options page on %s', (code) => {
    const onOpenOptions = vi.fn();
    const container = show({ status: 'error', code }, { onOpenOptions });
    button(container, 'Open options')?.click();
    expect(onOpenOptions).toHaveBeenCalledOnce();
    expect(button(container, 'Try again')).toBeUndefined();
  });

  it.each(['rate_limited', 'network', 'disconnected', 'invalid_output', 'provider'] as const)(
    'offers to try again on %s',
    (code) => {
      const onRegenerate = vi.fn();
      const container = show({ status: 'error', code }, { onRegenerate });
      button(container, 'Try again')?.click();
      expect(onRegenerate).toHaveBeenCalledOnce();
    },
  );

  it.each(['quota_exceeded', 'invalidated'] as const)(
    'offers neither options nor a retry on %s',
    (code) => {
      const container = show({ status: 'error', code });
      expect(container.querySelector('.actions button')).toBeNull();
    },
  );

  it('closes from its close button', () => {
    const onClose = vi.fn();
    const container = show(done, { onClose });
    container.querySelector<HTMLButtonElement>('button.close')?.click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
