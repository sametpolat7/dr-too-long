import type { SummaryEvent } from '@dr-too-long/shared/contracts';
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from '@dr-too-long/shared/providers';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { Options } from '../src/options/Options.tsx';
import { readApiKey, writeApiKey } from '../src/settings/api-key.ts';

const { summarize } = vi.hoisted(() => ({ summarize: vi.fn() }));
vi.mock('../src/summarize-port.ts', () => ({ portSummarizer: { summarize } }));

const point = { text: 'The keeper logged every ship.', sentences: [1] };
const FREE_TIER = 'With a free-tier key, Google may use that text';

function answer(...events: SummaryEvent[]) {
  summarize.mockImplementation(async function* () {
    yield* events;
  });
}

function button(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((each) => each.textContent === label);
}

const picker = (container: HTMLElement) =>
  container.querySelector<HTMLSelectElement>('select[aria-label="Provider"]');

// A form submits only once it is in the document.
async function show() {
  const container = document.body.appendChild(document.createElement('div'));
  await act(async () => {
    render(<Options />, container);
  });
  await vi.waitFor(() => expect(picker(container)).not.toBeNull());
  return container;
}
const keyField = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[type="password"]');

async function pick(container: HTMLElement, provider: ProviderId) {
  await act(async () => {
    const select = picker(container);
    if (!select) return;
    select.value = provider;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function saveKey(container: HTMLElement, key: string) {
  await act(async () => {
    const input = keyField(container);
    if (!input) return;
    input.value = key;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    button(container, 'Save')?.click();
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
    fakeBrowser.permissions.contains = async () => false;
    fakeBrowser.permissions.onAdded.addListener = () => undefined;
    fakeBrowser.permissions.onAdded.removeListener = () => undefined;
    fakeBrowser.permissions.onRemoved.addListener = () => undefined;
    fakeBrowser.permissions.onRemoved.removeListener = () => undefined;
    summarize.mockReset();
  });

  it('asks for a key from any provider and tests none until one is saved', async () => {
    const container = await show();
    expect(container.textContent).toContain(
      'No API key is saved. Summaries need your own OpenAI, Claude or Gemini API key.',
    );
    expect(picker(container)?.value).toBe('openai');
    expect([...(picker(container)?.options ?? [])].map((option) => option.text)).toEqual([
      'OpenAI',
      'Claude',
      'Gemini',
    ]);
    expect(keyField(container)?.placeholder).toBe('Paste your OpenAI API key');
    expect(button(container, 'Remove key')).toBeUndefined();
    expect(button(container, 'Test key')?.disabled).toBe(true);
  });

  it.each(PROVIDER_IDS)('opens on a saved %s key', async (provider) => {
    const { name } = PROVIDERS[provider];
    await writeApiKey({ provider, key: 'test-key' });
    const container = await show();
    expect(container.textContent).toContain(`The ${name} API key is saved on this device.`);
    expect(picker(container)?.value).toBe(provider);
    expect(keyField(container)?.placeholder).toBe(`Replace the saved ${name} key`);
    expect(keyField(container)?.getAttribute('aria-label')).toBe(`${name} API key`);
    expect(button(container, 'Remove key')).toBeDefined();
  });

  it('leaves the saved key alone when another provider is picked', async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    const container = await show();
    await pick(container, 'anthropic');
    expect(keyField(container)?.placeholder).toBe('Paste your Claude API key');
    expect(keyField(container)?.getAttribute('aria-label')).toBe('Claude API key');
    expect(container.textContent).toContain('The OpenAI API key is saved on this device.');
    expect(button(container, 'Remove key')).toBeDefined();
    expect(await readApiKey()).toEqual({ provider: 'openai', key: 'test-openai-key' });
  });

  it('saves the key for the picked provider in place of the old one', async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    const container = await show();
    await pick(container, 'google');
    await saveKey(container, ' test-gemini-key ');
    await vi.waitFor(() =>
      expect(container.textContent).toContain('The Gemini API key is saved on this device.'),
    );
    expect(await readApiKey()).toEqual({ provider: 'google', key: 'test-gemini-key' });
    expect(keyField(container)?.value).toBe('');
    expect(keyField(container)?.placeholder).toBe('Replace the saved Gemini key');
  });

  it('keeps Save off for a blank key', async () => {
    const container = await show();
    await act(async () => {
      const input = keyField(container);
      if (!input) return;
      input.value = '   ';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(button(container, 'Save')?.disabled).toBe(true);
  });

  it('refuses a key holding an invisible character and saves nothing', async () => {
    const container = await show();
    await saveKey(container, 'sk-test\u200bkey');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'The key holds a character no API key has',
    );
    expect(await readApiKey()).toBeNull();
    expect(keyField(container)?.value).toBe('sk-test\u200bkey');
  });

  it('says so when the key cannot be saved, and keeps it in the field', async () => {
    const container = await show();
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(new Error('Storage is full'));
    await saveKey(container, 'test-openai-key');
    await vi.waitFor(() =>
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(
        'The key could not be saved on this device. Try again.',
      ),
    );
    expect(container.textContent).toContain('No API key is saved.');
    expect(keyField(container)?.value).toBe('test-openai-key');
  });

  it('says so when the key cannot be removed', async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    const container = await show();
    vi.spyOn(fakeBrowser.storage.local, 'remove').mockRejectedValue(new Error('Storage is broken'));
    await act(async () => {
      button(container, 'Remove key')?.click();
    });
    await vi.waitFor(() =>
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(
        'The key could not be removed. Try again.',
      ),
    );
    expect(container.textContent).toContain('The OpenAI API key is saved on this device.');
  });

  it('says so when the summary language cannot be saved', async () => {
    const container = await show();
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(new Error('Storage is full'));
    await act(async () => {
      const select = container.querySelector<HTMLSelectElement>('label.language select');
      if (!select) return;
      select.value = 'tr';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await vi.waitFor(() =>
      expect(container.textContent).toContain('The summary language could not be saved.'),
    );
  });

  it('removes the saved key', async () => {
    await writeApiKey({ provider: 'anthropic', key: 'test-claude-key' });
    const container = await show();
    await act(async () => {
      button(container, 'Remove key')?.click();
    });
    await vi.waitFor(() => expect(container.textContent).toContain('No API key is saved.'));
    expect(await readApiKey()).toBeNull();
    expect(button(container, 'Remove key')).toBeUndefined();
    expect(button(container, 'Test key')?.disabled).toBe(true);
  });

  it('says where a summary goes for the picked provider, with the Gemini free-tier note', async () => {
    const container = await show();
    expect(container.textContent).toContain(
      'A summary sends the text you select to the OpenAI API with this key, under your account.',
    );
    expect(container.textContent).not.toContain(FREE_TIER);
    await pick(container, 'google');
    expect(container.textContent).toContain(
      'A summary sends the text you select to the Gemini API with this key, under your account.' +
        ' With a free-tier key, Google may use that text to improve its products, and people may read it.',
    );
  });

  it('streams the sample summary on Test key and says that the key works', async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    answer({ type: 'partial', points: [point] }, { type: 'done', output: { points: [point] } });
    const container = await show();
    await testKey(container);
    await vi.waitFor(() => expect(container.textContent).toContain('The key works.'));
    expect([...container.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
      point.text,
    ]);
    expect(summarize).toHaveBeenCalledWith(
      { shape: 'summary', outputLanguage: 'en-US', sentences: expect.any(Array) },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('clears the test result when another key is saved', async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    answer({ type: 'done', output: { points: [point] } });
    const container = await show();
    await testKey(container);
    await vi.waitFor(() => expect(container.textContent).toContain('The key works.'));
    await saveKey(container, 'test-other-openai-key');
    await vi.waitFor(() => expect(container.textContent).not.toContain('The key works.'));
    expect(container.querySelector('li')).toBeNull();
  });

  it.each([
    ['saved', (container: HTMLElement) => saveKey(container, 'test-other-openai-key')],
    [
      'removed',
      (container: HTMLElement) =>
        act(async () => {
          button(container, 'Remove key')?.click();
        }),
    ],
  ])('ends a running test when a key is %s', async (_, changeKey) => {
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
    await vi.waitFor(() => expect(container.textContent).toContain('Summarizing…'));
    await changeKey(container);
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
    await act(async () => finish());
    await vi.waitFor(() => expect(drained).toBe(true));
    await act(async () => undefined);
    expect(container.textContent).not.toContain('The key works.');
    expect(container.textContent).not.toContain('Summarizing…');
    expect(container.querySelector('li')).toBeNull();
  });

  it("shows the message of an error and the provider's HTTP status", async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    answer({ type: 'error', code: 'unauthorized', httpStatus: 401 });
    const container = await show();
    await testKey(container);
    await vi.waitFor(() =>
      expect(container.textContent).toContain('The provider rejected the API key.'),
    );
    expect(container.textContent).toContain('HTTP status 401');
    expect(container.querySelector('li')).toBeNull();
  });
});
