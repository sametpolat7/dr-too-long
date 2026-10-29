import { browser } from 'wxt/browser';
import { EVERY_SITE } from '../every-site.ts';
import { summarizeTab } from './action.ts';
import { isBubbleHidden, type Sender } from './hidden-bubble.ts';

const SCRIPT_ID = 'every-site';
// WXT emits the runtime-registered content script under this path.
const EVERY_SITE_SCRIPT = '/content-scripts/every-site.js';

let syncing = Promise.resolve();

// Registers the every-site script while Chrome grants the opt-in and removes it otherwise. Calls
// run one after another, because registering an id that exists fails.
export function syncEverySite(): Promise<void> {
  syncing = syncing.then(sync, sync);
  return syncing;
}

// The registration is made anew each time, as an update may have moved the script's file.
async function sync(): Promise<void> {
  const granted = await browser.permissions.contains(EVERY_SITE);
  const registered = await browser.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (registered.length > 0) await browser.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  if (!granted) return;
  await browser.scripting.registerContentScripts([
    {
      id: SCRIPT_ID,
      matches: EVERY_SITE.origins,
      js: [EVERY_SITE_SCRIPT],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    },
  ]);
}

// A page keeps the every-site script it was loaded with after the opt-in is withdrawn, so the
// script asks before it shows the bubble: while the opt-in stands, unless the reader hid the bubble
// on the sender's site in its tab.
export async function everySiteBubbleShown(sender: Sender): Promise<boolean> {
  return (await browser.permissions.contains(EVERY_SITE)) && !(await isBubbleHidden(sender));
}

// Runs the summarize script for a click on the every-site bubble, as the icon does. Without the
// opt-in Chrome keeps the worker out of the page, so it answers false and the script stops.
export async function summarizeFromBubble({ tab }: Sender): Promise<boolean> {
  if (tab?.id === undefined || !(await browser.permissions.contains(EVERY_SITE))) return false;
  await summarizeTab(tab.id);
  return true;
}
