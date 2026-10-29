import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addMenuItem } from '../src/background/menu.ts';

describe('addMenuItem', () => {
  const items = new Map<number | string | undefined, object>();

  beforeEach(() => {
    items.clear();
    fakeBrowser.contextMenus.removeAll = async () => items.clear();
    fakeBrowser.contextMenus.create = (properties) => {
      // Chrome refuses an id it already holds.
      if (items.has(properties.id)) throw new Error(`Duplicate id ${properties.id}`);
      items.set(properties.id, properties);
      return properties.id ?? 0;
    };
  });

  it('keeps one item for selections however often the install event fires', async () => {
    await addMenuItem();
    await addMenuItem();
    expect([...items.values()]).toEqual([
      { id: 'summarize-selection', title: 'Summarize "%s"', contexts: ['selection'] },
    ]);
  });
});
