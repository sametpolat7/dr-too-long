import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { watchEverySite } from '../src/content/every-site.ts';
import { BUBBLE_UI, SUMMARIZE_STARTED } from '../src/content/ui.ts';
import type { EverySiteBubble } from '../src/messages.ts';
import { pageshow, settle } from './helpers.ts';

interface BubbleOptions {
  hidden: boolean;
  offerCurrent: boolean;
  onSummarize: () => void;
}

const { startBubble, setHidden, requestEverySiteBubble, requestSummarize } = vi.hoisted(() => {
  const setHidden = vi.fn();
  return {
    setHidden,
    startBubble: vi.fn(async (_ctx: unknown, _options: BubbleOptions) => ({ setHidden })),
    requestEverySiteBubble: vi.fn(),
    requestSummarize: vi.fn(),
  };
});
vi.mock('../src/content/bubble/bubble.tsx', () => ({ startBubble }));
vi.mock('../src/messages.ts', () => ({
  request: (type: string) =>
    type === 'read-every-site-bubble' ? requestEverySiteBubble() : requestSummarize(),
}));

let controller: AbortController;
const context = () =>
  ({
    signal: controller.signal,
    abort: () => controller.abort(),
    onInvalidated: (callback: () => void) => {
      controller.signal.addEventListener('abort', callback);
    },
  }) as unknown as ContentScriptContext;

const PHRASE = 'the keeper';
const SENTENCE = 'The keeper logged every ship.';

function select(text: string) {
  document.body.innerHTML = `<p>${text}</p>`;
  const range = document.createRange();
  range.selectNodeContents(document.body);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
}

const release = () => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
const key = (type: string, key: string) =>
  document.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key }));
const tell = (hidden: boolean) =>
  fakeBrowser.runtime.onMessage.trigger({ type: 'bubble-hidden', hidden }, {}, () => undefined);
function options(): BubbleOptions {
  const [, started] = startBubble.mock.calls[0] ?? [];
  if (!started) throw new Error('The bubble never started');
  return started;
}

function holdAnswer() {
  let answer: (next: EverySiteBubble) => void = () => undefined;
  requestEverySiteBubble.mockReturnValueOnce(
    new Promise<EverySiteBubble>((resolve) => {
      answer = resolve;
    }),
  );
  return (next: EverySiteBubble) => answer(next);
}

describe('watchEverySite', () => {
  beforeEach(() => {
    controller = new AbortController();
    startBubble.mockClear();
    setHidden.mockReset();
    requestSummarize.mockReset().mockResolvedValue(true);
    requestEverySiteBubble.mockReset().mockResolvedValue('shown');
  });
  afterEach(() => {
    controller.abort();
    document.getSelection()?.removeAllRanges();
    document.body.innerHTML = '';
    for (const host of document.querySelectorAll(BUBBLE_UI)) host.remove();
  });

  it('leaves the worker and the page alone until a long selection is released', async () => {
    void watchEverySite(context());
    select(PHRASE);
    release();
    await settle();
    expect(requestEverySiteBubble).not.toHaveBeenCalled();
    select(SENTENCE);
    release();
    await settle();
    expect(requestEverySiteBubble).toHaveBeenCalledOnce();
    expect(startBubble).toHaveBeenCalledOnce();
  });

  it('starts on a long selection made with the keyboard', async () => {
    void watchEverySite(context());
    select(SENTENCE);
    key('keyup', 'ArrowDown');
    await settle();
    expect(startBubble).toHaveBeenCalledOnce();
  });

  it('offers that selection, and a click asks the worker to summarize', async () => {
    void watchEverySite(context());
    select(SENTENCE);
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
    select(SENTENCE);
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
      select(SENTENCE);
      release();
      await settle();
      act();
      answer('shown');
      await settle();
      expect(options().offerCurrent).toBe(false);
    },
  );

  it('asks the worker once, and stops reading selections, however many follow', async () => {
    void watchEverySite(context());
    select(SENTENCE);
    release();
    release();
    await settle();
    const reads = vi.spyOn(document, 'getSelection');
    release();
    expect(requestEverySiteBubble).toHaveBeenCalledOnce();
    expect(reads).not.toHaveBeenCalled();
  });

  it('stops when the worker says the opt-in was withdrawn', async () => {
    requestEverySiteBubble.mockResolvedValue('off');
    void watchEverySite(context());
    select(SENTENCE);
    release();
    await settle();
    expect(startBubble).not.toHaveBeenCalled();
  });

  it('starts the bubble hidden on a site the reader turned it off on, so the popup can show it', async () => {
    requestEverySiteBubble.mockResolvedValue('hidden');
    void watchEverySite(context());
    select(SENTENCE);
    release();
    await settle();
    expect(options()).toMatchObject({ hidden: true });
    await tell(false);
    expect(setHidden).toHaveBeenLastCalledWith(false);
  });

  it('asks again when the page comes back from the back-forward cache', async () => {
    void watchEverySite(context());
    select(SENTENCE);
    release();
    await settle();
    requestEverySiteBubble.mockResolvedValue('hidden');
    window.dispatchEvent(pageshow(false));
    await settle();
    expect(setHidden).not.toHaveBeenCalled();
    window.dispatchEvent(pageshow(true));
    await settle();
    expect(setHidden).toHaveBeenCalledWith(true);
  });

  it('turns the bubble off and on as the popup tells it, until the script stops', async () => {
    void watchEverySite(context());
    select(SENTENCE);
    release();
    await settle();
    await tell(true);
    expect(setHidden).toHaveBeenLastCalledWith(true);
    await tell(false);
    expect(setHidden).toHaveBeenLastCalledWith(false);
    controller.abort();
    expect(fakeBrowser.runtime.onMessage.hasListeners()).toBe(false);
  });

  it('stops when a summarize script starts before the selection', async () => {
    void watchEverySite(context());
    document.dispatchEvent(new Event(SUMMARIZE_STARTED));
    select(SENTENCE);
    release();
    await settle();
    expect(requestEverySiteBubble).not.toHaveBeenCalled();
  });

  it('stops when a summarize script starts while the worker answers', async () => {
    const answer = holdAnswer();
    void watchEverySite(context());
    select(SENTENCE);
    release();
    await settle();
    expect(requestEverySiteBubble).toHaveBeenCalledOnce();
    document.dispatchEvent(new Event(SUMMARIZE_STARTED));
    answer('shown');
    await settle();
    expect(startBubble).not.toHaveBeenCalled();
  });

  it('leaves the page to a summarize script that started first, with its own bubble', async () => {
    document.documentElement.append(document.createElement(BUBBLE_UI));
    void watchEverySite(context());
    select(SENTENCE);
    release();
    await settle();
    expect(startBubble).not.toHaveBeenCalled();
  });
});
