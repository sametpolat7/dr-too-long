import { PROVIDERS, type ProviderId } from '@dr-too-long/shared/providers';
import { useEffect, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { Mark } from '../content/card/Mark.tsx';
import { BUBBLE_UI } from '../content/ui.ts';
import { ask, sendMessage } from '../messages.ts';
import { readKeyProvider } from '../settings/api-key.ts';
import { siteHost } from '../site.ts';
import { useEverySite } from '../use-every-site.ts';

interface Probe {
  selected: boolean;
  words: number;
  // A focused embedded frame holds the selection, which the top page can neither read nor count.
  frame: boolean;
  bubble: boolean;
}

interface Page extends Probe {
  tabId: number;
  // An http or https page's hostname: the site the bubble can be turned off on.
  host?: string;
  // The every-site script matches https pages only.
  everySite: boolean;
  // Whether the bubble is off on that site in this tab.
  hidden: boolean;
  // The page did not answer in time, so what it holds is unknown.
  busy: boolean;
}

interface Loaded {
  provider: ProviderId | null;
  // Undefined where Chrome keeps extensions out (its own pages, the Web Store and some others) and
  // when no key is saved.
  page?: Page;
  // Empty when the reader removed the shortcut or another extension holds it.
  shortcut: string;
}

const PROBE_WAIT_MS = 1000;

// Runs in the page, so it uses nothing from outside itself. It tells whether text is selected, how
// many words, and whether the bubble is there, never what the text is.
function probe(bubbleTag: string): Probe {
  const bubble = document.querySelector(bubbleTag) !== null;
  if (document.activeElement?.matches('iframe, frame, object, embed')) {
    return { selected: false, words: 0, frame: true, bubble };
  }
  const text = getSelection()?.toString() ?? '';
  const segments = new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text);
  let words = 0;
  for (const { isWordLike } of segments) if (isWordLike) words += 1;
  return { selected: text.trim() !== '', words, frame: false, bubble };
}

// Undefined when Chrome refuses to run anything on the page.
function probeTab(tabId: number): Promise<Probe | 'busy' | undefined> {
  const injected = browser.scripting
    .executeScript({
      target: { tabId },
      // A page still loading answers at once rather than when it is done.
      injectImmediately: true,
      func: probe,
      args: [BUBBLE_UI],
    })
    .then(
      ([injection]) => injection?.result,
      () => undefined,
    );
  // A page held by an alert() or a long task answers only once it is free.
  const busy = new Promise<'busy'>((resolve) => setTimeout(() => resolve('busy'), PROBE_WAIT_MS));
  return Promise.race([injected, busy]);
}

async function readPage(): Promise<Page | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  const [found, hidden] = await Promise.all([
    probeTab(tab.id),
    ask({ type: 'read-tab-bubble-hidden', tabId: tab.id }).catch(() => false),
  ]);
  if (!found) return;
  const busy = found === 'busy';
  return {
    ...(busy ? { selected: false, words: 0, frame: false, bubble: false } : found),
    tabId: tab.id,
    host: siteHost(tab.url),
    everySite: tab.url?.startsWith('https://') === true,
    hidden,
    busy,
  };
}

async function readShortcut(): Promise<string> {
  const commands = await browser.commands.getAll();
  return commands.find(({ name }) => name === 'summarize')?.shortcut ?? '';
}

function summarize(tabId: number) {
  sendMessage({ type: 'summarize-tab', tabId });
  window.close();
}

function openSettings() {
  void browser.runtime.openOptionsPage();
  window.close();
}

function selectionLine(page: Page | undefined): string {
  if (!page) return 'Chrome doesn’t let extensions run on this page.';
  if (page.busy) return 'This page is busy. Try again in a moment.';
  if (page.frame) return 'Text inside embedded frames can’t be summarized.';
  if (!page.selected) return 'Select a few sentences on the page first.';
  if (page.words === 0) return 'Your selection on this page';
  return `About ${page.words.toLocaleString('en')} ${page.words === 1 ? 'word' : 'words'} selected`;
}

