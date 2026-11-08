import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import { readShape, writeShape } from '../src/settings/shape.ts';

describe('shape setting', () => {
  beforeEach(() => fakeBrowser.reset());

  it('is Summary until a shape is saved', async () => {
    expect(await readShape()).toBe('summary');
  });

  it('round-trips a saved shape', async () => {
    await writeShape('key-points');
    expect(await readShape()).toBe('key-points');
  });

  it('reads a saved shape that the list no longer has as Summary', async () => {
    await storage.setItem('local:shape', 'single-sentence');
    expect(await readShape()).toBe('summary');
  });
});
