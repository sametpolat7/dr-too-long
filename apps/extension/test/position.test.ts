import { describe, expect, it, vi } from 'vitest';
import { placeBubble, selectedLines } from '../src/content/bubble/position.ts';

const line = (left: number, top: number, width = 300, height = 20) =>
  new DOMRect(left, top, width, height);
const bubble = { width: 90, height: 28 };
const viewport = { width: 1000, height: 800 };

describe('placeBubble', () => {
  it('places the bubble above the first line', () => {
    const lines = { first: line(100, 200), last: line(40, 260) };
    expect(placeBubble(lines, bubble, viewport)).toEqual({ left: 100, top: 164 });
  });

  it('places it below the last line when the first is too near the top', () => {
    const lines = { first: line(100, 20), last: line(40, 80) };
    expect(placeBubble(lines, bubble, viewport)).toEqual({ left: 100, top: 108 });
  });

  it('keeps it inside the viewport', () => {
    expect(
      placeBubble({ first: line(980, 200), last: line(980, 200) }, bubble, viewport).left,
    ).toBe(902);
    expect(placeBubble({ first: line(-50, 200), last: line(0, 200) }, bubble, viewport).left).toBe(
      8,
    );
    expect(placeBubble({ first: line(100, 0), last: line(100, 780) }, bubble, viewport).top).toBe(
      764,
    );
  });
});

describe('selectedLines', () => {
  function rangeWith(boxes: DOMRect[]): Range {
    const range = document.createRange();
    vi.spyOn(range, 'getClientRects').mockReturnValue(boxes as unknown as DOMRectList);
    return range;
  }

  it('skips the empty boxes at line ends', () => {
    const first = line(10, 100, 200);
    const last = line(10, 120, 150);
    const lines = selectedLines(rangeWith([line(0, 100, 0), first, last, line(160, 120, 0)]));
    expect(lines).toEqual({ first, last });
  });

  it('finds no lines in a range without visible boxes', () => {
    expect(selectedLines(rangeWith([line(0, 100, 0)]))).toBeUndefined();
  });
});
