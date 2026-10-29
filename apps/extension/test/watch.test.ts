import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUBBLE_DELAY_MS,
  BUBBLE_MIN_CHARS,
  BUBBLE_SCROLL_PX,
  watchSelections,
} from '../src/content/bubble/watch.ts';
import { BUBBLE_UI, CARD_UI } from '../src/content/ui.ts';

const LONG = 'The keeper logged every ship that passed the cape for forty years. '.repeat(3);
const FRAME_MS = 16;

let top = 200;
let valid = true;
let controller: AbortController;

function watch() {
  const offer = vi.fn();
  const withdraw = vi.fn();
  const watcher = watchSelections({
    isValid: () => valid,
    signal: controller.signal,
    offer,
    withdraw,
  });
  return { offer, withdraw, watcher };
}

function select(text: string, tag = 'p') {
  document.body.innerHTML = `<${tag}>${text}</${tag.split(' ')[0]}>`;
  const element = document.body.firstElementChild;
  if (!element) throw new Error('nothing to select');
  const range = document.createRange();
  range.selectNodeContents(element);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
}

const fire = (type: string, target: EventTarget = document) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true }));
const key = (type: string, key: string, target: EventTarget = document) =>
  target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key }));
const scroll = () => {
  document.dispatchEvent(new Event('scroll'));
  vi.advanceTimersByTime(FRAME_MS);
};

// A selection released with the mouse, once the delay has passed.
function release() {
  fire('mouseup');
  vi.advanceTimersByTime(BUBBLE_DELAY_MS);
}

