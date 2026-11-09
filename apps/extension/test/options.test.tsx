import type { SummaryEvent } from '@dr-too-long/shared/contracts';
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from '@dr-too-long/shared/providers';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { LINKS } from '../src/links.ts';
import { Options } from '../src/options/Options.tsx';
import { readApiKey, writeApiKey } from '../src/settings/api-key.ts';

const { summarize } = vi.hoisted(() => ({ summarize: vi.fn() }));
vi.mock('../src/summarize-port.ts', () => ({ portSummarizer: { summarize } }));

const point = { text: 'The keeper logged every ship.', sentences: [1] };
const UNPAID_GEMINI =
  'Good to know: with an unpaid Gemini key, Google may use the text you send to improve its products, and people may review it.';

function answer(...events: SummaryEvent[]) {
  summarize.mockImplementation(async function* () {
    yield* events;
  });
}

function button(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((each) => each.textContent === label);
}

const heading = (container: HTMLElement) => container.querySelector('h1')?.textContent;
const providers = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLInputElement>('input[name="provider"]'),
];
const keyField = (container: HTMLElement) => container.querySelector<HTMLInputElement>('#api-key');
const agreeBox = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[name="agree"]');
const savedCard = (container: HTMLElement) => container.querySelector('.saved');
const alertText = (container: HTMLElement) =>
  container.querySelector('[role="alert"]')?.textContent;
const testStatus = (container: HTMLElement) => container.querySelector('[role="status"]');

// A form submits only once it is in the document.
async function show() {
  const container = document.body.appendChild(document.createElement('div'));
  await act(async () => {
    render(<Options />, container);
  });
  await vi.waitFor(() => expect(heading(container)).toBeDefined());
  return container;
}

async function press(container: HTMLElement, label: string) {
  await act(async () => {
    button(container, label)?.click();
  });
}

async function pick(container: HTMLElement, provider: ProviderId) {
  await act(async () => {
    providers(container)
      .find((radio) => radio.value === provider)
      ?.click();
  });
}

