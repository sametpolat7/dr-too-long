import { vi } from 'vitest';

// happy-dom lays nothing out, so a range over its text has no rects. Here each range gets one, as
// text Chrome lays out does, except a range starting inside an element that matches `unlaid`.
export function layOutText(unlaid?: string): void {
  vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (this: Range) {
    const element = this.startContainer.parentElement;
    const rects = unlaid && element?.closest(unlaid) ? [] : [new DOMRect(0, 0, 10, 10)];
    return rects as unknown as DOMRectList;
  });
}
