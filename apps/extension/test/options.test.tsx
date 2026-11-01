import type { SummaryEvent } from '@dr-too-long/shared/contracts';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { Options } from '../src/options/Options.tsx';
import { writeApiKey } from '../src/settings/api-key.ts';

const { summarize } = vi.hoisted(() => ({ summarize: vi.fn() }));
vi.mock('../src/summarize-port.ts', () => ({ portSummarizer: { summarize } }));

const point = { text: 'The keeper logged every ship.', sentences: [1] };

function answer(...events: SummaryEvent[]) {
  summarize.mockImplementation(async function* () {
    yield* events;
  });
}

async function show() {
  const container = document.createElement('div');
  await act(async () => {
    render(<Options />, container);
  });
  return container;
}

function button(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((each) => each.textContent === label);
}

async function testKey(container: HTMLElement) {
  await vi.waitFor(() => expect(button(container, 'Test key')?.disabled).toBe(false));
  await act(async () => {
    button(container, 'Test key')?.click();
  });
}

describe('Options', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    fakeBrowser.i18n.getUILanguage = () => 'en-US';
    fakeBrowser.permissions.contains = async () => false;
    fakeBrowser.permissions.onAdded.addListener = () => undefined;
    fakeBrowser.permissions.onAdded.removeListener = () => undefined;
    fakeBrowser.permissions.onRemoved.addListener = () => undefined;
    fakeBrowser.permissions.onRemoved.removeListener = () => undefined;
    summarize.mockReset();
  });

  it('asks for a key and tests none until one is saved', async () => {
    const container = await show();
    expect(container.textContent).toContain('No API key is saved.');
    expect(button(container, 'Test key')?.disabled).toBe(true);
  });

  it('streams the sample summary on Test key and says that the key works', async () => {
    await writeApiKey('secret-key');
    answer(
      { type: 'partial', points: [point] },
      {
        type: 'done',
        output: { points: [point] },
        dropped: 1,
        usage: { inputTokens: 120, outputTokens: 40 },
        latencyMs: 850,
      },
    );
    const container = await show();
    await testKey(container);
    await vi.waitFor(() => expect(container.textContent).toContain('The key works.'));
    expect([...container.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
      point.text,
    ]);
    expect(container.textContent).not.toMatch(/gpt|850|120|dropped/);
    expect(summarize).toHaveBeenCalledWith(
      { v: 2, preset: 'summary', outputLanguage: 'en-US', sentences: expect.any(Array) },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('shows the message of an error', async () => {
    await writeApiKey('secret-key');
    answer({ type: 'error', code: 'unauthorized', message: 'HTTP 401' });
    const container = await show();
    await testKey(container);
    await vi.waitFor(() =>
      expect(container.textContent).toContain('The provider rejected the API key.'),
    );
    expect(container.querySelector('li')).toBeNull();
  });
});
