import { render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { useEverySite } from '../src/use-every-site.ts';

const EVERY_HTTPS_SITE = { origins: ['https://*/*'] };

let granted: boolean;
let answer: boolean;
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

// What the hook returned on its last render.
let access: ReturnType<typeof useEverySite>;
function Harness() {
  access = useEverySite();
  return null;
}

async function mount() {
  const container = document.createElement('div');
  await act(async () => {
    render(<Harness />, container);
  });
  return container;
}

async function toggle() {
  await act(async () => {
    await access.toggle();
  });
}

describe('useEverySite', () => {
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

  it('gives the access back when it is on', async () => {
    granted = true;
    await mount();
    expect(access.granted).toBe(true);
    await toggle();
    expect(remove).toHaveBeenCalledWith(EVERY_HTTPS_SITE);
    expect(access.granted).toBe(false);
  });

  it('stays off when the reader declines Chrome’s prompt', async () => {
    answer = false;
    await mount();
    await toggle();
    expect(request).toHaveBeenCalledWith(EVERY_HTTPS_SITE);
    expect(access).toMatchObject({ granted: false, failed: false });
  });

  it("follows a grant given or withdrawn on the extension's details page, until unmounted", async () => {
    const container = await mount();
    granted = true;
    await act(async () => {
      for (const listener of added) listener();
    });
    expect(access.granted).toBe(true);
    granted = false;
    await act(async () => {
      for (const listener of removed) listener();
    });
    expect(access.granted).toBe(false);
    act(() => render(null, container));
    expect([added.size, removed.size]).toEqual([0, 0]);
  });
});
