import { browser } from 'wxt/browser';

// Chrome stops an idle service worker after 30 seconds; any extension API call resets that clock.
const KEEP_ALIVE_MS = 20_000;

let runs = 0;
let timer: ReturnType<typeof setInterval> | undefined;

export function keepAlive(): () => void {
  runs += 1;
  timer ??= setInterval(() => browser.runtime.getPlatformInfo(), KEEP_ALIVE_MS);
  return () => {
    runs -= 1;
    if (runs === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
