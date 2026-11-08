import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { EVERY_SITE } from '../every-site.ts';

// Follows Chrome's grant, which the reader can also change from the extension's details page.
export function EverySite() {
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

  if (granted === undefined) return null;

  // The box changes only once Chrome has granted or removed the access, so a declined prompt leaves
  // it as it was. Chrome shows its prompt only for a request made straight from the click.
  async function toggle(event: MouseEvent) {
    event.preventDefault();
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

  return (
    <div class="every-site">
      <label>
        <input type="checkbox" checked={granted} onClick={toggle} />
        Show the bubble on every site
      </label>
      <p>
        Chrome asks for access to every https site. The bubble then appears on the pages you open or
        reload, with no click on the icon first. It sends nothing until you click it; a click sends
        the selection to your provider with your key, as the icon does. Unticking takes effect on
        the pages you open or reload.
      </p>
      {failed && (
        <p class="error" role="alert">
          Chrome could not change this access. Try again.
        </p>
      )}
    </div>
  );
}
