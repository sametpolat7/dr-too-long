import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { keepAlive } from '../src/background/keep-alive.ts';

describe('keepAlive', () => {
  const getPlatformInfo = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fakeBrowser.runtime.getPlatformInfo = getPlatformInfo;
  });

  afterEach(() => {
    vi.useRealTimers();
    getPlatformInfo.mockReset();
  });

  it('pings the extension API every 20 seconds until every run is released', () => {
    const releaseFirst = keepAlive();
    const releaseSecond = keepAlive();
    vi.advanceTimersByTime(40_000);
    expect(getPlatformInfo).toHaveBeenCalledTimes(2);

    releaseFirst();
    vi.advanceTimersByTime(20_000);
    expect(getPlatformInfo).toHaveBeenCalledTimes(3);

    releaseSecond();
    vi.advanceTimersByTime(60_000);
    expect(getPlatformInfo).toHaveBeenCalledTimes(3);
  });
});
