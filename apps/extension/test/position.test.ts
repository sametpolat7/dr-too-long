import { describe, expect, it, vi } from 'vitest';
import {
  atOffset,
  endOf,
  type Lines,
  offsetFrom,
  placeBubble,
  selectedLines,
} from '../src/content/bubble/position.ts';

const line = (left: number, top: number, width = 300, height = 20) =>
  new DOMRect(left, top, width, height);
const bubble = { width: 90, height: 26 };
const viewport = { width: 1000, height: 800 };

describe('placeBubble', () => {
  it('places the button below the end of the last line after a forward selection', () => {
    const lines = { first: line(100, 200), last: line(40, 260), backward: false, rtl: false };
    expect(placeBubble(lines, bubble, viewport)).toEqual({ left: 326, top: 286 });
  });

  it('places it above the start of the first line after a backward selection', () => {
    const lines = { first: line(100, 200), last: line(40, 260), backward: true, rtl: false };
    expect(placeBubble(lines, bubble, viewport)).toEqual({ left: 86, top: 168 });
  });

  it('places it above the last line when there is no room below', () => {
    const lines = { first: line(100, 700), last: line(40, 760), backward: false, rtl: false };
    expect(placeBubble(lines, bubble, viewport)).toEqual({ left: 326, top: 728 });
  });

  it('places it below the first line when there is no room above', () => {
    const lines = { first: line(100, 20), last: line(40, 80), backward: true, rtl: false };
    expect(placeBubble(lines, bubble, viewport)).toEqual({ left: 86, top: 46 });
  });

  it('mirrors the place for lines that run right to left', () => {
    const forward = { first: line(100, 200), last: line(400, 260), backward: false, rtl: true };
    expect(placeBubble(forward, bubble, viewport)).toEqual({ left: 400 + 14 - 90, top: 286 });
    const backward = { ...forward, first: line(500, 200), backward: true };
    expect(placeBubble(backward, bubble, viewport)).toEqual({ left: 800 + 14 - 90, top: 168 });
  });

  it('keeps it 8 px inside the viewport', () => {
    const near = (left: number, top: number, backward: boolean) => {
      const each = line(left, top);
      return placeBubble({ first: each, last: each, backward, rtl: false }, bubble, viewport);
    };
    expect(near(980, 200, false).left).toBe(902);
    expect(near(0, 200, true).left).toBe(8);
    const tall = line(40, 0, 300, 790);
    expect(
      placeBubble({ first: tall, last: tall, backward: false, rtl: false }, bubble, viewport).top,
    ).toBe(8);
  });
});

describe('atOffset', () => {
  const scrolled = (lines: Lines, by: number): Lines => ({
    ...lines,
    first: line(lines.first.x, lines.first.y - by, lines.first.width),
    last: line(lines.last.x, lines.last.y - by, lines.last.width),
  });
  const follow = (lines: Lines, moved: Lines) =>
    atOffset(moved, offsetFrom(lines, placeBubble(lines, bubble, viewport)));

  it('follows the text with the same offset, off the screen and back', () => {
    const lines = { first: line(100, 200), last: line(40, 260), backward: false, rtl: false };
    expect(follow(lines, scrolled(lines, 100))).toEqual({ left: 326, top: 186 });
    expect(follow(lines, scrolled(lines, 2000))).toEqual({ left: 326, top: -1714 });
    expect(follow(lines, scrolled(lines, -1000))).toEqual({ left: 326, top: 1286 });
  });

  it('keeps the side and the viewport edge it was first placed at', () => {
    const low = { first: line(100, 700), last: line(40, 760), backward: false, rtl: false };
    expect(follow(low, scrolled(low, 500))).toEqual({ left: 326, top: 228 });
    const edge = { first: line(900, 200), last: line(900, 200), backward: false, rtl: false };
    expect(follow(edge, scrolled(edge, 100))).toEqual({ left: 902, top: 126 });
  });

  it('stays by the point where the reader let go when the lines rewrap', () => {
    const forward = { first: line(100, 200), last: line(40, 260), backward: false, rtl: false };
    expect(follow(forward, { ...forward, last: line(40, 300, 120) })).toEqual({
      left: 146,
      top: 326,
    });
    const backward = { ...forward, backward: true };
    expect(follow(backward, { ...backward, first: line(60, 180, 500) })).toEqual({
      left: 46,
      top: 148,
    });
    const rtl = { first: line(100, 200), last: line(400, 260), backward: false, rtl: true };
    expect(follow(rtl, { ...rtl, last: line(520, 300, 120) })).toEqual({ left: 444, top: 326 });
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
    const end = { backward: true, rtl: false };
    const lines = selectedLines(rangeWith([line(0, 100, 0), first, last, line(160, 120, 0)]), end);
    expect(lines).toEqual({ first, last, ...end });
  });

  it('finds no lines in a range without visible boxes', () => {
    expect(selectedLines(rangeWith([line(0, 100, 0)]), { backward: false, rtl: false })).toBe(
      undefined,
    );
  });
});

describe('endOf', () => {
  it('tells where the reader let go of the selection, within a node and across nodes', () => {
    document.body.innerHTML = '<p>One two. <b>Three</b> four.</p>';
    const text = document.querySelector('p')?.firstChild;
    const bold = document.querySelector('b')?.firstChild;
    const selection = document.getSelection();
    if (!text || !bold || !selection) throw new Error('Fixture changed');
    selection.setBaseAndExtent(text, 2, bold, 3);
    expect(endOf(selection)).toEqual({ backward: false, rtl: false });
    selection.setBaseAndExtent(bold, 3, text, 2);
    expect(endOf(selection).backward).toBe(true);
    selection.setBaseAndExtent(text, 5, text, 2);
    expect(endOf(selection).backward).toBe(true);
    selection.removeAllRanges();
  });

  it('tells when the lines where the reader let go run right to left', () => {
    document.body.innerHTML = '<p style="direction: rtl">مرحبا بالعالم. هذا نص.</p>';
    const text = document.querySelector('p')?.firstChild;
    const selection = document.getSelection();
    if (!text || !selection) throw new Error('Fixture changed');
    selection.setBaseAndExtent(text, 0, text, 8);
    expect(endOf(selection)).toEqual({ backward: false, rtl: true });
    selection.removeAllRanges();
  });
});
