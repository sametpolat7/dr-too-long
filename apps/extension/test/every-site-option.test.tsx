import { render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { EverySite } from '../src/options/EverySite.tsx';

let granted = false;
let answer = true;
const added = new Set<() => void>();
const removed = new Set<() => void>();
const request = vi.fn(async () => {
  if (answer) granted = true;
  return answer;
});
const remove = vi.fn(async () => {
  granted = false;
  return true;
});

async function show() {
  const container = document.createElement('div');
  await act(async () => {
    render(<EverySite />, container);
  });
  const box = () => container.querySelector('input');
  return { container, box };
}

async function click(input: HTMLInputElement | null) {
  await act(async () => {
    input?.click();
  });
}

describe('EverySite', () => {
  beforeEach(() => {
    granted = false;
    answer = true;
    added.clear();
    removed.clear();
    request.mockClear();
    remove.mockClear();
    fakeBrowser.permissions.contains = async () => granted;
    fakeBrowser.permissions.request = request;
    fakeBrowser.permissions.remove = remove;
    for (const [event, listeners] of [
      [fakeBrowser.permissions.onAdded, added],
      [fakeBrowser.permissions.onRemoved, removed],
    ] as const) {
      event.addListener = (listener) => listeners.add(listener as () => void);
      event.removeListener = (listener) => listeners.delete(listener as () => void);
    }
  });

  it("shows Chrome's grant and asks Chrome for every https site on a click", async () => {
    const { box } = await show();
    expect(box()?.checked).toBe(false);
    await click(box());
    expect(request).toHaveBeenCalledWith({ origins: ['https://*/*'] });
    expect(box()?.checked).toBe(true);
  });

  it('stays off when the reader declines Chrome’s prompt', async () => {
    answer = false;
    const { box } = await show();
    await click(box());
    expect(box()?.checked).toBe(false);
  });

  it('gives the access back on a click when it is on', async () => {
    granted = true;
    const { box } = await show();
    expect(box()?.checked).toBe(true);
    await click(box());
    expect(remove).toHaveBeenCalledWith({ origins: ['https://*/*'] });
    expect(box()?.checked).toBe(false);
  });

  it('says so when Chrome fails to change the access', async () => {
    request.mockRejectedValueOnce(new Error('Chrome refused'));
    const { container, box } = await show();
    await click(box());
    expect(box()?.checked).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Chrome could not change this access. Try again.',
    );
  });

  it("follows a grant given or withdrawn on the extension's details page, until it closes", async () => {
    const { container, box } = await show();
    granted = true;
    await act(async () => {
      for (const listener of added) listener();
    });
    expect(box()?.checked).toBe(true);
    granted = false;
    await act(async () => {
      for (const listener of removed) listener();
    });
    expect(box()?.checked).toBe(false);
    act(() => render(null, container));
    expect([added.size, removed.size]).toEqual([0, 0]);
  });
});
