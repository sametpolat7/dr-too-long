import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { type Bubble, startBubble } from '../src/content/bubble/bubble.tsx';
import { BUBBLE_DELAY_MS } from '../src/content/bubble/watch.ts';

// The bubble's closed shadow root, replaced by a container in an open host the test can reach.
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

const LONG = 'The keeper logged every ship that passed the cape for forty years. '.repeat(3);

let valid = true;
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
  vi.advanceTimersByTime(BUBBLE_DELAY_MS);
}

const button = () => container.querySelector('button');

describe('startBubble', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    valid = true;
    vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue([
      new DOMRect(40, 200, 300, 20),
    ] as unknown as DOMRectList);
  });
  afterEach(() => {
    bubble?.setHidden(true);
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.getSelection()?.removeAllRanges();
  });

  it('shows Summarize above the selection, keeps the selection on a press and summarizes on a click', async () => {
    const onSummarize = vi.fn();
    bubble = await startBubble(ctx, { hidden: false, onSummarize });
    select();
    expect(button()?.textContent).toBe('Summarize');
    expect([button()?.style.left, button()?.style.top]).toEqual(['40px', '192px']);
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    button()?.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    button()?.click();
    expect(onSummarize).toHaveBeenCalledOnce();
    expect(button()).toBeNull();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.advanceTimersByTime(BUBBLE_DELAY_MS);
    expect(button()).toBeNull();
  });

  it('offers nothing while hidden on the site, and again once shown', async () => {
    bubble = await startBubble(ctx, { hidden: true, onSummarize: vi.fn() });
    select();
    expect(button()).toBeNull();
    bubble.setHidden(false);
    select();
    expect(button()).not.toBeNull();
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
    vi.advanceTimersByTime(BUBBLE_DELAY_MS);
    expect(button()).not.toBeNull();
  });

  it('offers nothing in a script orphaned by an extension reload', async () => {
    valid = false;
    bubble = await startBubble(ctx, { hidden: false, onSummarize: vi.fn() });
    select();
    expect(button()).toBeNull();
  });
});
