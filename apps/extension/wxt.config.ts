import { ACTIVE_MODEL, PROVIDERS } from '@dr-too-long/shared/providers';
import { defineConfig } from 'wxt';

const MINIMUM_CHROME = 110;

export default defineConfig({
  srcDir: 'src',
  imports: false,
  webExt: { disabled: true },
  zip: { name: 'dr-too-long' },
  vite: () => ({ build: { target: `chrome${MINIMUM_CHROME}` } }),
  manifest: {
    name: 'Dr. Too Long',
    description: 'Turns selected text into a summary in your language with one click.',
    minimum_chrome_version: String(MINIMUM_CHROME),
    action: { default_title: 'Summarize the selection' },
    commands: {
      _execute_action: { suggested_key: { default: 'Ctrl+Shift+S', mac: 'Command+Shift+S' } },
    },
    permissions: ['activeTab', 'contextMenus', 'scripting', 'storage'],
    host_permissions: [`${PROVIDERS[ACTIVE_MODEL.provider].apiHost}/*`],
  },
});
