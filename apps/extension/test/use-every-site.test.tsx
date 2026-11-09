import { render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { useEverySite } from '../src/use-every-site.ts';
import { fakeEvent } from './helpers.ts';

const EVERY_HTTPS_SITE = { origins: ['https://*/*'] };

let granted: boolean;
let answer: boolean;
let onAdded: ReturnType<typeof fakeEvent>;
let onRemoved: ReturnType<typeof fakeEvent>;
const request = vi.fn(async () => {
  if (answer) granted = true;
  return answer;
});
const remove = vi.fn(async () => {
  granted = false;
  return true;
});

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
    onAdded = fakeEvent();
    onRemoved = fakeEvent();
    request.mockClear();
    remove.mockClear();
    Object.assign(fakeBrowser.permissions, {
      contains: async () => granted,
      request,
      remove,
      onAdded,
      onRemoved,
    });
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
    await act(async () => onAdded.fire());
    expect(access.granted).toBe(true);
    granted = false;
    await act(async () => onRemoved.fire());
    expect(access.granted).toBe(false);
    act(() => render(null, container));
    expect([onAdded.hasListeners(), onRemoved.hasListeners()]).toEqual([false, false]);
  });
});
