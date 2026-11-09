import { defineContentScript } from 'wxt/utils/define-content-script';
import { summarizeSelection } from '../content/summarize.tsx';

// Injected on each use of the popup's Summarize selection button, the shortcut, the menu item or the
// every-site bubble; a new run invalidates the previous one.
export default defineContentScript({
  registration: 'runtime',
  cssInjectionMode: 'manual',
  // Keeps WXT's start-up message off the page's own message listeners.
  noScriptStartedPostMessage: true,
  main: summarizeSelection,
});
