import { defineContentScript } from 'wxt/utils/define-content-script';
import { summarizeSelection } from '../content/summarize.tsx';

// Injected on each use of the icon, shortcut, menu item or every-site bubble; a new run invalidates
// the previous one.
export default defineContentScript({
  registration: 'runtime',
  cssInjectionMode: 'manual',
  noScriptStartedPostMessage: true,
  main: summarizeSelection,
});
