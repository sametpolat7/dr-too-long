import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { syncEverySite } from '../src/background/every-site.ts';

type Script = Parameters<typeof fakeBrowser.scripting.registerContentScripts>[0][number];
interface Filter {
  ids?: string[];
}

const scripts = new Map<string, Script>();
let granted = false;
let failNext = false;

describe('syncEverySite', () => {
  beforeEach(() => {
    scripts.clear();
    granted = false;
    failNext = false;
    fakeBrowser.permissions.contains = async () => granted;
    // Chrome's overloads with callbacks do not fit a promise-only fake, hence the assign.
    Object.assign(fakeBrowser.scripting, {
      getRegisteredContentScripts: async (filter?: Filter) =>
        [...scripts.values()].filter((script) => filter?.ids?.includes(script.id) ?? true),
      unregisterContentScripts: async (filter?: Filter) => {
        for (const id of filter?.ids ?? [...scripts.keys()]) scripts.delete(id);
      },
    });
    fakeBrowser.scripting.registerContentScripts = async (added) => {
      if (failNext) {
        failNext = false;
        throw new Error('Registration failed');
      }
      for (const script of added) {
        // Chrome refuses an id it already holds.
        if (scripts.has(script.id)) throw new Error(`Duplicate script ID '${script.id}'`);
        scripts.set(script.id, script);
      }
    };
  });

  it('registers the every-site script on https pages once Chrome grants the opt-in', async () => {
    granted = true;
    await syncEverySite();
    expect([...scripts.values()]).toEqual([
      {
        id: 'every-site',
        matches: ['https://*/*'],
        js: ['/content-scripts/every-site.js'],
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ]);
  });

  it('replaces a registration left by an earlier version', async () => {
    scripts.set('every-site', {
      id: 'every-site',
      matches: ['https://*/*'],
      js: ['/content-scripts/old.js'],
    });
    granted = true;
    await syncEverySite();
    expect(scripts.get('every-site')?.js).toEqual(['/content-scripts/every-site.js']);
    expect(scripts.get('every-site')?.runAt).toBe('document_idle');
  });

  it('registers nothing without the grant, and removes the script once it is withdrawn', async () => {
    await syncEverySite();
    expect(scripts.size).toBe(0);
    granted = true;
    await syncEverySite();
    granted = false;
    await syncEverySite();
    expect(scripts.size).toBe(0);
  });

  it('keeps one registration however often and however close together it runs', async () => {
    granted = true;
    await Promise.all([syncEverySite(), syncEverySite(), syncEverySite()]);
    await syncEverySite();
    expect([...scripts.keys()]).toEqual(['every-site']);
  });

  it('runs again after a failed run', async () => {
    granted = true;
    failNext = true;
    await expect(syncEverySite()).rejects.toThrow('Registration failed');
    await syncEverySite();
    expect([...scripts.keys()]).toEqual(['every-site']);
  });
});