export function Popup() {
  const [loaded, setLoaded] = useState<Loaded>();
  const { granted, failed, toggle } = useEverySite();
  const primary = useRef<HTMLButtonElement>(null);
  const shown = loaded !== undefined && granted !== undefined;

  useEffect(() => {
    void readKeyProvider().then(async (provider) => {
      // With no key the card offers only Set up, so it leaves the page and the tab alone.
      if (!provider) return setLoaded({ provider, shortcut: '' });
      const [page, shortcut] = await Promise.all([readPage(), readShortcut()]);
      setLoaded({ provider, page, shortcut });
    });
  }, []);

  useEffect(() => {
    if (shown) primary.current?.focus();
  }, [shown]);

  // Nothing shows until everything is read, so nothing flashes.
  if (!shown) return null;

  const title = (
    <h1>
      <Mark />
      Dr. Too Long
    </h1>
  );
  const { provider, page, shortcut } = loaded;

  if (!provider) {
    return (
      <main>
        {title}
        <div class="setup">
          <strong>Add your API key to start.</strong>
          <p class="note">
            Dr. Too Long runs on your own OpenAI, Claude or Gemini key. You pay only your provider.
          </p>
        </div>
        <button ref={primary} type="button" class="primary" onClick={openSettings}>
          <span>Set up</span>
          <span aria-hidden="true">→</span>
        </button>
      </main>
    );
  }

  const ready = page?.selected === true;
  const offerSiteSwitch = page?.host !== undefined && (page.bubble || (granted && page.everySite));

  const setHidden = (current: Page, hidden: boolean) => {
    sendMessage({ type: 'save-tab-bubble-hidden', tabId: current.tabId, hidden });
    setLoaded({ ...loaded, page: { ...current, hidden } });
  };

  return (
    <main>
      {title}
      <div class="summarize">
        {/* Off but focusable, so the focus starts here and a screen reader reads why. Its name is
            the first line alone, so the second, its description, is not read twice. */}
        <button
          ref={primary}
          type="button"
          class="go"
          aria-disabled={!ready}
          aria-labelledby="go-title"
          aria-describedby="go-line"
          onClick={() => {
            if (ready) summarize(page.tabId);
          }}
        >
          <Mark size={22} />
          <span class="go-text">
            <span id="go-title" class="go-title">
              Summarize selection
            </span>
            <span id="go-line" class="go-line">
              {selectionLine(page)}
            </span>
          </span>
          {ready && (
            <span class="arrow" aria-hidden="true">
              →
            </span>
          )}
        </button>
        {page && shortcut && (
          <p class="tip">
            Or press <kbd>{shortcut}</kbd> on any page to summarize without opening this card.
          </p>
        )}
      </div>
      <hr />
      <div class="group">
        <label class="option">
          <input
            type="checkbox"
            name="every-site"
            checked={granted}
            // The box follows Chrome's grant, not the click.
            onClick={(event) => {
              event.preventDefault();
              void toggle();
            }}
            aria-describedby={granted ? undefined : 'every-site-note'}
          />
          <span>Show a Summarize button when I select text, on every site</span>
        </label>
        {(!granted || offerSiteSwitch || failed) && (
          <div class="sub">
            {!granted && (
              <p id="every-site-note" class="note">
                Chrome will ask for access to all https sites. Nothing is sent until you click the
                button.
              </p>
            )}
            {failed && (
              <p class="error" role="alert">
                Chrome could not change this access. Try again.
              </p>
            )}
            {offerSiteSwitch && (
              // The button stays the same element as its words change, so it keeps the focus.
              <p class={page.hidden ? 'note' : undefined}>
                {page.hidden && `Off on ${page.host} until this tab closes. `}
                <button type="button" class="link" onClick={() => setHidden(page, !page.hidden)}>
                  {page.hidden ? 'Turn back on' : 'Turn off on this site'}
                </button>
              </p>
            )}
          </div>
        )}
      </div>
      <hr />
      <footer>
        <span>
          <span class="dot" aria-hidden="true" />
          {PROVIDERS[provider].name} key saved
        </span>
        <button type="button" class="link" onClick={openSettings}>
          Settings
        </button>
      </footer>
    </main>
  );
}
