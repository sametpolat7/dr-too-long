// The content scripts run inside web pages. The key, the storage APIs and the provider hosts belong
// to the background worker, the options page and the popup and must not reach any content script's
// bundle.
import { readdirSync, readFileSync } from 'node:fs';
import { PROVIDERS } from '@dr-too-long/shared/providers';

const FORBIDDEN = [
  'storage',
  'apiKey',
  'indexedDB',
  ...Object.values(PROVIDERS).map(({ apiHost }) => new URL(apiHost).host),
];
const directory = new URL('../.output/chrome-mv3/content-scripts/', import.meta.url);
const bundles = readdirSync(directory).filter((name) => name.endsWith('.js'));

const problems = bundles.flatMap((name) => {
  const bundle = readFileSync(new URL(name, directory), 'utf8');
  const found = FORBIDDEN.filter((needle) => bundle.includes(needle));
  return found.length > 0 ? [`${name} carries: ${found.join(', ')}`] : [];
});
if (bundles.length === 0) problems.push('No content script was built.');

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

console.info(`${bundles.join(' and ')} carry no key, storage or provider host.`);
