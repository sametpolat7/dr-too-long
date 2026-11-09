import { vi } from 'vitest';

export const LONG = 'The keeper logged every ship that passed the cape for forty years. '.repeat(3);

export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export function pageshow(persisted: boolean): Event {
  return Object.defineProperty(new Event('pageshow'), 'persisted', { value: persisted });
}

export function layOutText(unlaid?: string): void {
  vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (this: Range) {
    const element = this.startContainer.parentElement;
    const rects = unlaid && element?.closest(unlaid) ? [] : [new DOMRect(0, 0, 10, 10)];
    return rects as unknown as DOMRectList;
  });
}

type Listener = (...args: never[]) => unknown;

export function fakeEvent() {
  const listeners = new Set<Listener>();
  return {
    addListener: (listener: Listener) => void listeners.add(listener),
    removeListener: (listener: Listener) => void listeners.delete(listener),
    hasListeners: () => listeners.size > 0,
    fire: (...args: unknown[]) => {
      for (const listener of listeners) (listener as (...args: unknown[]) => unknown)(...args);
    },
  };
}
