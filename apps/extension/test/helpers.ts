import { vi } from 'vitest';

// A selection the bubble is offered for: three complete sentences.
export const LONG = 'The keeper logged every ship that passed the cape for forty years. '.repeat(3);

// Lets pending promise callbacks and zero-delay timers run.
export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// happy-dom's PageTransitionEvent ignores persisted.
export function pageshow(persisted: boolean): Event {
  return Object.defineProperty(new Event('pageshow'), 'persisted', { value: persisted });
}

// happy-dom lays nothing out, so a range over its text has no rects.
export function layOutText(unlaid?: string): void {
  vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (this: Range) {
    const element = this.startContainer.parentElement;
    const rects = unlaid && element?.closest(unlaid) ? [] : [new DOMRect(0, 0, 10, 10)];
    return rects as unknown as DOMRectList;
  });
}
