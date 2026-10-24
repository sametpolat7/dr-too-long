// The content script runs inside web pages. The key, the storage API and the provider host belong
// to the background worker and must not reach its bundle.
import { readFileSync } from 'node:fs';

const FORBIDDEN = ['storage', 'apiKey', 'api.openai.com'] as const;

const bundle = readFileSync(
  new URL('../.output/chrome-mv3/content-scripts/summarize.js', import.meta.url),
  'utf8',
);

const found = FORBIDDEN.filter((needle) => bundle.includes(needle));

if (found.length > 0) {
  console.error(`The content script bundle carries: ${found.join(', ')}`);
  process.exit(1);
}

console.info('The content script bundle carries no key, storage or provider code.');
