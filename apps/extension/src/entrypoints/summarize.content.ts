import { defineContentScript } from 'wxt/utils/define-content-script';
import { summarizeSelection } from '../content/summarize.tsx';

// Injected by the toolbar action on each click; a new run invalidates the previous one.
export default defineContentScript({
  registration: 'runtime',
  cssInjectionMode: 'manual',
  noScriptStartedPostMessage: true,
  main: summarizeSelection,
});
