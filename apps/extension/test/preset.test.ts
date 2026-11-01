import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import { readPreset, writePreset } from '../src/settings/preset.ts';

describe('preset setting', () => {
  beforeEach(() => fakeBrowser.reset());

  it('is Summary until a shape is saved', async () => {
    expect(await readPreset()).toBe('summary');
  });

  it('round-trips a saved shape', async () => {
    await writePreset('key-points');
    expect(await readPreset()).toBe('key-points');
  });

  it('reads a saved shape that the presets no longer have as Summary', async () => {
    await storage.setItem('local:preset', 'single-sentence');
    expect(await readPreset()).toBe('summary');
  });
});
