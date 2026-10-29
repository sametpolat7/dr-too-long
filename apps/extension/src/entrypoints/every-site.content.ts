import { defineContentScript } from 'wxt/utils/define-content-script';
import { watchEverySite } from '../content/every-site.ts';

// Registered by the worker on every https page while the reader's every-site opt-in stands.
export default defineContentScript({
  registration: 'runtime',
  cssInjectionMode: 'manual',
  noScriptStartedPostMessage: true,
  main: watchEverySite,
});
