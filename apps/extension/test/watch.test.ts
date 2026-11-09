import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchSelections } from '../src/content/bubble/watch.ts';
import { BUBBLE_UI, CARD_UI } from '../src/content/ui.ts';
import { LONG } from './helpers.ts';

const FRAME_MS = 16;

let top = 200;
let boxes = () => [new DOMRect(40, top, 300, 20)];
let covers: Element[] = [];
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
const nextTask = () => vi.advanceTimersByTime(0);
const offered = (offer: ReturnType<typeof vi.fn>) =>
  offer.mock.calls.map(([lines, following, visible]) => [lines.first.top, following, visible]);

function release() {
  fire('mouseup');
  nextTask();
}

describe('watchSelections', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    controller = new AbortController();
    top = 200;
    boxes = () => [new DOMRect(40, top, 300, 20)];
    covers = [];
    valid = true;
    vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(
      () => boxes() as unknown as DOMRectList,
    );
    vi.spyOn(document, 'elementsFromPoint').mockImplementation(() => [
      ...covers,
      ...document.querySelectorAll('p'),
    ]);
  });
  afterEach(() => {
    controller.abort();
    vi.useRealTimers();
    document.getSelection()?.removeAllRanges();
    document.body.innerHTML = '';
  });

  it('offers the bubble on the task after the mouse button is released, with no wait', () => {
    const { offer } = watch();
    fire('mousedown');
    select(LONG);
    key('keyup', 'Shift');
    nextTask();
    expect(offer).not.toHaveBeenCalled();
    fire('mouseup');
    expect(offer).not.toHaveBeenCalled();
    nextTask();
    expect(offer).toHaveBeenCalledOnce();
    expect(offer.mock.calls[0]).toMatchObject([
      { first: { top: 200 }, backward: false },
      false,
      true,
    ]);
  });

  it('tells the offer when the selection was made backward, and keeps it while following', () => {
    const { offer } = watch();
    select(LONG);
    const text = document.querySelector('p')?.firstChild;
    if (!text) throw new Error('Fixture changed');
    document.getSelection()?.setBaseAndExtent(text, LONG.length, text, 0);
    release();
    expect(offer.mock.calls[0]?.[0].backward).toBe(true);
    top = 180;
    scroll();
    expect(offer.mock.calls[1]).toMatchObject([
      { first: { top: 180 }, backward: true },
      true,
      true,
    ]);
  });

  it('offers it after a selection made with the keyboard', () => {
    const { offer } = watch();
    select(LONG);
    key('keyup', 'ArrowDown');
    nextTask();
    expect(offer).toHaveBeenCalledOnce();
  });

  it('offers nothing for the selection on the page when watching starts, until it changes', () => {
    select(LONG);
    const { offer } = watch();
    release();
    key('keyup', 'ArrowDown');
    nextTask();
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
    nextTask();
    expect(offer).toHaveBeenCalledOnce();
  });

  it('cancels a pending check when a press starts', () => {
    const { offer } = watch();
    select(LONG);
    fire('mouseup');
    fire('mousedown');
    nextTask();
    expect(offer).not.toHaveBeenCalled();
    release();
    expect(offer).toHaveBeenCalledOnce();
  });

  it('offers nothing for a phrase, a number or a link, and the bubble for a sentence', () => {
    const { offer } = watch();
    for (const text of [
      'the keeper',
      '3.5',
      'https://example.org/path',
      'A sentence cut off before',
    ]) {
      select(text);
      release();
    }
    expect(offer).not.toHaveBeenCalled();
    select('He said "go."');
    release();
    expect(offer).toHaveBeenCalledOnce();
    select('One sentence. And the start of another');
    release();
    expect(offer).toHaveBeenCalledTimes(2);
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
    const { offer } = watch();
    const host = document.createElement(name);
    select(LONG);
    document.body.appendChild(host);
    fire('mouseup', host);
    key('keyup', 'ArrowDown', host);
    nextTask();
    expect(offer).not.toHaveBeenCalled();
    release();
    expect(offer).toHaveBeenCalledOnce();
    fire('mousedown', host);
    select(LONG);
    key('keyup', 'ArrowDown');
    nextTask();
    expect(offer).toHaveBeenCalledTimes(2);
  });

  it('keeps the bubble through a press that leaves the selection, and withdraws it when the selection collapses', () => {
    const { offer, withdraw } = watch();
    select(LONG);
    release();
    fire('mousedown');
    release();
    expect(withdraw).not.toHaveBeenCalled();
    expect(offer).toHaveBeenCalledOnce();
    document.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    expect(withdraw).toHaveBeenCalledOnce();
  });

  it('withdraws the bubble as soon as another selection replaces it, and offers that one on release', () => {
    const { offer, withdraw } = watch();
    select(LONG);
    release();
    top = 300;
    select(LONG);
    expect(withdraw).toHaveBeenCalledOnce();
    release();
    expect(offered(offer)).toEqual([
      [200, false, true],
      [300, false, true],
    ]);
  });

  it('withdraws the bubble when the selection shrinks to part of a sentence', () => {
    const { offer, withdraw } = watch();
    select(LONG);
    release();
    const text = document.querySelector('p')?.firstChild;
    const range = document.getSelection()?.getRangeAt(0);
    if (text && range) range.setEnd(text, 10);
    key('keyup', 'ArrowLeft');
    nextTask();
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

  it('lets Escape through while the bubble is hidden, and still dismisses it', () => {
    const { withdraw } = watch();
    const card = vi.fn();
    document.addEventListener('keydown', card, { capture: true, signal: controller.signal });
    select(LONG);
    release();
    top = -5000;
    scroll();
    key('keydown', 'Escape');
    expect(card).toHaveBeenCalledOnce();
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

  it('follows the text once a frame as it scrolls, and is not dismissed by a long scroll', () => {
    const { offer, withdraw } = watch();
    select(LONG);
    release();
    top = 150;
    document.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    scroll();
    expect(offer).toHaveBeenCalledTimes(2);
    top = -5000;
    scroll();
    top = 200;
    scroll();
    expect(offered(offer)).toEqual([
      [200, false, true],
      [150, true, true],
      [-5000, true, false],
      [200, true, true],
    ]);
    expect(withdraw).not.toHaveBeenCalled();
  });

  it('keeps following a selection that keys and presses leave as it was, as Page Down does', () => {
    const { offer, withdraw } = watch();
    select(LONG);
    release();
    top = -900;
    scroll();
    key('keyup', 'PageDown');
    nextTask();
    key('keyup', 'Meta');
    release();
    top = 200;
    scroll();
    expect(offered(offer)).toEqual([
      [200, false, true],
      [-900, true, false],
      [200, true, true],
    ]);
    expect(withdraw).not.toHaveBeenCalled();
  });

  it('places a selection the keys change afresh, and follows it in between', () => {
    const { offer } = watch();
    select(LONG);
    release();
    top = 150;
    scroll();
    const text = document.querySelector('p')?.firstChild;
    if (!text) throw new Error('Fixture changed');
    document.getSelection()?.setBaseAndExtent(text, 0, text, (LONG.length * 2) / 3);
    document.dispatchEvent(new Event('selectionchange'));
    key('keyup', 'ArrowUp');
    nextTask();
    expect(offer.mock.calls.map(([, following]) => following)).toEqual([false, true, false]);
  });

  it('hides the bubble while its scroller clips the line it stands by or something covers it', () => {
    const { offer, withdraw } = watch();
    document.body.innerHTML = `<header></header><div style="overflow-y: auto"><p>${LONG}</p></div>`;
    const pane = document.querySelector('div');
    const header = document.querySelector('header');
    const bubble = document.body.appendChild(document.createElement(BUBBLE_UI));
    if (!pane || !header) throw new Error('Fixture changed');
    Object.defineProperties(pane, {
      scrollHeight: { value: 1000 },
      clientHeight: { value: 100 },
      clientWidth: { value: 600 },
    });
    vi.spyOn(pane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 600, 100));
    document.getSelection()?.selectAllChildren(pane);
    document.dispatchEvent(new Event('selectionchange'));
    release();
    for (const [scrolledTo, over] of [
      [150, []],
      [210, []],
      [150, [header]],
      [150, [bubble]],
    ] as const) {
      top = scrolledTo;
      covers = [...over];
      scroll();
    }
    expect(offered(offer)).toEqual([
      [200, false, true],
      [150, true, true],
      [210, true, false],
      [150, true, false],
      [150, true, true],
    ]);
    expect(withdraw).not.toHaveBeenCalled();
  });

  it('withdraws the bubble when the page removes or hides the text it follows', () => {
    const { offer, withdraw } = watch();
    select(LONG);
    release();
    boxes = () => [];
    scroll();
    expect(withdraw).toHaveBeenCalledOnce();
    expect(offer).toHaveBeenCalledOnce();
  });

  it('offers a new selection elsewhere on the page', () => {
    const { offer } = watch();
    select(LONG);
    release();
    top = 440;
    select(LONG);
    release();
    expect(offer).toHaveBeenCalledTimes(2);
    expect(offer.mock.calls[1]).toMatchObject([{ first: { top: 440 } }, false, true]);
  });

  it('offers nothing again once the bubble was clicked, until the selection changes', () => {
    const { offer, withdraw, watcher } = watch();
    select(LONG);
    release();
    watcher.dismiss();
    expect(withdraw).toHaveBeenCalledOnce();
    release();
    key('keyup', 'ArrowDown');
    nextTask();
    expect(offer).toHaveBeenCalledOnce();
  });

  it('stops when its signal is aborted, with a check or a frame pending', () => {
    const { offer } = watch();
    select(LONG);
    release();
    document.dispatchEvent(new Event('scroll'));
    fire('mouseup');
    controller.abort();
    nextTask();
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
