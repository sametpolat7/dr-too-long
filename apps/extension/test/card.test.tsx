import { render } from 'preact';
import { describe, expect, it, vi } from 'vitest';
import { Card, type CardState } from '../src/content/card/Card.tsx';

function show(state: CardState, handlers: Partial<Parameters<typeof Card>[0]> = {}) {
  const container = document.createElement('div');
  const noop = () => undefined;
  render(<Card state={state} onClose={noop} onOpenOptions={noop} {...handlers} />, container);
  return container;
}

const points = [
  { text: 'The keeper logged every ship.', sentences: [1] },
  { text: 'The notebooks dated the decline.', sentences: [2] },
];

describe('Card', () => {
  it('joins the points into one paragraph while summarizing', () => {
    const container = show({ status: 'summarizing', points });
    expect(container.querySelector('p')?.textContent).toBe(
      'The keeper logged every ship. The notebooks dated the decline.',
    );
    expect(container.textContent).toContain('Summarizing…');
  });

  it('drops the status line once the summary is done', () => {
    const container = show({ status: 'done', points });
    expect(container.textContent).not.toContain('Summarizing…');
  });

  it('shows the message and detail of an error', () => {
    const container = show({ status: 'error', code: 'too_long', detail: '151 sentences' });
    expect(container.textContent).toContain('The selection is too long.');
    expect(container.textContent).toContain('151 sentences');
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
