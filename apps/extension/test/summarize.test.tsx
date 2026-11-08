import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { summarizeSelection } from '../src/content/summarize.tsx';
import { HIGHLIGHT_NAME } from '../src/highlight.ts';
import { layOutText, pageshow, settle } from './helpers.ts';

const {
  container,
  setHidden,
  startBubble,
  requestBubbleHidden,
  requestShape,
  sendMessage,
  summarize,
  canHostShadowRoot,
} = vi.hoisted(() => {
  const setHidden = vi.fn();
  return {
    // The card's closed shadow root, replaced by a container the test can reach.
    container: document.createElement('div'),
    setHidden,
    startBubble: vi.fn(async (_ctx: unknown, _options: { onSummarize: () => void }) => ({
      setHidden,
    })),
    requestBubbleHidden: vi.fn(),
    requestShape: vi.fn(),
    sendMessage: vi.fn(),
    summarize: vi.fn(),
    canHostShadowRoot: vi.fn(() => true),
  };
});
vi.mock('wxt/utils/content-script-ui/shadow-root', () => ({
  createShadowRootUi: async (_ctx: unknown, options: { onRemove: (root: HTMLElement) => void }) => {
    document.body.append(container);
    return {
      shadowHost: container,
      uiContainer: container,
      mount: () => undefined,
      remove: () => options.onRemove(container),
    };
  },
}));
vi.mock('../src/content/bubble/bubble.tsx', () => ({ startBubble }));
const replies: Record<string, () => Promise<unknown>> = {
  'read-bubble-hidden': () => requestBubbleHidden(),
  'read-language': async () => null,
  'read-shape': () => requestShape(),
};
vi.mock('../src/messages.ts', () => ({
  request: (type: string) => replies[type]?.(),
  sendMessage,
}));
vi.mock('../src/summarize-port.ts', () => ({ portSummarizer: { summarize } }));
vi.mock('../src/content/ui.ts', async (original) => ({
  ...(await original<typeof import('../src/content/ui.ts')>()),
  canHostShadowRoot,
}));

// A summary that never arrives keeps the card on its first view.
const pending = () => ({
  [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => undefined) }),
});

let controller: AbortController;
let valid: boolean;
// Each test's script is invalidated when it ends, as a newer script would, so no card it left open
// answers the next test's keys.
let onInvalidated: Array<() => void>;
const context = () =>
  ({
    get isValid() {
      return valid;
    },
    signal: controller.signal,
    onInvalidated: (callback: () => void) => {
      onInvalidated.push(callback);
      return () => undefined;
    },
  }) as unknown as ContentScriptContext;

function select() {
  document.body.innerHTML = '<p>The keeper logged every ship. The notebooks dated the decline.</p>';
  const range = document.createRange();
  range.selectNodeContents(document.body);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
}

function holdAnswer() {
  let answer: (hidden: boolean) => void = () => undefined;
  requestBubbleHidden.mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      answer = resolve;
    }),
  );
  return (hidden: boolean) => answer(hidden);
}

const button = (label: string) =>
  [...container.querySelectorAll('button')].find((each) => each.textContent === label);

const HIDE = 'Hide the bubble on this site until the tab closes';
const SHOW = 'Show the bubble on this site';

const pressed = () => container.querySelector('[aria-pressed="true"]')?.textContent;