async function type(container: HTMLElement, key: string) {
  await act(async () => {
    const input = keyField(container);
    if (!input) return;
    input.value = key;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function agree(container: HTMLElement) {
  await act(async () => {
    agreeBox(container)?.click();
  });
}

async function saveKey(container: HTMLElement, key: string) {
  await type(container, key);
  await agree(container);
  await press(container, 'Save key');
}

async function showSavedKey(provider: ProviderId = 'openai') {
  await writeApiKey({ provider, key: 'test-key' });
  return show();
}

describe('Options', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    fakeBrowser.reset();
    fakeBrowser.i18n.getUILanguage = () => 'en-US';
    fakeBrowser.runtime.getManifest = () => ({
      manifest_version: 3,
      name: 'Dr. Too Long',
      version: '1.2.3',
    });
    summarize.mockReset();
  });

  it('asks for a key with a reassuring lead when none is saved, and holds nothing else', async () => {
    const container = await show();
    expect(heading(container)).toBe('Add your API key');
    expect(container.querySelector('.lead')?.textContent).toBe(
      'Dr. Too Long runs on your own API key, so you stay in control. The key is encrypted on this device and is only ever sent to the provider you choose.',
    );
    expect(savedCard(container)).toBeNull();
    expect(button(container, 'Test key')).toBeUndefined();
    expect(button(container, 'Cancel')).toBeUndefined();
    // The summary language and the Summarize button switch live in the window and the icon card.
    expect(container.querySelector('[role="combobox"]')).toBeNull();
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
  });

  it('offers the three providers as one labeled choice', async () => {
    const container = await show();
    const group = container.querySelector('[role="radiogroup"]');
    const label = group?.getAttribute('aria-labelledby');
    expect(label && container.querySelector(`#${label}`)?.textContent).toBe('Provider');
    expect(providers(container).map((radio) => radio.parentElement?.textContent)).toEqual([
      'OpenAI',
      'Claude',
      'Gemini',
    ]);
    expect(providers(container).find((radio) => radio.checked)?.value).toBe('openai');
  });

  it('names the key field after the picked provider', async () => {
    const container = await show();
    expect(container.querySelector('label[for="api-key"]')?.textContent).toBe('OpenAI API key');
    expect(keyField(container)?.placeholder).toBe('Paste your key here');
    await pick(container, 'anthropic');
    expect(providers(container).find((radio) => radio.checked)?.value).toBe('anthropic');
    expect(container.querySelector('label[for="api-key"]')?.textContent).toBe('Claude API key');
  });

  it.each([
    ['openai', 'Get an OpenAI API key'],
    ['anthropic', 'Get a Claude API key'],
    ['google', 'Get a Gemini API key'],
  ] as const)('links to where a %s key is made', async (provider, text) => {
    const container = await show();
    await pick(container, provider);
    const note = keyField(container)?.nextElementSibling;
    expect(note?.textContent).toMatch(
      new RegExp(
        `^No key yet\\? ${text}\\. A key made just for Dr\\. Too Long, with a monthly spending limit, keeps your costs predictable\\.`,
      ),
    );
    expect(note?.querySelector('a')?.href).toBe(PROVIDERS[provider].keysUrl);
  });

  it('notes what Google may do with text sent with an unpaid Gemini key', async () => {
    const container = await show();
    expect(container.textContent).not.toContain(UNPAID_GEMINI);
    await pick(container, 'google');
    expect(container.textContent).toContain(UNPAID_GEMINI);
  });

  it('saves only once the reader agrees to where the text goes', async () => {
    const container = await show();
    await type(container, 'test-openai-key');
    expect(button(container, 'Save key')?.disabled).toBe(true);
    expect(agreeBox(container)?.parentElement?.textContent).toBe(
      'I understand that each summary sends the text I select, with this key, to OpenAI. Nothing else from the page leaves my browser, as the privacy policy explains.',
    );
    expect(agreeBox(container)?.parentElement?.querySelector('a')?.href).toBe(LINKS.privacy);
    await agree(container);
    expect(button(container, 'Save key')?.disabled).toBe(false);
  });

  it('keeps Save off for a blank key', async () => {
    const container = await show();
    await type(container, '   ');
    await agree(container);
    expect(button(container, 'Save key')?.disabled).toBe(true);
  });

  it('saves the key, shows it saved and moves the focus to Test key', async () => {
    const container = await show();
    await pick(container, 'google');
    await saveKey(container, ' AIza-test-gemini-key ');
    await vi.waitFor(() => expect(heading(container)).toBe('Your API key'));
    expect(await readApiKey()).toEqual({ provider: 'google', key: 'AIza-test-gemini-key' });
    expect(keyField(container)).toBeNull();
    expect(document.activeElement).toBe(button(container, 'Test key'));
    expect(document.activeElement?.getAttribute('aria-describedby')).toBe(
      savedCard(container)?.querySelector('strong')?.id,
    );
  });

  it.each(PROVIDER_IDS)('opens on a saved %s key', async (provider) => {
    const { name } = PROVIDERS[provider];
    const container = await showSavedKey(provider);
    expect(heading(container)).toBe('Your API key');
    expect(savedCard(container)?.textContent).toBe(
      `Your ${name} key is saved.It’s encrypted on this device and goes only to ${name}, and only when you ask for a summary.`,
    );
    expect(keyField(container)).toBeNull();
    for (const label of ['Test key', 'Replace key', 'Remove key']) {
      expect(button(container, label)).toBeDefined();
    }
  });

  it('replaces the key from a form that starts on the saved provider', async () => {
    const container = await showSavedKey('openai');
    await press(container, 'Replace key');
    expect(heading(container)).toBe('Replace your API key');
    expect(providers(container).find((radio) => radio.checked)?.value).toBe('openai');
    expect(document.activeElement).toBe(keyField(container));
    await pick(container, 'anthropic');
    await saveKey(container, 'sk-ant-api03-test');
    await vi.waitFor(() => expect(heading(container)).toBe('Your API key'));
    expect(savedCard(container)?.textContent).toContain('Your Claude key is saved.');
    expect(await readApiKey()).toEqual({ provider: 'anthropic', key: 'sk-ant-api03-test' });
  });

  it('warns that saving for another provider replaces the saved key, and keeps it until then', async () => {
    const container = await showSavedKey('openai');
    await press(container, 'Replace key');
    expect(container.textContent).not.toContain('Saving replaces');
    await pick(container, 'anthropic');
    expect(container.textContent).toContain('Saving replaces your saved OpenAI key.');
    expect(await readApiKey()).toEqual({ provider: 'openai', key: 'test-key' });
  });

  it('goes back to the saved key on Cancel and moves the focus to Replace key', async () => {
    const container = await showSavedKey('openai');
    await press(container, 'Replace key');
    await type(container, 'sk-test-other-key');
    await press(container, 'Cancel');
    expect(heading(container)).toBe('Your API key');
    expect(document.activeElement).toBe(button(container, 'Replace key'));
    expect(await readApiKey()).toEqual({ provider: 'openai', key: 'test-key' });
  });

  it('refuses a key holding an invisible character and saves nothing', async () => {
    const container = await show();
    await saveKey(container, 'sk-test​key');
    expect(alertText(container)).toContain('The key holds a character no API key has');
    expect(await readApiKey()).toBeNull();
    expect(keyField(container)?.value).toBe('sk-test​key');
  });

  it.each([
    ['a Claude key for OpenAI', 'openai', 'sk-ant-api03-test', 'a Claude'],
    ['an OpenAI key for Gemini', 'google', 'sk-proj-test', 'an OpenAI'],
    ['a Gemini key for Claude', 'anthropic', 'AIza-test', 'a Gemini'],
  ] as const)('refuses %s and names the right provider', async (_, provider, key, owner) => {
    const container = await show();
    await pick(container, provider);
    await saveKey(container, key);
    expect(alertText(container)).toContain(`This looks like ${owner} key.`);
    expect(await readApiKey()).toBeNull();
  });

  it('asks for the agreement again and clears a refusal when the provider changes', async () => {
    const container = await show();
    await pick(container, 'google');
    await saveKey(container, 'sk-proj-test');
    expect(alertText(container)).toContain('This looks like an OpenAI key.');
    await pick(container, 'openai');
    expect(alertText(container)).toBeUndefined();
    expect(agreeBox(container)?.checked).toBe(false);
    expect(button(container, 'Save key')?.disabled).toBe(true);
  });

  it('says so when the key cannot be saved, and keeps it in the field', async () => {
    const container = await show();
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(new Error('Storage is full'));
    await saveKey(container, 'sk-test-openai-key');
    await vi.waitFor(() =>
      expect(alertText(container)).toBe('The key could not be saved on this device. Try again.'),
    );
    expect(heading(container)).toBe('Add your API key');
    expect(keyField(container)?.value).toBe('sk-test-openai-key');
  });

  it('removes the saved key and moves the focus to the key field', async () => {
    const container = await showSavedKey('anthropic');
    await press(container, 'Remove key');
    await vi.waitFor(() => expect(heading(container)).toBe('Add your API key'));
    expect(await readApiKey()).toBeNull();
    expect(savedCard(container)).toBeNull();
    expect(document.activeElement).toBe(keyField(container));
  });

  it('says so when the key cannot be removed', async () => {
    const container = await showSavedKey('openai');
    vi.spyOn(fakeBrowser.storage.local, 'remove').mockRejectedValue(new Error('Storage is broken'));
    await press(container, 'Remove key');
    await vi.waitFor(() =>
      expect(alertText(container)).toBe('The key could not be removed. Try again.'),
    );
    expect(savedCard(container)?.textContent).toContain('Your OpenAI key is saved.');
  });

  it('streams the sample summary on Test key and says that the key works', async () => {
    answer({ type: 'partial', points: [point] }, { type: 'done', output: { points: [point] } });
    const container = await showSavedKey();
    await press(container, 'Test key');
    await vi.waitFor(() =>
      expect(testStatus(container)?.textContent).toBe('All set: your key works.'),
    );
    expect(testStatus(container)?.classList.contains('good')).toBe(true);
    expect(container.querySelector('.sample')?.textContent).toBe(point.text);
    expect(container.querySelector('.sample')?.getAttribute('lang')).toBe('en-US');
    expect(summarize).toHaveBeenCalledWith(
      { shape: 'summary', outputLanguage: 'en-US', sentences: expect.any(Array) },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('keeps one status mounted for the test, so screen readers hear each change', async () => {
    answer({ type: 'done', output: { points: [point] } });
    const container = await showSavedKey();
    const status = testStatus(container);
    expect(status?.textContent).toBe('');
    await press(container, 'Test key');
    await vi.waitFor(() => expect(status?.textContent).toBe('All set: your key works.'));
    expect(status?.isConnected).toBe(true);
  });

  it.each([
    ['canceled', 'Cancel'],
    ['the key is replaced', 'Replace key'],
    ['the key is removed', 'Remove key'],
  ])('ends a running test when %s, with no message', async (_, label) => {
    let finish: () => void = () => undefined;
    let signal: AbortSignal | undefined;
    let drained = false;
    summarize.mockImplementation(async function* (_request, options: { signal: AbortSignal }) {
      signal = options.signal;
      yield { type: 'partial', points: [point] };
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      try {
        yield { type: 'done', output: { points: [point] } };
      } finally {
        drained = true;
      }
    });
    const container = await showSavedKey();
    await press(container, 'Test key');
    await vi.waitFor(() => expect(testStatus(container)?.textContent).toBe('Checking your key…'));
    expect(button(container, 'Cancel')?.id).toBe('test-key');
    await press(container, label);
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
    await act(async () => finish());
    await vi.waitFor(() => expect(drained).toBe(true));
    await act(async () => undefined);
    expect(container.textContent).not.toContain('All set');
    expect(container.textContent).not.toContain('Checking your key…');
    expect(container.querySelector('.sample')).toBeNull();
    expect(alertText(container)).toBeUndefined();
  });

  it('keeps the focus on Test key as it turns into Cancel and back', async () => {
    let finish: () => void = () => undefined;
    summarize.mockImplementation(async function* () {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      yield { type: 'done', output: { points: [point] } };
    });
    const container = await showSavedKey();
    const testKey = button(container, 'Test key');
    testKey?.focus();
    await press(container, 'Test key');
    await vi.waitFor(() => expect(testKey?.textContent).toBe('Cancel'));
    expect(testKey?.disabled).toBe(false);
    await press(container, 'Cancel');
    expect(testKey?.textContent).toBe('Test key');
    expect(document.activeElement).toBe(testKey);
    await press(container, 'Test key');
    await vi.waitFor(() => expect(testKey?.textContent).toBe('Cancel'));
    await act(async () => finish());
    await vi.waitFor(() => expect(testKey?.textContent).toBe('Test key'));
    expect(testStatus(container)?.textContent).toBe('All set: your key works.');
    expect(document.activeElement).toBe(testKey);
  });

  it("shows the message of an error and the provider's HTTP status", async () => {
    answer({ type: 'error', code: 'unauthorized', httpStatus: 401 });
    const container = await showSavedKey();
    await press(container, 'Test key');
    await vi.waitFor(() =>
      expect(alertText(container)).toContain('The provider rejected the API key.'),
    );
    expect(alertText(container)).toContain('HTTP status 401');
    expect(container.querySelector('.sample')).toBeNull();
    expect(container.textContent).not.toContain('All set');
  });

  it('shows the version and links to the privacy policy, the source and the issue forms', async () => {
    const container = await show();
    const footer = container.querySelector('footer');
    expect(footer?.textContent).toContain('Version 1.2.3');
    expect(
      [...(footer?.querySelectorAll('a') ?? [])].map((link) => [link.textContent, link.href]),
    ).toEqual([
      ['Privacy policy', LINKS.privacy],
      ['Source code', LINKS.repository],
      ['Report a problem', LINKS.issues],
    ]);
  });
});
