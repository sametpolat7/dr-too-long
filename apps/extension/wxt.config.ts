import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  imports: false,
  webExt: { disabled: true },
  zip: { name: 'dr-too-long' },
  manifest: {
    name: 'Dr. Too Long',
    description: 'Turns selected text into a summary in your language with one click.',
    minimum_chrome_version: '116',
  },
});
