import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { BUBBLE_MIN_CHARS } from '../src/content/bubble/watch.ts';
import { watchEverySite } from '../src/content/every-site.ts';
import { BUBBLE_UI, SUMMARIZE_STARTED } from '../src/content/ui.ts';

const { startBubble, setHidden, requestEverySiteBubble, requestSummarize } = vi.hoisted(() => {
  const setHidden = vi.fn();
  return {
    setHidden,
    startBubble: vi.fn(async (_ctx: unknown, _options: unknown) => ({ setHidden })),
    requestEverySiteBubble: vi.fn(),
    requestSummarize: vi.fn(),
  };
});
vi.mock('../src/content/bubble/bubble.tsx', () => ({ startBubble }));
vi.mock('../src/messages.ts', () => ({ requestEverySiteBubble, requestSummarize }));

let controller: AbortController;
const context = () =>
  ({
    signal: controller.signal,
    abort: () => controller.abort(),
  }) as unknown as ContentScriptContext;

function select(length: number) {
  document.body.innerHTML = `<p>${'x'.repeat(length)}</p>`;
  const range = document.createRange();
  range.selectNodeContents(document.body);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
}

const release = () => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
const key = (type: string, key: string) =>
  document.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key }));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const options = () =>
  startBubble.mock.calls[0]?.[1] as unknown as { offerCurrent: boolean; onSummarize: () => void };

// happy-dom's PageTransitionEvent ignores persisted.
function pageshow(persisted: boolean): Event {
  return Object.defineProperty(new Event('pageshow'), 'persisted', { value: persisted });
}

// The worker's answer, held until the test lets it through.
function holdAnswer() {
  let answer: (shown: boolean) => void = () => undefined;
  requestEverySiteBubble.mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      answer = resolve;
    }),
  );
  return (shown: boolean) => answer(shown);
}

describe('watchEverySite', () => {
  beforeEach(() => {
    controller = new AbortController();
    startBubble.mockClear();
    setHidden.mockReset();
    requestSummarize.mockReset().mockResolvedValue(true);
    requestEverySiteBubble.mockReset().mockResolvedValue(true);
  });
  afterEach(() => {
    controller.abort();
    document.getSelection()?.removeAllRanges();
    document.body.innerHTML = '';
    for (const host of document.querySelectorAll(BUBBLE_UI)) host.remove();
  });

  it('leaves the worker and the page alone until a long selection is released', async () => {
    void watchEverySite(context());
    select(BUBBLE_MIN_CHARS - 1);
    release();
    await settle();
    expect(requestEverySiteBubble).not.toHaveBeenCalled();
    select(BUBBLE_MIN_CHARS);
    release();
    await settle();
    expect(requestEverySiteBubble).toHaveBeenCalledOnce();
    expect(startBubble).toHaveBeenCalledOnce();
  });

  it('starts on a long selection made with the keyboard', async () => {
    void watchEverySite(context());
    select(BUBBLE_MIN_CHARS);
    key('keyup', 'ArrowDown');
    await settle();
    expect(startBubble).toHaveBeenCalledOnce();
  });

  it('offers that selection, and a click asks the worker to summarize', async () => {
    void watchEverySite(context());
    select(BUBBLE_MIN_CHARS);
    release();
    await settle();
    expect(options()).toMatchObject({ hidden: false, offerCurrent: true });
    options().onSummarize();
    await settle();
    expect(requestSummarize).toHaveBeenCalledOnce();
    expect(controller.signal.aborted).toBe(false);
  });

  it('stops once the worker refuses a click, after the opt-in was withdrawn', async () => {
    requestSummarize.mockResolvedValue(false);
    void watchEverySite(context());
    select(BUBBLE_MIN_CHARS);
    release();
    await settle();
    options().onSummarize();
    await settle();
    expect(controller.signal.aborted).toBe(true);
  });

  it.each([
    ['a press', () => document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))],
    ['Escape', () => key('keydown', 'Escape')],
  ])(
    'leaves the selection to the bubble’s own events after %s during the answer',
    async (_, act) => {
      const answer = holdAnswer();
      void watchEverySite(context());
      select(BUBBLE_MIN_CHARS);
      release();
      await settle();
      act();
      answer(true);
      await settle();
      expect(options().offerCurrent).toBe(false);
    },
  );

  it('asks the worker once, and stops reading selections, however many follow', async () => {
    void watchEverySite(context());
    select(BUBBLE_MIN_CHARS);
    release();
    release();
    await settle();
    const reads = vi.spyOn(document, 'getSelection');
    release();
    expect(requestEverySiteBubble).toHaveBeenCalledOnce();
    expect(reads).not.toHaveBeenCalled();
    reads.mockRestore();
  });

  it('shows nothing when the worker says no: the opt-in withdrawn, or the bubble hidden here', async () => {
    requestEverySiteBubble.mockResolvedValue(false);
    void watchEverySite(context());
    select(BUBBLE_MIN_CHARS);
    release();
    await settle();
    expect(startBubble).not.toHaveBeenCalled();
  });

  it('asks again when the page comes back from the back-forward cache', async () => {
    void watchEverySite(context());
    select(BUBBLE_MIN_CHARS);
    release();
    await settle();
    requestEverySiteBubble.mockResolvedValue(false);
    window.dispatchEvent(pageshow(false));
    await settle();
    expect(setHidden).not.toHaveBeenCalled();
    window.dispatchEvent(pageshow(true));
    await settle();
    expect(setHidden).toHaveBeenCalledWith(true);
  });

  it('stops when a summarize script starts before the selection', async () => {
    void watchEverySite(context());
    document.dispatchEvent(new Event(SUMMARIZE_STARTED));
    select(BUBBLE_MIN_CHARS);
    release();
    await settle();
    expect(requestEverySiteBubble).not.toHaveBeenCalled();
  });

  it('stops when a summarize script starts while the worker answers', async () => {
    const answer = holdAnswer();
    void watchEverySite(context());
    select(BUBBLE_MIN_CHARS);
    release();
    await settle();
    expect(requestEverySiteBubble).toHaveBeenCalledOnce();
    document.dispatchEvent(new Event(SUMMARIZE_STARTED));
    answer(true);
    await settle();
    expect(startBubble).not.toHaveBeenCalled();
  });

  it('leaves the page to a summarize script that started first, with its own bubble', async () => {
    document.documentElement.append(document.createElement(BUBBLE_UI));
    void watchEverySite(context());
    select(BUBBLE_MIN_CHARS);
    release();
    await settle();
    expect(startBubble).not.toHaveBeenCalled();
  });
});
