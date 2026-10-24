import { createSummarizer } from '@dr-too-long/shared/model';
import { activeModel } from '@dr-too-long/shared/providers';
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { startPortServer } from '../background/port-server.ts';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    console.info(`Dr. Too Long service worker ready (${reason})`);
  });
  startPortServer((apiKey) => createSummarizer(activeModel(apiKey)));
});