describe('summarizeSelection', () => {
  beforeEach(() => {
    controller = new AbortController();
    valid = true;
    onInvalidated = [];
    fakeBrowser.i18n.getUILanguage = () => 'en-US';
    vi.stubGlobal('CSS', { highlights: new Map() });
    layOutText();
    select();
    vi.clearAllMocks();
    requestBubbleHidden.mockResolvedValue(false);
    requestShape.mockResolvedValue('summary');
    summarize.mockImplementation(pending);
    render(null, container);
  });

  afterEach(() => {
    controller.abort();
    for (const callback of onInvalidated) callback();
  });

  it('paints the card before the worker answers whether the bubble is hidden', async () => {
    const answer = holdAnswer();
    await summarizeSelection(context());
    await settle();
    expect(container.querySelector('section')).not.toBeNull();
    expect(button(HIDE)).toBeDefined();
    expect(startBubble).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ hidden: true }),
    );
    expect(setHidden).not.toHaveBeenCalled();
    answer(true);
    await settle();
    expect(setHidden).toHaveBeenCalledWith(true);
    expect(button(SHOW)).toBeDefined();
    expect(sendMessage).not.toHaveBeenCalledWith({ type: 'save-bubble-hidden', hidden: true });
  });

  it('starts the bubble once the worker answers that it is not hidden', async () => {
    await summarizeSelection(context());
    await settle();
    expect(setHidden).toHaveBeenCalledExactlyOnceWith(false);
    expect(button(HIDE)).toBeDefined();
  });

  it('opens on the saved shape and saves the shape the reader picks', async () => {
    requestShape.mockResolvedValue('key-points');
    await summarizeSelection(context());
    await settle();
    expect(pressed()).toBe('Key points');
    button('Summary')?.click();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'save-shape', shape: 'summary' });
    expect(pressed()).toBe('Summary');
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
    expect(setHidden).toHaveBeenCalledExactlyOnceWith(false);
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
    expect(setHidden).not.toHaveBeenCalledWith(true);
  });

  it('moves the focus into the card and gives it back when the card closes', async () => {
    const field = document.body.appendChild(document.createElement('input'));
    field.focus();
    await summarizeSelection(context());
    await settle();
    expect(document.activeElement).toBe(container.querySelector('[role="dialog"]'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(field);
  });

  it('closes the card on Escape and clears the highlight', async () => {
    await summarizeSelection(context());
    await settle();
    CSS.highlights.set(HIGHLIGHT_NAME, {} as Highlight);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(container.querySelector('section')).toBeNull();
    expect(CSS.highlights.has(HIGHLIGHT_NAME)).toBe(false);
  });

  it("leaves the card open on Escape in the page's own field", async () => {
    await summarizeSelection(context());
    await settle();
    const field = document.body.appendChild(document.createElement('input'));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(container.querySelector('section')).not.toBeNull();
  });

  it('replaces the card on the next gesture, with the shape saved meanwhile', async () => {
    await summarizeSelection(context());
    await settle();
    expect(pressed()).toBe('Summary');
    requestShape.mockResolvedValue('key-points');
    startBubble.mock.calls[0]?.[1].onSummarize();
    await settle();
    expect(container.querySelectorAll('section')).toHaveLength(1);
    expect(pressed()).toBe('Key points');
    // The first card's run stops with it.
    expect(summarize.mock.calls[0]?.[1].signal.aborted).toBe(true);
  });

  it('saves the summary language the reader settles on', async () => {
    await summarizeSelection(context());
    await settle();
    vi.useFakeTimers();
    try {
      const select = container.querySelector('select');
      if (select) select.value = 'tr';
      select?.dispatchEvent(new Event('change', { bubbles: true }));
      vi.advanceTimersByTime(400);
    } finally {
      vi.useRealTimers();
    }
    expect(sendMessage).toHaveBeenCalledWith({ type: 'save-language', choice: 'tr' });
  });

  it('sends the reader to the options page when no key is saved', async () => {
    summarize.mockImplementation(async function* () {
      yield { type: 'error', code: 'no_key' };
    });
    await summarizeSelection(context());
    await settle();
    expect(container.textContent).toContain('Save an API key first.');
    button('Open options')?.click();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'open-options' });
  });

  it('refuses an empty selection with a card that says so', async () => {
    document.getSelection()?.removeAllRanges();
    await summarizeSelection(context());
    await settle();
    expect(container.textContent).toContain('Select some text first.');
    expect(summarize).not.toHaveBeenCalled();
  });

  it('flashes the badge and opens nothing where the page cannot host the card', async () => {
    canHostShadowRoot.mockReturnValueOnce(false);
    await summarizeSelection(context());
    expect(sendMessage).toHaveBeenCalledWith({ type: 'unsupported-page' });
    expect(startBubble).not.toHaveBeenCalled();
    expect(container.querySelector('section')).toBeNull();
  });
});
