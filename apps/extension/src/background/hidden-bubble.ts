import { storage } from 'wxt/utils/storage';

// The sites where the reader hid the bubble, per tab. Session storage lives in memory: nothing
// reaches the disk, and closing the tab, restarting Chrome or reloading the extension forgets them.
const key = (tabId: number) => `session:hiddenBubble:${tabId}` as const;

export interface Sender {
  tab?: { id?: number };
  origin?: string;
}

// The sender's site comes from the origin Chrome reports, so the content script never names one.
function siteOf({ tab, origin }: Sender): { tabId: number; host: string } | undefined {
  if (tab?.id === undefined || origin === undefined) return;
  try {
    const url = new URL(origin);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return { tabId: tab.id, host: url.hostname };
    }
  } catch {
    // An opaque origin, such as a sandboxed frame's, reads as "null".
  }
}

export async function isBubbleHidden(sender: Sender): Promise<boolean> {
  const site = siteOf(sender);
  if (!site) return false;
  const hosts = await storage.getItem<string[]>(key(site.tabId));
  return hosts?.includes(site.host) === true;
}

export async function setBubbleHidden(sender: Sender, hidden: boolean): Promise<void> {
  const site = siteOf(sender);
  if (!site) return;
  const others = ((await storage.getItem<string[]>(key(site.tabId))) ?? []).filter(
    (host) => host !== site.host,
  );
  const hosts = hidden ? [...others, site.host] : others;
  await (hosts.length > 0
    ? storage.setItem(key(site.tabId), hosts)
    : storage.removeItem(key(site.tabId)));
}

export const forgetTab = (tabId: number): Promise<void> => storage.removeItem(key(tabId));
