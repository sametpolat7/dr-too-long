import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Card, type CardState } from '../src/content/card/Card.tsx';

function show(
  state: CardState,
  props: Partial<Parameters<typeof Card>[0]> = {},
  container = document.createElement('div'),
) {
  const noop = () => undefined;
  render(
    <Card
      state={state}
      preset="summary"
      onSelect={noop}
      onRegenerate={noop}
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
const done: CardState = { status: 'done', points, dropped: 0 };

const pointsOf = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('[role="button"]'),
];

function button(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((each) => each.textContent === label);
}

describe('Card', () => {
  afterEach(() => vi.unstubAllGlobals());

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

  it('shows a bulleted list as one list item per point', () => {
    const container = show(done, { preset: 'bulleted-list' });
    const items = [...container.querySelectorAll('li')];
    expect(items.map((item) => item.textContent)).toEqual(points.map((point) => point.text));
    expect(items[0]?.querySelector('[role="button"]')).not.toBeNull();
  });

  it('presses the shown preset and asks for another on a click', () => {
    const onSelect = vi.fn();
    const container = show(done, { preset: 'summary', onSelect });
    const pressed = [...container.querySelectorAll('[aria-pressed="true"]')];
    expect(pressed.map((each) => each.textContent)).toEqual(['Summary']);
    button(container, 'Bulleted list')?.click();
    expect(onSelect).toHaveBeenCalledWith('bulleted-list');
  });

  it('offers no preset when the selection was refused', () => {
    const container = show({ status: 'error', code: 'no_selection' }, { preset: undefined });
    expect(button(container, 'Summary')).toBeUndefined();
    expect(container.textContent).toContain('Select some text first.');
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

  it('shows another preset from memory with no point marked', () => {
    const container = show(done, { onActivate: () => false });
    act(() => pointsOf(container)[0]?.click());
    expect(container.textContent).toContain('The passage is no longer on the page.');

    act(() => {
      show(done, { preset: 'bulleted-list' }, container);
    });
    expect(container.querySelectorAll('[role="button"][aria-pressed="true"]')).toHaveLength(0);
    expect(container.textContent).not.toContain('The passage is no longer on the page.');
  });

  it('says how many points the validator left out', () => {
    expect(show({ ...done, dropped: 1 }).textContent).toContain(
      '1 point from the model was left out.',
    );
    expect(show({ ...done, dropped: 2 }).textContent).toContain(
      '2 points from the model were left out.',
    );
    expect(show(done).textContent).not.toContain('left out');
  });

  it('regenerates from its Regenerate button', () => {
    const onRegenerate = vi.fn();
    const container = show(done, { onRegenerate });
    button(container, 'Regenerate')?.click();
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it('copies the summary in its preset shape and says so', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const container = show(done, { preset: 'bulleted-list' });
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
