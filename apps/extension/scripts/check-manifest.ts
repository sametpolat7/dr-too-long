// The built manifest must equal manifest-expected.json, apart from the version, so any new key, such
// as a permission or a security policy, fails the build until the expected file says so. The
// package must also carry the licence files.
import { existsSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { NOTICES_FILE } from './third-party-notices.ts';

type Manifest = Record<string, unknown>;

const output = (name: string) => new URL(`../.output/chrome-mv3/${name}`, import.meta.url);
const readJson = (url: URL): Manifest => JSON.parse(readFileSync(url, 'utf8'));

const { version: _, ...built } = readJson(output('manifest.json'));
const expected = readJson(new URL('./manifest-expected.json', import.meta.url));

const keys = [...new Set([...Object.keys(built), ...Object.keys(expected)])].sort();
const problems = keys.flatMap((key) =>
  isDeepStrictEqual(built[key], expected[key])
    ? []
    : [`${key}: expected ${JSON.stringify(expected[key])}, got ${JSON.stringify(built[key])}`],
);
for (const file of ['LICENSE', NOTICES_FILE]) {
  if (!existsSync(output(file))) problems.push(`${file} is missing from the package`);
}

if (problems.length > 0) {
  console.error('The built package does not match manifest-expected.json:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.info('The manifest matches manifest-expected.json, and the licence files are in place.');
