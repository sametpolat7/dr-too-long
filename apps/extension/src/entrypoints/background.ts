import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    console.info(`Dr. Too Long service worker ready (${reason})`);
  });
});
