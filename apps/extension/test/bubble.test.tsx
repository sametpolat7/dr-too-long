import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { type Bubble, startBubble } from '../src/content/bubble/bubble.tsx';
import { LONG } from './helpers.ts';

const { host, container } = vi.hoisted(() => {
  const host = document.createElement('dr-too-long-bubble');
  return { host, container: host.appendChild(document.createElement('div')) };
});
vi.mock('wxt/utils/content-script-ui/shadow-root', () => ({
  createShadowRootUi: async () => ({
    uiContainer: container,
    mount: () => document.documentElement.append(host),
  }),
}));

let valid = true;
let top = 200;
let boxes = () => [new DOMRect(40, top, 300, 20)];
let bubble: Bubble | undefined;
const ctx = {
  get isValid() {
    return valid;
  },
  onInvalidated: () => () => undefined,
} as unknown as ContentScriptContext;

function select() {
  document.body.innerHTML = `<p>${LONG}</p>`;
  const range = document.createRange();
  range.selectNodeContents(document.body);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  vi.advanceTimersByTime(0);
}

const button = () => container.querySelector('button');
const place = () => [button()?.style.left, button()?.style.top];
const scrollTo = (scrolledTo: number) => {
  top = scrolledTo;
  document.dispatchEvent(new Event('scroll'));
  vi.advanceTimersByTime(16);
};

describe('startBubble', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    valid = true;
    top = 200;
    boxes = () => [new DOMRect(40, top, 300, 20)];
    vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(
      () => boxes() as unknown as DOMRectList,
    );
    vi.spyOn(document, 'elementsFromPoint').mockImplementation(() => [
      ...document.querySelectorAll('p'),
    ]);
  });
  afterEach(() => {
    bubble?.setHidden(true);
    vi.useRealTimers();
    document.getSelection()?.removeAllRanges();
  });

  it('shows Summarize in the top layer where the selection ended, keeps the selection on a press and summarizes on a click', async () => {
    const onSummarize = vi.fn();
    bubble = await startBubble(ctx, { hidden: false, onSummarize });
    select();
    expect(button()?.textContent).toBe('Summarize');
    expect(button()?.querySelector('svg')?.getAttribute('width')).toBe('14');
    expect(button()?.getAttribute('popover')).toBe('manual');
    expect(button()?.hasAttribute('data-popover-open')).toBe(true);
    expect([button()?.style.left, button()?.style.top]).toEqual(['326px', '226px']);
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    button()?.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    button()?.click();
    expect(onSummarize).toHaveBeenCalledOnce();
    expect(button()).toBeNull();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.advanceTimersByTime(0);
    expect(button()).toBeNull();
  });

  it('follows the text with the same offset as the page scrolls, hidden off the screen and back', async () => {
    bubble = await startBubble(ctx, { hidden: false, onSummarize: () => undefined });
    select();
    expect(place()).toEqual(['326px', '226px']);
    scrollTo(120);
    expect(place()).toEqual(['326px', '146px']);
    scrollTo(-3000);
    expect(button()?.style.visibility).toBe('hidden');
    scrollTo(200);
    expect(place()).toEqual(['326px', '226px']);
    expect(button()?.style.visibility).toBe('');
  });

  it('places it afresh until the line it stands by is on the screen, then keeps that offset', async () => {
    bubble = await startBubble(ctx, { hidden: false, onSummarize: () => undefined });
    top = 600;
    boxes = () => [new DOMRect(40, top, 300, 20), new DOMRect(40, top + 400, 300, 20)];
    select();
    expect(place()).toEqual(['326px', `${window.innerHeight - 8}px`]);
    scrollTo(400);
    expect(button()?.style.visibility).toBe('hidden');
    scrollTo(200);
    expect(place()).toEqual(['326px', '626px']);
    scrollTo(0);
    expect(place()).toEqual(['326px', '426px']);
  });

  it("takes a dark page's scheme, which its focus ring follows", async () => {
    bubble = await startBubble(ctx, { hidden: false, onSummarize: () => undefined });
    document.body.style.backgroundColor = 'rgb(32, 33, 36)';
    onTestFinished(() => document.body.removeAttribute('style'));
    select();
    expect(button()?.dataset.theme).toBe('dark');
  });

  it('offers nothing while hidden on the site, and again once shown', async () => {
    bubble = await startBubble(ctx, { hidden: true, onSummarize: vi.fn() });
    select();
    expect(button()).toBeNull();
    bubble.setHidden(false);
    select();
    expect(button()?.hasAttribute('data-popover-open')).toBe(true);
    bubble.setHidden(true);
    expect(button()).toBeNull();
    select();
    expect(button()).toBeNull();
  });

  it('offers the selection already on the page when asked to', async () => {
    document.body.innerHTML = `<p>${LONG}</p>`;
    const range = document.createRange();
    range.selectNodeContents(document.body);
    document.getSelection()?.addRange(range);
    bubble = await startBubble(ctx, { hidden: false, offerCurrent: true, onSummarize: vi.fn() });
    vi.advanceTimersByTime(0);
    expect(button()).not.toBeNull();
  });

  it('offers nothing in a script orphaned by an extension reload', async () => {
    valid = false;
    bubble = await startBubble(ctx, { hidden: false, onSummarize: vi.fn() });
    select();
    expect(button()).toBeNull();
  });
});