describe('watchSelections', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    controller = new AbortController();
    top = 200;
    valid = true;
    vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(
      () => [new DOMRect(40, top, 300, 20)] as unknown as DOMRectList,
    );
  });
  afterEach(() => {
    controller.abort();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.getSelection()?.removeAllRanges();
    document.body.innerHTML = '';
  });

  it('offers the bubble a moment after the mouse button is released', () => {
    const { offer } = watch();
    fire('mousedown');
    select(LONG);
    key('keyup', 'Shift');
    vi.advanceTimersByTime(BUBBLE_DELAY_MS);
    expect(offer).not.toHaveBeenCalled();
    fire('mouseup');
    vi.advanceTimersByTime(BUBBLE_DELAY_MS - 1);
    expect(offer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(offer).toHaveBeenCalledOnce();
    expect(offer.mock.calls[0]?.[0].first.top).toBe(200);
  });

  it('offers it after a selection made with the keyboard', () => {
    const { offer } = watch();
    select(LONG);
    key('keyup', 'ArrowDown');
    vi.advanceTimersByTime(BUBBLE_DELAY_MS);
    expect(offer).toHaveBeenCalledOnce();
  });

  it('offers nothing for the selection on the page when watching starts, until it changes', () => {
    select(LONG);
    const { offer } = watch();
    release();
    key('keyup', 'ArrowDown');
    vi.advanceTimersByTime(BUBBLE_DELAY_MS);
    expect(offer).not.toHaveBeenCalled();
    select(LONG);
    release();
    expect(offer).toHaveBeenCalledOnce();
  });

  it('offers the selection on the page when watching starts, when asked to', () => {
    select(LONG);
    const offer = vi.fn();
    watchSelections({
      isValid: () => valid,
      signal: controller.signal,
      offer,
      withdraw: vi.fn(),
      offerCurrent: true,
    });
    vi.advanceTimersByTime(BUBBLE_DELAY_MS);
    expect(offer).toHaveBeenCalledOnce();
  });

  it('cancels a pending check when a press starts', () => {
    const { offer } = watch();
    select(LONG);
    fire('mouseup');
    vi.advanceTimersByTime(BUBBLE_DELAY_MS / 2);
    fire('mousedown');
    vi.advanceTimersByTime(BUBBLE_DELAY_MS);
    expect(offer).not.toHaveBeenCalled();
    release();
    expect(offer).toHaveBeenCalledOnce();
  });

  it(`offers nothing for fewer than ${BUBBLE_MIN_CHARS} characters`, () => {
    const { offer } = watch();
    select('x'.repeat(BUBBLE_MIN_CHARS - 1));
    release();
    expect(offer).not.toHaveBeenCalled();
    select('x'.repeat(BUBBLE_MIN_CHARS));
    release();
    expect(offer).toHaveBeenCalledOnce();
  });

  it('offers nothing for text in an editable region', () => {
    const { offer } = watch();
    select(LONG, 'div contenteditable');
    release();
    expect(offer).not.toHaveBeenCalled();
  });

  it('offers nothing while a frame holds the focus', () => {
    const { offer } = watch();
    select(LONG);
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.createElement('iframe'));
    release();
    expect(offer).not.toHaveBeenCalled();
  });

  it('offers nothing on a pinch-zoomed page', () => {
    vi.stubGlobal('visualViewport', {
      scale: 2,
      width: window.innerWidth,
      height: window.innerHeight,
      addEventListener: () => undefined,
    });
    const { offer } = watch();
    select(LONG);
    release();
    expect(offer).not.toHaveBeenCalled();
  });

  it.each([
    ['above', () => -100],
    ['below', () => window.innerHeight + 10],
  ])('offers nothing for a selection scrolled %s the viewport', (_, position) => {
    const { offer } = watch();
    select(LONG);
    top = position();
    release();
    expect(offer).not.toHaveBeenCalled();
  });

  it.each([CARD_UI, BUBBLE_UI])('ignores presses, releases and keys on %s', (name) => {
    const { offer, withdraw } = watch();
    const host = document.createElement(name);
    select(LONG);
    document.body.appendChild(host);
    fire('mouseup', host);
    key('keyup', 'ArrowDown', host);
    vi.advanceTimersByTime(BUBBLE_DELAY_MS);
    expect(offer).not.toHaveBeenCalled();
    release();
    expect(offer).toHaveBeenCalledOnce();
    fire('mousedown', host);
    expect(withdraw).not.toHaveBeenCalled();
  });

  it('withdraws the bubble on a press and when the selection collapses', () => {
    const { offer, withdraw } = watch();
    select(LONG);
    release();
    fire('mousedown');
    expect(withdraw).toHaveBeenCalledOnce();
    release();
    expect(offer).toHaveBeenCalledTimes(2);
    document.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    expect(withdraw).toHaveBeenCalledTimes(2);
  });

  it('withdraws the bubble when the selection shrinks below the minimum', () => {
    const { offer, withdraw } = watch();
    select(LONG);
    release();
    const text = document.querySelector('p')?.firstChild;
    const range = document.getSelection()?.getRangeAt(0);
    if (text && range) range.setEnd(text, BUBBLE_MIN_CHARS - 1);
    key('keyup', 'ArrowLeft');
    vi.advanceTimersByTime(BUBBLE_DELAY_MS);
    expect(offer).toHaveBeenCalledOnce();
    expect(withdraw).toHaveBeenCalledOnce();
  });

  it('withdraws the bubble when the focus moves into a frame', () => {
    const { withdraw } = watch();
    select(LONG);
    release();
    window.dispatchEvent(new Event('blur'));
    expect(withdraw).toHaveBeenCalledOnce();
  });

  it('dismisses the bubble alone on Escape, and offers nothing again until the selection changes', () => {
    const { offer, withdraw } = watch();
    const card = vi.fn();
    document.addEventListener('keydown', card, { capture: true, signal: controller.signal });
    select(LONG);
    release();
    key('keydown', 'Escape');
    key('keyup', 'Escape');
    expect(withdraw).toHaveBeenCalledOnce();
    expect(card).not.toHaveBeenCalled();
    key('keydown', 'Escape');
    expect(card).toHaveBeenCalledOnce();
    release();
    expect(offer).toHaveBeenCalledOnce();
    select(LONG);
    release();
    expect(offer).toHaveBeenCalledTimes(2);
  });

  it(`follows the text as it scrolls, and is dismissed past ${BUBBLE_SCROLL_PX} px`, () => {
    const { offer, withdraw } = watch();
    select(LONG);
    release();
    top = 200 - BUBBLE_SCROLL_PX;
    scroll();
    expect(offer).toHaveBeenCalledTimes(2);
    expect(offer.mock.calls[1]?.[0].first.top).toBe(200 - BUBBLE_SCROLL_PX);
    top -= 1;
    scroll();
    expect(withdraw).toHaveBeenCalledOnce();
    key('keyup', 'ArrowDown');
    vi.advanceTimersByTime(BUBBLE_DELAY_MS);
    expect(offer).toHaveBeenCalledTimes(2);
  });

  it('measures the scroll from where the selection was first offered, across key presses', () => {
    const { offer, withdraw } = watch();
    select(LONG);
    release();
    top = 150;
    scroll();
    key('keyup', 'ArrowDown');
    vi.advanceTimersByTime(BUBBLE_DELAY_MS);
    expect(offer).toHaveBeenCalledTimes(3);
    top = 200 - BUBBLE_SCROLL_PX - 10;
    scroll();
    expect(withdraw).toHaveBeenCalledOnce();
  });

  it('offers a new selection elsewhere on the page', () => {
    const { offer } = watch();
    select(LONG);
    release();
    top = 200 + 3 * BUBBLE_SCROLL_PX;
    select(LONG);
    release();
    expect(offer).toHaveBeenCalledTimes(2);
    expect(offer.mock.calls[1]?.[0].first.top).toBe(top);
  });

  it('offers nothing again once the bubble was clicked, until the selection changes', () => {
    const { offer, withdraw, watcher } = watch();
    select(LONG);
    release();
    watcher.dismiss();
    expect(withdraw).toHaveBeenCalledOnce();
    release();
    key('keyup', 'ArrowDown');
    vi.advanceTimersByTime(BUBBLE_DELAY_MS);
    expect(offer).toHaveBeenCalledOnce();
  });

  it('stops when its signal is aborted, with a check or a frame pending', () => {
    const { offer } = watch();
    select(LONG);
    release();
    document.dispatchEvent(new Event('scroll'));
    fire('mouseup');
    controller.abort();
    vi.advanceTimersByTime(BUBBLE_DELAY_MS);
    release();
    expect(offer).toHaveBeenCalledOnce();
  });

  it('offers nothing once an extension reload has orphaned the script', () => {
    const { offer } = watch();
    select(LONG);
    release();
    valid = false;
    scroll();
    release();
    expect(offer).toHaveBeenCalledOnce();
  });
});
