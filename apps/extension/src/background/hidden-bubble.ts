import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import type { TabMessage } from '../messages.ts';
import { siteHost } from '../site.ts';

// The sites where the reader turned the bubble off, per tab. Session storage lives in memory: nothing
// reaches the disk, and closing the tab, restarting Chrome or reloading the extension forgets them.
const key = (tabId: number) => `session:hiddenBubble:${tabId}` as const;

export interface Sender {
  tab?: { id?: number };
  origin?: string;
  url?: string;
}

interface Site {
  tabId: number;
  host: string;
}

function siteOf(tabId: number | undefined, address: string | undefined): Site | undefined {
  const host = siteHost(address);
  return tabId !== undefined && host ? { tabId, host } : undefined;
}

// The popup names its tab, whose address Chrome shows the worker while the popup's activeTab grant
// lasts.
async function tabSite(tabId: number): Promise<Site | undefined> {
  const { url } = await browser.tabs.get(tabId);
  return siteOf(tabId, url);
}

async function isHidden(site: Site | undefined): Promise<boolean> {
  if (!site) return false;
  const hosts = await storage.getItem<string[]>(key(site.tabId));
  return hosts?.includes(site.host) === true;
}

// A content script's site comes from the address Chrome reports for its page, so the script never
// names one. Both scripts run in the top frame only, so it is the tab's address, as the popup sees it,
// even on a sandboxed page whose origin is opaque.
export const isBubbleHidden = ({ tab, url }: Sender): Promise<boolean> =>
  isHidden(siteOf(tab?.id, url));

export async function isTabBubbleHidden(tabId: number): Promise<boolean> {
  return isHidden(await tabSite(tabId));
}

export async function setTabBubbleHidden(tabId: number, hidden: boolean): Promise<void> {
  const site = await tabSite(tabId);
  if (!site) return;
  const others = ((await storage.getItem<string[]>(key(tabId))) ?? []).filter(
    (host) => host !== site.host,
  );
  const hosts = hidden ? [...others, site.host] : others;
  await (hosts.length > 0 ? storage.setItem(key(tabId), hosts) : storage.removeItem(key(tabId)));
  // The tab's scripts hide or show the bubble at once. A tab that runs neither has no receiver.
  const message: TabMessage = { type: 'bubble-hidden', hidden };
  await browser.tabs.sendMessage(tabId, message).catch(() => undefined);
}

export const forgetTab = (tabId: number): Promise<void> => storage.removeItem(key(tabId));
