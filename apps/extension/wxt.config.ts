import { fileURLToPath } from 'node:url';
import { PROVIDERS } from '@dr-too-long/shared/providers';
import { defineConfig } from 'wxt';
import { LICENSE_LISTS, writeNotices } from './scripts/third-party-notices.ts';
import { ACTION_TITLE } from './src/action-title.ts';
import { EVERY_SITE } from './src/every-site.ts';
import { LINKS } from './src/links.ts';

const MINIMUM_CHROME = 110;

export default defineConfig({
  srcDir: 'src',
  imports: false,
  webExt: { disabled: true },
  zip: { name: 'dr-too-long', exclude: [`${LICENSE_LISTS}/**`] },
  vite: () => ({ build: { target: `chrome${MINIMUM_CHROME}` } }),
  manifest: {
    name: 'Dr. Too Long',
    // Shown on chrome://extensions and in the Web Store, in at most 132 characters.
    description:
      'Summarize selected text in your language, with every point linked to its source. Runs on your own OpenAI, Claude or Gemini API key.',
    homepage_url: LINKS.repository,
    minimum_chrome_version: String(MINIMUM_CHROME),
    // WXT adds every public/icon/<size>.png to icons by itself; the toolbar takes its own set.
    action: {
      default_title: ACTION_TITLE,
      default_icon: { 16: 'icon/16.png', 24: 'icon/24.png', 32: 'icon/32.png' },
    },
    commands: {
      _execute_action: { suggested_key: { default: 'Ctrl+Shift+S', mac: 'Command+Shift+S' } },
    },
    permissions: ['activeTab', 'contextMenus', 'scripting', 'storage'],
    host_permissions: Object.values(PROVIDERS).map(({ apiHost }) => `${apiHost}/*`),
    optional_host_permissions: EVERY_SITE.origins,
  },
  // Every package goes out with its licence: the project's own, and the bundled packages' notices.
  hooks: {
    'vite:build:extendConfig': (entrypoints, config) => {
      const fileName = `${LICENSE_LISTS}/${entrypoints[0]?.name}.json`;
      config.build = { ...config.build, license: { fileName } };
    },
    'build:publicAssets': (_, files) => {
      files.push({
        absoluteSrc: fileURLToPath(new URL('../../LICENSE', import.meta.url)),
        relativeDest: 'LICENSE',
      });
    },
    'build:done': (wxt) => writeNotices(wxt.config.outDir),
  },
});
