import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { summarizeSelection } from '../src/content/summarize.tsx';
import { HIGHLIGHT_NAME } from '../src/highlight.ts';
import { layOutText, pageshow, settle } from './helpers.ts';

const {
  host,
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
  // The card's closed shadow root, replaced by a container in an open host the test can reach.
  const host = document.createElement('dr-too-long-card');
  return {
    host,
    container: host.appendChild(document.createElement('div')),
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
    document.body.append(host);
    return {
      shadowHost: host,
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
const invalidate = () => {
  for (const callback of onInvalidated.splice(0)) callback();
};

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

const pressed = () => container.querySelector('[aria-pressed="true"]')?.textContent;
const card = () => container.querySelector('section');
// The worker's message when the popup turns the bubble off or on for the tab's site.
const tell = (hidden: boolean) =>
  fakeBrowser.runtime.onMessage.trigger({ type: 'bubble-hidden', hidden }, {}, () => undefined);
// A click the reader makes, which Chrome marks as trusted; happy-dom has no isTrusted.
function readerClicks(target: Element | null | undefined) {
  const event = new MouseEvent('click', { bubbles: true, composed: true });
  Object.defineProperty(event, 'isTrusted', { value: true });
  act(() => {
    target?.dispatchEvent(event);
  });
}

const press = (target: EventTarget, key: string) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });

function languageField() {
  const field = container.querySelector<HTMLInputElement>('input[role="combobox"]');
  if (!field) throw new Error('No language field');
  return field;
}

function choose(query: string) {
  const field = languageField();
  act(() => field.focus());
  act(() => {
    field.value = query;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  press(field, 'Enter');
}

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
    invalidate();
  });

  it('paints the card before the worker answers whether the bubble is hidden', async () => {
    const answer = holdAnswer();
    await summarizeSelection(context());
    await settle();
    expect(card()).not.toBeNull();
    expect(startBubble).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ hidden: true }),
    );
    expect(setHidden).not.toHaveBeenCalled();
    answer(true);
    await settle();
    expect(setHidden).toHaveBeenCalledWith(true);
  });

  it('starts the bubble once the worker answers that it is not hidden', async () => {
    await summarizeSelection(context());
    await settle();
    expect(setHidden).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('turns the bubble off and on as the popup tells it, until the script is invalidated', async () => {
    await summarizeSelection(context());
    await settle();
    await tell(true);
    expect(setHidden).toHaveBeenLastCalledWith(true);
    await tell(false);
    expect(setHidden).toHaveBeenLastCalledWith(false);
    expect(setHidden).toHaveBeenCalledTimes(3);
    invalidate();
    expect(fakeBrowser.runtime.onMessage.hasListeners()).toBe(false);
  });

  it('leaves the bubble as it is when the popup tells it what it already does', async () => {
    await summarizeSelection(context());
    await settle();
    await tell(false);
    expect(setHidden).toHaveBeenCalledExactlyOnceWith(false);
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
  });

  it('draws no card the reader closed when the page comes back', async () => {
    await summarizeSelection(context());
    await settle();
    container.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click();
    expect(card()).toBeNull();
    requestBubbleHidden.mockResolvedValue(true);
    window.dispatchEvent(pageshow(true));
    await settle();
    expect(setHidden).toHaveBeenCalledWith(true);
    expect(card()).toBeNull();
  });

  it('asks nothing when the page comes back after an extension reload orphaned the script', async () => {
    await summarizeSelection(context());
    await settle();
    valid = false;
    window.dispatchEvent(pageshow(true));
    await settle();
    expect(requestBubbleHidden).toHaveBeenCalledTimes(1);
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
    press(document, 'Escape');
    expect(document.activeElement).toBe(field);
  });

  it('closes the card on Escape and clears the highlight', async () => {
    await summarizeSelection(context());
    await settle();
    CSS.highlights.set(HIGHLIGHT_NAME, {} as Highlight);
    press(document, 'Escape');
    expect(card()).toBeNull();
    expect(CSS.highlights.has(HIGHLIGHT_NAME)).toBe(false);
  });

  it("leaves the card open on Escape in the page's own field", async () => {
    await summarizeSelection(context());
    await settle();
    press(document.body.appendChild(document.createElement('input')), 'Escape');
    expect(card()).not.toBeNull();
  });

  // Chrome retargets an event from inside the closed shadow root to the host.
  it('leaves an Escape from inside the card to the card', async () => {
    await summarizeSelection(context());
    await settle();
    press(host, 'Escape');
    expect(card()).not.toBeNull();
  });

  it('keeps the card open on the Escape that closes its language list, and closes on the next', async () => {
    await summarizeSelection(context());
    await settle();
    const field = languageField();
    act(() => field.focus());
    press(field, 'Escape');
    expect(card()).not.toBeNull();
    press(field, 'Escape');
    expect(card()).toBeNull();
  });

  it('closes the card on a click on the page that leaves no text selected', async () => {
    await summarizeSelection(context());
    await settle();
    document.getSelection()?.removeAllRanges();
    readerClicks(document.body.querySelector('p'));
    expect(card()).toBeNull();
  });

  it('keeps the card open after a click that ends selecting text on the page', async () => {
    await summarizeSelection(context());
    await settle();
    readerClicks(document.body.querySelector('p'));
    expect(card()).not.toBeNull();
  });

  it("keeps the card open on a click the page's own script sends", async () => {
    await summarizeSelection(context());
    await settle();
    document.getSelection()?.removeAllRanges();
    act(() => document.body.querySelector('p')?.click());
    expect(card()).not.toBeNull();
  });

  it('keeps the card open on clicks inside it', async () => {
    await summarizeSelection(context());
    await settle();
    document.getSelection()?.removeAllRanges();
    readerClicks(card()?.querySelector('header'));
    act(() => button('Key points')?.click());
    expect(card()).not.toBeNull();
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

  it('opens each new card at the top right, wherever the last one was dragged', async () => {
    await summarizeSelection(context());
    await settle();
    const header = container.querySelector('header');
    const pointer = (type: string, x: number) =>
      act(() => {
        header?.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: x }));
      });
    pointer('pointerdown', 0);
    pointer('pointermove', 100);
    expect(card()?.style.left).toBe('100px');
    startBubble.mock.calls[0]?.[1].onSummarize();
    await settle();
    expect(card()?.style.left).toBe('');
  });

  it('runs and saves the summary language the reader chooses, at once', async () => {
    await summarizeSelection(context());
    await settle();
    choose('tur');
    expect(sendMessage).toHaveBeenCalledWith({ type: 'save-language', choice: 'tr' });
    expect(summarize.mock.calls.at(-1)?.[0]).toMatchObject({ outputLanguage: 'tr' });
    expect(languageField().value).toBe('Turkish — Türkçe');
  });

  it('shows the language chosen even when the summary is already in it', async () => {
    fakeBrowser.i18n.getUILanguage = () => 'tr';
    await summarizeSelection(context());
    await settle();
    expect(languageField().value).toBe('Auto (Turkish)');
    choose('türkçe');
    expect(summarize).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'save-language', choice: 'tr' });
    expect(languageField().value).toBe('Turkish — Türkçe');
  });

  it('sends the reader to the settings page when no key is saved', async () => {
    summarize.mockImplementation(async function* () {
      yield { type: 'error', code: 'no_key' };
    });
    await summarizeSelection(context());
    await settle();
    expect(container.textContent).toContain('Save an API key first.');
    button('Open settings')?.click();
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
    expect(card()).toBeNull();
  });
});
