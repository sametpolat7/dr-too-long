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
const UNPAID_GEMINI = 'With an unpaid Gemini key, Google may use the text you send';

function answer(...events: SummaryEvent[]) {
  summarize.mockImplementation(async function* () {
    yield* events;
  });
}

function button(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((each) => each.textContent === label);
}

const picker = (container: HTMLElement) => container.querySelector<HTMLSelectElement>('#provider');
const keyField = (container: HTMLElement) => container.querySelector<HTMLInputElement>('#api-key');
const agreeBox = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[name="agree"]');
const alertText = (container: HTMLElement) =>
  container.querySelector('[role="alert"]')?.textContent;
const keyStatus = (container: HTMLElement) =>
  container.querySelector('section [role="status"]')?.textContent;

// A form submits only once it is in the document.
async function show() {
  const container = document.body.appendChild(document.createElement('div'));
  await act(async () => {
    render(<Options />, container);
  });
  await vi.waitFor(() => expect(picker(container)).not.toBeNull());
  return container;
}

async function pick(container: HTMLElement, provider: ProviderId) {
  await act(async () => {
    const select = picker(container);
    if (!select) return;
    select.value = provider;
    select.dispatchEvent(new Event('change', { bubbles: true }));
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
  await act(async () => {
    button(container, 'Save key')?.click();
  });
}

async function testKey(container: HTMLElement) {
  await vi.waitFor(() => expect(button(container, 'Test key')?.disabled).toBe(false));
  await act(async () => {
    button(container, 'Test key')?.click();
  });
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
    fakeBrowser.permissions.contains = async () => false;
    fakeBrowser.permissions.onAdded.addListener = () => undefined;
    fakeBrowser.permissions.onAdded.removeListener = () => undefined;
    fakeBrowser.permissions.onRemoved.addListener = () => undefined;
    fakeBrowser.permissions.onRemoved.removeListener = () => undefined;
    summarize.mockReset();
  });

  it('says what the extension does and groups its settings under headings', async () => {
    const container = await show();
    expect(container.querySelector('.intro')?.textContent).toContain(
      'summarizes the text you select, in your language',
    );
    expect([...container.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual([
      'API key',
      'Summaries',
      'Bubble',
    ]);
  });

  it('labels the provider and key fields', async () => {
    const container = await show();
    expect(container.querySelector('label[for="provider"]')?.textContent).toBe('Provider');
    expect(container.querySelector('label[for="api-key"]')?.textContent).toBe('OpenAI API key');
    await pick(container, 'anthropic');
    expect(container.querySelector('label[for="api-key"]')?.textContent).toBe('Claude API key');
  });

  it('asks for a key from any provider and tests none until one is saved', async () => {
    const container = await show();
    expect(keyStatus(container)).toBe(
      'No API key is saved yet. Summaries need your own OpenAI, Claude or Gemini API key.',
    );
    expect(picker(container)?.value).toBe('openai');
    expect([...(picker(container)?.options ?? [])].map((option) => option.text)).toEqual([
      'OpenAI',
      'Claude',
      'Gemini',
    ]);
    expect(button(container, 'Remove OpenAI key')).toBeUndefined();
    expect(button(container, 'Test key')?.disabled).toBe(true);
  });

  it.each(PROVIDER_IDS)('links to where a %s key is made', async (provider) => {
    const container = await show();
    await pick(container, provider);
    const link = [...container.querySelectorAll('a')].find((each) =>
      each.textContent?.startsWith('Get an API key'),
    );
    expect(link?.textContent).toBe(`Get an API key from ${PROVIDERS[provider].name}`);
    expect(link?.href).toBe(PROVIDERS[provider].keysUrl);
  });

  it.each(PROVIDER_IDS)('opens on a saved %s key', async (provider) => {
    const { name } = PROVIDERS[provider];
    await writeApiKey({ provider, key: 'test-key' });
    const container = await show();
    expect(keyStatus(container)).toBe(`Your ${name} API key is saved on this device.`);
    expect(picker(container)?.value).toBe(provider);
    expect(button(container, `Remove ${name} key`)).toBeDefined();
  });

  it('warns that saving for another provider replaces the saved key, and keeps it until then', async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    const container = await show();
    expect(container.textContent).not.toContain('Saving replaces');
    await pick(container, 'anthropic');
    expect(container.textContent).toContain('Saving replaces your saved OpenAI key.');
    expect(keyStatus(container)).toBe('Your OpenAI API key is saved on this device.');
    expect(await readApiKey()).toEqual({ provider: 'openai', key: 'test-openai-key' });
  });

  it('saves only once the reader agrees to where the text goes', async () => {
    const container = await show();
    await type(container, 'test-openai-key');
    expect(button(container, 'Save key')?.disabled).toBe(true);
    expect(agreeBox(container)?.parentElement?.textContent).toContain(
      'each summary sends the text I select, with this key, to OpenAI',
    );
    await agree(container);
    expect(button(container, 'Save key')?.disabled).toBe(false);
  });

  it('saves the key for the picked provider in place of the old one', async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    const container = await show();
    await pick(container, 'google');
    await saveKey(container, ' AIza-test-gemini-key ');
    await vi.waitFor(() =>
      expect(keyStatus(container)).toBe('Your Gemini API key is saved on this device.'),
    );
    expect(await readApiKey()).toEqual({ provider: 'google', key: 'AIza-test-gemini-key' });
    expect(keyField(container)?.value).toBe('');
    expect(agreeBox(container)?.checked).toBe(false);
    expect(document.activeElement).toBe(keyField(container));
  });

  it('keeps Save off for a blank key', async () => {
    const container = await show();
    await type(container, '   ');
    await agree(container);
    expect(button(container, 'Save key')?.disabled).toBe(true);
  });

  it('refuses a key holding an invisible character and saves nothing', async () => {
    const container = await show();
    await saveKey(container, 'sk-test​key');
    expect(alertText(container)).toContain('The key holds a character no API key has');
    expect(await readApiKey()).toBeNull();
    expect(keyField(container)?.value).toBe('sk-test​key');
  });

  it.each([
    ['a Claude key for OpenAI', 'openai', 'sk-ant-api03-test', 'Claude'],
    ['an OpenAI key for Gemini', 'google', 'sk-proj-test', 'OpenAI'],
    ['a Gemini key for Claude', 'anthropic', 'AIza-test', 'Gemini'],
  ] as const)('refuses %s and names the right provider', async (_, provider, key, owner) => {
    const container = await show();
    await pick(container, provider);
    await saveKey(container, key);
    expect(alertText(container)).toContain(`This looks like a ${owner} key.`);
    expect(await readApiKey()).toBeNull();
  });

  it('says so when the key cannot be saved, and keeps it in the field', async () => {
    const container = await show();
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(new Error('Storage is full'));
    await saveKey(container, 'sk-test-openai-key');
    await vi.waitFor(() =>
      expect(alertText(container)).toBe('The key could not be saved on this device. Try again.'),
    );
    expect(keyStatus(container)).toContain('No API key is saved yet.');
    expect(keyField(container)?.value).toBe('sk-test-openai-key');
  });

  it('removes the saved key and moves the focus to the key field', async () => {
    await writeApiKey({ provider: 'anthropic', key: 'test-claude-key' });
    const container = await show();
    await act(async () => {
      button(container, 'Remove Claude key')?.click();
    });
    await vi.waitFor(() => expect(keyStatus(container)).toContain('No API key is saved yet.'));
    expect(await readApiKey()).toBeNull();
    expect(button(container, 'Remove Claude key')).toBeUndefined();
    expect(button(container, 'Test key')?.disabled).toBe(true);
    expect(document.activeElement).toBe(keyField(container));
  });

  it('says so when the key cannot be removed', async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    const container = await show();
    vi.spyOn(fakeBrowser.storage.local, 'remove').mockRejectedValue(new Error('Storage is broken'));
    await act(async () => {
      button(container, 'Remove OpenAI key')?.click();
    });
    await vi.waitFor(() =>
      expect(alertText(container)).toBe('The key could not be removed. Try again.'),
    );
    expect(keyStatus(container)).toBe('Your OpenAI API key is saved on this device.');
  });

  it('says so when the summary language cannot be saved', async () => {
    const container = await show();
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(new Error('Storage is full'));
    await act(async () => {
      const select = container.querySelector<HTMLSelectElement>('select[name="language"]');
      if (!select) return;
      select.value = 'tr';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await vi.waitFor(() =>
      expect(container.textContent).toContain('The summary language could not be saved.'),
    );
  });

  it('notes what Google may do with text sent with an unpaid Gemini key', async () => {
    const container = await show();
    expect(container.textContent).not.toContain(UNPAID_GEMINI);
    await pick(container, 'google');
    expect(container.textContent).toContain(UNPAID_GEMINI);
  });

  it('streams the sample summary on Test key and says that the key works', async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    answer({ type: 'partial', points: [point] }, { type: 'done', output: { points: [point] } });
    const container = await show();
    await testKey(container);
    await vi.waitFor(() => expect(container.textContent).toContain('The key works.'));
    expect(container.querySelector('.sample')?.textContent).toBe(point.text);
    expect(container.querySelector('.sample')?.getAttribute('lang')).toBe('en-US');
    expect(summarize).toHaveBeenCalledWith(
      { shape: 'summary', outputLanguage: 'en-US', sentences: expect.any(Array) },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('keeps one status mounted for the test, so screen readers hear each change', async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    answer({ type: 'done', output: { points: [point] } });
    const container = await show();
    const status = [...container.querySelectorAll('[role="status"]')].at(-1);
    await testKey(container);
    await vi.waitFor(() => expect(status?.textContent).toBe('The key works.'));
    expect(status?.isConnected).toBe(true);
  });

  it('clears the test result when another key is saved', async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    answer({ type: 'done', output: { points: [point] } });
    const container = await show();
    await testKey(container);
    await vi.waitFor(() => expect(container.textContent).toContain('The key works.'));
    await saveKey(container, 'sk-test-other-key');
    await vi.waitFor(() => expect(container.textContent).not.toContain('The key works.'));
    expect(container.querySelector('.sample')).toBeNull();
  });

  it.each([
    ['saved', (container: HTMLElement) => saveKey(container, 'sk-test-other-key')],
    [
      'removed',
      (container: HTMLElement) =>
        act(async () => {
          button(container, 'Remove OpenAI key')?.click();
        }),
    ],
    [
      'canceled',
      (container: HTMLElement) =>
        act(async () => {
          button(container, 'Cancel')?.click();
        }),
    ],
  ])('ends a running test when a key is %s, with no message', async (_, stop) => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
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
    const container = await show();
    await testKey(container);
    await vi.waitFor(() => expect(container.textContent).toContain('Testing the key…'));
    await stop(container);
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
    await act(async () => finish());
    await vi.waitFor(() => expect(drained).toBe(true));
    await act(async () => undefined);
    expect(container.textContent).not.toContain('The key works.');
    expect(container.textContent).not.toContain('Testing the key…');
    expect(container.querySelector('.sample')).toBeNull();
    expect(alertText(container)).toBeUndefined();
  });

  it("shows the message of an error and the provider's HTTP status", async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    answer({ type: 'error', code: 'unauthorized', httpStatus: 401 });
    const container = await show();
    await testKey(container);
    await vi.waitFor(() =>
      expect(alertText(container)).toContain('The provider rejected the API key.'),
    );
    expect(alertText(container)).toContain('HTTP status 401');
    expect(container.querySelector('.sample')).toBeNull();
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
