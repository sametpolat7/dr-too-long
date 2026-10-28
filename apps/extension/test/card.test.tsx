import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { Card, type CardState } from '../src/content/card/Card.tsx';

function show(state: CardState, handlers: Partial<Parameters<typeof Card>[0]> = {}) {
  const container = document.createElement('div');
  const noop = () => undefined;
  render(
    <Card
      state={state}
      onClose={noop}
      onOpenOptions={noop}
      onActivate={() => true}
      {...handlers}
    />,
    container,
  );
  return container;
}

const points = [
  { text: 'The keeper logged every ship.', sentences: [1] },
  { text: 'The notebooks dated the decline.', sentences: [2] },
];

const pointsOf = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('[role="button"]'),
];

describe('Card', () => {
  it('joins the points into one paragraph while summarizing', () => {
    const container = show({ status: 'summarizing', points });
    expect(container.querySelector('p')?.textContent).toBe(
      'The keeper logged every ship. The notebooks dated the decline.',
    );
    expect(container.textContent).toContain('Summarizing…');
    expect(pointsOf(container)).toHaveLength(0);
  });

  it('makes each point clickable once the summary is done', () => {
    const container = show({ status: 'done', points });
    expect(container.textContent).not.toContain('Summarizing…');
    expect(container.querySelector('p')?.textContent).toBe(
      'The keeper logged every ship. The notebooks dated the decline.',
    );
    expect(pointsOf(container).map((point) => point.textContent)).toEqual(
      points.map((point) => point.text),
    );
  });

  it('activates a clicked point and marks it', () => {
    const onActivate = vi.fn(() => true);
    const container = show({ status: 'done', points }, { onActivate });
    act(() => pointsOf(container)[1]?.click());
    expect(onActivate).toHaveBeenCalledWith(points[1]);
    const [first, second] = pointsOf(container);
    expect(second?.className).toBe('point active');
    expect(second?.getAttribute('aria-pressed')).toBe('true');
    expect(first?.className).toBe('point');
  });

  it('activates a point on Enter', () => {
    const onActivate = vi.fn(() => true);
    const container = show({ status: 'done', points }, { onActivate });
    act(() => {
      pointsOf(container)[0]?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    expect(onActivate).toHaveBeenCalledWith(points[0]);
    expect(pointsOf(container)[0]?.className).toBe('point active');
  });

  it('says when the passage is no longer on the page', () => {
    const container = show({ status: 'done', points }, { onActivate: () => false });
    act(() => pointsOf(container)[0]?.click());
    expect(pointsOf(container)[0]?.className).toBe('point missing');
    expect(container.textContent).toContain('The passage is no longer on the page.');
  });

  it('shows the message and detail of an error', () => {
    const container = show({
      status: 'error',
      code: 'too_long',
      detail: '10,001 characters; the limit is 10,000.',
    });
    expect(container.textContent).toContain('The selection is too long.');
    expect(container.textContent).toContain('10,001 characters; the limit is 10,000.');
    expect(container.querySelector('button.options')).toBeNull();
  });

  it('offers to open the options page when no key is saved', () => {
    const onOpenOptions = vi.fn();
    const container = show({ status: 'error', code: 'no_key' }, { onOpenOptions });
    container.querySelector<HTMLButtonElement>('button.options')?.click();
    expect(onOpenOptions).toHaveBeenCalledOnce();
  });

  it('closes from its close button', () => {
    const onClose = vi.fn();
    const container = show({ status: 'done', points }, { onClose });
    container.querySelector<HTMLButtonElement>('button.close')?.click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
