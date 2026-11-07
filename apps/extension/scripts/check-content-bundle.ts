// The content scripts run inside web pages. The key, the storage APIs and the provider hosts belong
// to the background worker and the options page and must not reach their bundles.
import { readFileSync } from 'node:fs';
import { PROVIDERS } from '@dr-too-long/shared/providers';

const FORBIDDEN = [
  'storage',
  'apiKey',
  'indexedDB',
  ...Object.values(PROVIDERS).map(({ apiHost }) => new URL(apiHost).host),
];
const BUNDLES = ['summarize.js', 'every-site.js'] as const;

const problems = BUNDLES.flatMap((name) => {
  const bundle = readFileSync(
    new URL(`../.output/chrome-mv3/content-scripts/${name}`, import.meta.url),
    'utf8',
  );
  const found = FORBIDDEN.filter((needle) => bundle.includes(needle));
  return found.length > 0 ? [`${name} carries: ${found.join(', ')}`] : [];
});

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

console.info('The content script bundles carry no key, storage or provider host.');
