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
      onRetry={noop}
      onClose={noop}
      onOpenOptions={noop}
      onActivate={() => true}
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

const iconButton = (container: HTMLElement, label: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const copyButton = (container: HTMLElement) => iconButton(container, 'Copy summary');

const HINT = 'Click a point to see where it comes from.';

// The language picker in the bar has a status of its own.
const status = (container: HTMLElement) => container.querySelector('footer [role="status"]');

function press(target: EventTarget | null | undefined, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => {
    target?.dispatchEvent(event);
  });
  return event;
}

describe('Card', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    fakeBrowser.i18n.getUILanguage = () => 'en-US';
  });
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('is a dialog named by its heading', () => {
    const container = show(done);
    const dialog = container.querySelector('section');
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.tabIndex).toBe(-1);
    const title = container.querySelector(`#${dialog?.getAttribute('aria-labelledby')}`);
    expect(title?.tagName).toBe('H2');
    expect(title?.textContent).toBe('Dr. Too Long');
    expect(title?.className).toBe('visually-hidden');
  });

  it('shows itself in the top layer once mounted', () => {
    const dialog = show(done).querySelector('section');
    expect(dialog?.getAttribute('popover')).toBe('manual');
    expect(dialog?.hasAttribute('data-popover-open')).toBe(true);
  });

  it.each(['light', 'dark'] as const)("takes the page's %s scheme", (theme) => {
    expect(show(done, { theme }).querySelector('section')?.dataset.theme).toBe(theme);
  });

  it('announces the start and the end of a summary in one status that stays mounted', () => {
    const container = document.createElement('div');
    show({ status: 'summarizing', points: [] }, {}, container);
    const line = status(container);
    expect(line?.textContent).toBe('Summarizing…');
    show({ status: 'summarizing', points }, {}, container);
    expect(status(container)).toBe(line);
    show(done, {}, container);
    expect(status(container)).toBe(line);
    expect(line?.querySelector('.visually-hidden')?.textContent).toBe('Summary ready.');
  });

  it('shows how to use the points once the summary is done', () => {
    const line = status(show(done));
    expect(line?.textContent).toBe(`Summary ready.${HINT}`);
    expect(line?.querySelector('.visually-hidden')?.textContent).toBe('Summary ready.');
  });

  it('shows a skeleton, hidden from screen readers, until the first point arrives', () => {
    const container = document.createElement('div');
    show({ status: 'summarizing', points: [] }, {}, container);
    const skeleton = container.querySelector('.skeleton');
    expect(skeleton?.getAttribute('aria-hidden')).toBe('true');
    expect(skeleton?.children).toHaveLength(4);
    show({ status: 'summarizing', points }, {}, container);
    expect(container.querySelector('.skeleton')).toBeNull();
  });

  it('puts an error in an alert', () => {
    const container = show({ status: 'error', code: 'network' });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'The provider could not be reached.',
    );
  });

  it('says copying worked to screen readers, beside the button that shows it', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: async () => undefined } });
    const container = show(done);
    await act(async () => copyButton(container)?.click());
    expect(copyButton(container)?.dataset.tip).toBe('Copied');
    expect(status(container)?.querySelector('.visually-hidden')?.textContent).toBe(
      'Summary copied.',
    );
    expect(status(container)?.textContent).toContain(HINT);
  });

  it('joins the points into one paragraph while summarizing', () => {
    const container = show({ status: 'summarizing', points });
    expect(container.querySelector('p')?.textContent).toBe(
      'The keeper logged every ship. The notebooks dated the decline.',
    );
    expect(container.textContent).toContain('Summarizing…');
    expect(pointsOf(container)).toHaveLength(0);
    expect(copyButton(container)).toBeNull();
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

  it('offers no shape or language when the selection was refused', () => {
    const container = show({ status: 'error', code: 'no_selection' }, { view: undefined });
    expect(button(container, 'Summary')).toBeUndefined();
    expect(container.querySelector('[role="combobox"]')).toBeNull();
    expect(container.textContent).toContain('Select some text first.');
  });

  it('has neither a Regenerate button nor a switch for the Summarize button', () => {
    const labels = [...show(done).querySelectorAll('button')].map(
      (each) => each.getAttribute('aria-label') ?? each.textContent,
    );
    expect(labels).toEqual(['Summary', 'Key points', 'Close', 'Copy summary']);
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
    const field = container.querySelector<HTMLInputElement>('input[role="combobox"]');
    const type = (text: string) =>
      act(() => {
        if (!field) return;
        field.value = text;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
    return { field, type };
  }

  it('puts the grip, the shape switch, the language field and Close in one bar, in that order', () => {
    const header = show(done, { choice: 'tr' }).querySelector('header');
    const [grip, title, tools, close] = header?.children ?? [];
    expect(grip?.className).toBe('grip');
    expect(title?.tagName).toBe('H2');
    expect([...(tools?.children ?? [])].map((each) => each.className)).toEqual([
      'shapes',
      'picker',
    ]);
    expect(close?.getAttribute('aria-label')).toBe('Close');
    const label = tools?.querySelector('label');
    expect([label?.textContent, label?.className]).toEqual(['Summary language', 'visually-hidden']);
    expect(tools?.querySelector('input')?.value).toBe('Turkish — Türkçe');
  });

  it('puts the status at the left of the footer and Copy, an icon, at its right', () => {
    const footer = show(done).querySelector('footer');
    expect(footer?.firstElementChild?.getAttribute('role')).toBe('status');
    const copy = footer?.lastElementChild;
    expect(copy?.getAttribute('aria-label')).toBe('Copy summary');
    expect(copy?.textContent).toBe('');
    expect(copy?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('names its icons and the grip in tooltips that repeat what screen readers hear', () => {
    const container = show(done);
    expect(container.querySelector('.grip')?.getAttribute('data-tip')).toBe('Drag to move');
    expect(container.querySelector('.grip')?.getAttribute('aria-hidden')).toBe('true');
    expect(iconButton(container, 'Close')?.dataset.tip).toBe('Close (Esc)');
    expect(copyButton(container)?.dataset.tip).toBe('Copy summary');
  });

  it('keeps the language picker while summarizing and after an error, without Copy', () => {
    const states: CardState[] = [
      { status: 'summarizing', points },
      { status: 'error', code: 'network' },
    ];
    for (const state of states) {
      const container = show(state);
      expect(container.querySelector('header [role="combobox"]')).not.toBeNull();
      expect(copyButton(container)).toBeNull();
    }
  });

  it('reports the language the reader chooses at once, and not the ones passed on the way', () => {
    const onLanguage = vi.fn();
    const container = show(done, { choice: 'tr', onLanguage });
    document.body.append(container);
    const { field, type } = picker(container);
    act(() => field?.focus());
    press(field, 'ArrowDown');
    press(field, 'ArrowDown');
    expect(onLanguage).not.toHaveBeenCalled();
    type('deu');
    press(field, 'Enter');
    expect(onLanguage.mock.calls).toEqual([['de']]);
  });

  it('closes on Escape, but not on the Escape that closes the language list', () => {
    const onClose = vi.fn();
    const container = show(done, { onClose });
    document.body.append(container);
    const { field } = picker(container);
    act(() => field?.focus());
    expect(press(field, 'Escape').defaultPrevented).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    press(field, 'Escape');
    expect(onClose).toHaveBeenCalledOnce();
    press(container.querySelector('section'), 'Escape');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  describe('dragged by its header', () => {
    const pointer = (type: string, target: Element | null | undefined, x: number, y: number) =>
      act(() => {
        target?.dispatchEvent(
          new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: x, clientY: y }),
        );
      });

    function drawn() {
      const container = document.createElement('div');
      act(() => {
        show(done, {}, container);
      });
      const card = container.querySelector('section') as HTMLElement;
      vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(new DOMRect(528, 16, 480, 300));
      Object.defineProperties(card, { offsetWidth: { value: 480 }, offsetHeight: { value: 300 } });
      const header = container.querySelector('header');
      return { container, card, header };
    }

    it('follows the pointer from where it was pressed, 8 px inside the viewport', () => {
      const { card, header } = drawn();
      pointer('pointerdown', header?.querySelector('.grip circle'), 628, 30);
      pointer('pointermove', header, 400, 230);
      expect([card.style.left, card.style.top, card.style.right]).toEqual([
        '300px',
        '216px',
        'auto',
      ]);
      pointer('pointermove', header, -100, 2000);
      expect([card.style.left, card.style.top]).toEqual(['8px', `${window.innerHeight - 308}px`]);
      pointer('lostpointercapture', header, 0, 0);
      pointer('pointermove', header, 400, 230);
      expect(card.style.left).toBe('8px');
    });

    it('moves from the empty space between the controls on its bar', () => {
      const { card, header } = drawn();
      pointer('pointerdown', header?.querySelector('.tools'), 628, 30);
      pointer('pointermove', header, 400, 230);
      expect(card.style.left).toBe('300px');
    });

    it('leaves a press on its controls to the controls', () => {
      const { container, card, header } = drawn();
      act(() => container.querySelector('input')?.focus());
      for (const control of [
        button(container, 'Key points'),
        container.querySelector('fieldset'),
        container.querySelector('input'),
        container.querySelector('[role="option"]'),
        iconButton(container, 'Close'),
      ]) {
        pointer('pointerdown', control, 628, 30);
      }
      pointer('pointermove', header, 400, 230);
      expect(card.style.left).toBe('');
    });

    it('stays inside a viewport that shrinks', () => {
      const { card, header } = drawn();
      pointer('pointerdown', header, 628, 30);
      pointer('pointermove', header, 2000, 2000);
      expect([card.style.left, card.style.top]).toEqual([
        `${window.innerWidth - 488}px`,
        `${window.innerHeight - 308}px`,
      ]);
      vi.stubGlobal('visualViewport', { width: 700, height: 500 });
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
      expect([card.style.left, card.style.top]).toEqual(['212px', '192px']);
    });
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

  it('leaves a point alone when a drag inside it selected words', () => {
    const onActivate = vi.fn(() => true);
    const container = show(done, { onActivate });
    const point = pointsOf(container)[0];
    act(() => {
      point?.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }),
      );
      point?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 60, clientY: 10 }));
    });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('leaves a point alone on the second click of a double click', () => {
    const onActivate = vi.fn(() => true);
    const container = show(done, { onActivate });
    act(() => {
      pointsOf(container)[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
    });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('puts no space after a full-width sentence mark between summary points', () => {
    const texts = ['これは要約です。', '「次の文です。」', 'Last.'];
    const container = show({
      status: 'done',
      points: texts.map((text) => ({ text, sentences: [1] })),
    });
    expect(container.querySelector('p[lang]')?.textContent).toBe(
      'これは要約です。「次の文です。」Last.',
    );
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
    expect(status(container)?.textContent).toBe('The passage is no longer on the page.');
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

  it('copies the summary in its shape and shows a check for 2 s', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const container = show(done, { view: view('key-points') });
    const icon = () => copyButton(container)?.querySelector('path')?.getAttribute('d');
    const copyIcon = icon();
    await act(async () => copyButton(container)?.click());
    expect(writeText).toHaveBeenCalledWith(
      '- The keeper logged every ship.\n- The notebooks dated the decline.',
    );
    expect(copyButton(container)?.dataset.tip).toBe('Copied');
    expect(icon()).not.toBe(copyIcon);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(copyButton(container)?.dataset.tip).toBe('Copy summary');
    expect(icon()).toBe(copyIcon);
    vi.useRealTimers();
  });

  it('says a second copy to screen readers again, in a fresh node that the 2 s reset keeps', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { clipboard: { writeText: async () => undefined } });
    const container = show(done);
    const spoken = () => status(container)?.querySelector('.visually-hidden');
    await act(async () => copyButton(container)?.click());
    const first = spoken();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(spoken()).toBe(first);
    await act(async () => copyButton(container)?.click());
    expect(spoken()).not.toBe(first);
    expect(spoken()?.textContent).toBe('Summary copied.');
    vi.useRealTimers();
  });

  it('says so when the page refuses the clipboard', async () => {
    vi.stubGlobal('navigator', {});
    const container = show(done);
    await act(async () => copyButton(container)?.click());
    expect(copyButton(container)?.dataset.tip).toBe('This page does not allow copying');
    expect(status(container)?.querySelector('.visually-hidden')?.textContent).toBe(
      'The page does not allow copying.',
    );
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

  it.each(['no_key', 'unauthorized', 'model_unavailable'] as const)(
    'offers the settings page on %s',
    (code) => {
      const onOpenOptions = vi.fn();
      const container = show({ status: 'error', code }, { onOpenOptions });
      button(container, 'Open settings')?.click();
      expect(onOpenOptions).toHaveBeenCalledOnce();
      expect(button(container, 'Try again')).toBeUndefined();
    },
  );

  it.each([
    'rate_limited',
    'network',
    'timed_out',
    'disconnected',
    'invalid_output',
    'provider',
    'unexpected',
  ] as const)('offers to try again on %s', (code) => {
    const onRetry = vi.fn();
    const container = show({ status: 'error', code }, { onRetry });
    button(container, 'Try again')?.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

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
    iconButton(container, 'Close')?.click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
