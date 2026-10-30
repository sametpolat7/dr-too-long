import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { summarizeSelection } from '../src/content/summarize.tsx';
import { layOutText } from './layout.ts';

const { container, setHidden, startBubble, requestBubbleHidden, sendMessage } = vi.hoisted(() => {
  const setHidden = vi.fn();
  return {
    // The card's closed shadow root, replaced by a container the test can reach.
    container: document.createElement('div'),
    setHidden,
    startBubble: vi.fn(async () => ({ setHidden })),
    requestBubbleHidden: vi.fn(),
    sendMessage: vi.fn(),
  };
});
vi.mock('wxt/utils/content-script-ui/shadow-root', () => ({
  createShadowRootUi: async (
    _ctx: unknown,
    options: { onRemove: (root: HTMLElement) => void },
  ) => ({
    uiContainer: container,
    mount: () => undefined,
    remove: () => options.onRemove(container),
  }),
}));
vi.mock('../src/content/bubble/bubble.tsx', () => ({ startBubble }));
vi.mock('../src/messages.ts', () => ({
  requestBubbleHidden,
  requestLanguageChoice: async () => null,
  sendMessage,
}));
// A summary that never arrives keeps the card on its first view.
vi.mock('../src/summarize-port.ts', () => ({
  portSummarizer: {
    summarize: () => ({
      [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => undefined) }),
    }),
  },
}));

let controller: AbortController;
let valid: boolean;
const context = () =>
  ({
    get isValid() {
      return valid;
    },
    signal: controller.signal,
    onInvalidated: () => () => undefined,
  }) as unknown as ContentScriptContext;

function select() {
  document.body.innerHTML = '<p>The keeper logged every ship. The notebooks dated the decline.</p>';
  const range = document.createRange();
  range.selectNodeContents(document.body);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
}

// happy-dom's PageTransitionEvent ignores persisted.
function pageshow(persisted: boolean): Event {
  return Object.defineProperty(new Event('pageshow'), 'persisted', { value: persisted });
}

// The worker's answer, held until the test lets it through.
function holdAnswer() {
  let answer: (hidden: boolean) => void = () => undefined;
  requestBubbleHidden.mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      answer = resolve;
    }),
  );
  return (hidden: boolean) => answer(hidden);
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const button = (label: string) =>
  [...container.querySelectorAll('button')].find((each) => each.textContent === label);

const HIDE = 'Hide the bubble on this site until the tab closes';
const SHOW = 'Show the bubble on this site';

describe('summarizeSelection', () => {
  beforeEach(() => {
    controller = new AbortController();
    valid = true;
    fakeBrowser.i18n.getUILanguage = () => 'en-US';
    vi.stubGlobal('CSS', { highlights: new Map() });
    layOutText();
    select();
    vi.clearAllMocks();
    requestBubbleHidden.mockResolvedValue(false);
  });

  afterEach(() => {
    controller.abort();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('hides the bubble from the card, saves it and shows the switch the other way', async () => {
    await summarizeSelection(context());
    await settle();
    button(HIDE)?.click();
    expect(setHidden).toHaveBeenLastCalledWith(true);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'save-bubble-hidden', hidden: true });
    expect(button(SHOW)).toBeDefined();
  });

  it('switches the card even when an extension reload orphaned the script and the save throws', async () => {
    await summarizeSelection(context());
    await settle();
    sendMessage.mockImplementationOnce(() => {
      throw new Error('Extension context invalidated.');
    });
    expect(() => button(HIDE)?.click()).toThrow('Extension context invalidated.');
    expect(setHidden).toHaveBeenLastCalledWith(true);
    expect(button(SHOW)).toBeDefined();
  });

  it('asks again when the page comes back from the back-forward cache', async () => {
    await summarizeSelection(context());
    await settle();
    window.dispatchEvent(pageshow(true));
    await settle();
    expect(requestBubbleHidden).toHaveBeenCalledTimes(2);
    expect(setHidden).not.toHaveBeenCalled();
    requestBubbleHidden.mockResolvedValue(true);
    window.dispatchEvent(pageshow(false));
    await settle();
    expect(requestBubbleHidden).toHaveBeenCalledTimes(2);
    window.dispatchEvent(pageshow(true));
    await settle();
    expect(setHidden).toHaveBeenCalledWith(true);
    expect(button(SHOW)).toBeDefined();
    expect(sendMessage).not.toHaveBeenCalledWith({ type: 'save-bubble-hidden', hidden: true });
  });

  it('draws no card the reader closed when the page comes back', async () => {
    await summarizeSelection(context());
    await settle();
    container.querySelector<HTMLButtonElement>('button.close')?.click();
    expect(container.querySelector('section')).toBeNull();
    requestBubbleHidden.mockResolvedValue(true);
    window.dispatchEvent(pageshow(true));
    await settle();
    expect(setHidden).toHaveBeenCalledWith(true);
    expect(container.querySelector('section')).toBeNull();
  });

  it('asks nothing when the page comes back after an extension reload orphaned the script', async () => {
    await summarizeSelection(context());
    await settle();
    valid = false;
    window.dispatchEvent(pageshow(true));
    await settle();
    expect(requestBubbleHidden).toHaveBeenCalledTimes(1);
  });

  it('keeps a click on the switch made while the worker answers', async () => {
    await summarizeSelection(context());
    await settle();
    const answer = holdAnswer();
    window.dispatchEvent(pageshow(true));
    button(HIDE)?.click();
    answer(false);
    await settle();
    expect(setHidden).toHaveBeenLastCalledWith(true);
    expect(button(SHOW)).toBeDefined();
  });

  it('ignores an answer that arrives after a new script replaced this one', async () => {
    await summarizeSelection(context());
    await settle();
    const answer = holdAnswer();
    window.dispatchEvent(pageshow(true));
    valid = false;
    answer(true);
    await settle();
    expect(setHidden).not.toHaveBeenCalled();
  });
});
