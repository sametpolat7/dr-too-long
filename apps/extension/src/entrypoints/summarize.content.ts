import { defineContentScript } from 'wxt/utils/define-content-script';
import { summarizeSelection } from '../content/summarize.tsx';

// Injected on each use of the icon, shortcut or menu item; a new run invalidates the previous one.
export default defineContentScript({
  registration: 'runtime',
  cssInjectionMode: 'manual',
  noScriptStartedPostMessage: true,
  main: summarizeSelection,
});
