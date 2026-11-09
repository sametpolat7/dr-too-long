import { describe, expect, it } from 'vitest';
import { keepInside } from '../src/content/viewport.ts';

const card = { width: 480, height: 300 };
const viewport = { width: 1000, height: 800 };

describe('keepInside', () => {
  it('leaves a box that fits where it is', () => {
    expect(keepInside({ left: 200, top: 100 }, card, viewport)).toEqual({ left: 200, top: 100 });
  });

  it('keeps a box dragged past any edge 8 px inside the viewport', () => {
    expect(keepInside({ left: -50, top: -20 }, card, viewport)).toEqual({ left: 8, top: 8 });
    expect(keepInside({ left: 900, top: 700 }, card, viewport)).toEqual({ left: 512, top: 492 });
  });

  it('pulls a box back in when the viewport shrinks', () => {
    expect(keepInside({ left: 512, top: 492 }, card, { width: 700, height: 500 })).toEqual({
      left: 212,
      top: 192,
    });
  });
});
