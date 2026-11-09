import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { EVERY_SITE } from './every-site.ts';

interface EverySiteAccess {
  // Undefined until Chrome answers.
  granted: boolean | undefined;
  failed: boolean;
  toggle: () => Promise<void>;
}

// Follows Chrome's grant, which the reader can also change from the extension's details page.
export function useEverySite(): EverySiteAccess {
  const [granted, setGranted] = useState<boolean>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const update = () => void browser.permissions.contains(EVERY_SITE).then(setGranted);
    update();
    browser.permissions.onAdded.addListener(update);
    browser.permissions.onRemoved.addListener(update);
    return () => {
      browser.permissions.onAdded.removeListener(update);
      browser.permissions.onRemoved.removeListener(update);
    };
  }, []);

  // Chrome shows its prompt only for a request made straight from a click, so toggle is called from
  // one. Granted changes only once Chrome has granted or removed the access, so a declined prompt
  // leaves it as it was.
  async function toggle() {
    try {
      const changed = granted
        ? await browser.permissions.remove(EVERY_SITE)
        : await browser.permissions.request(EVERY_SITE);
      if (changed) setGranted(!granted);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  return { granted, failed, toggle };
}
