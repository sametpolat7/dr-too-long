// A guarded key absent from manifest-expected.json must also be absent from the build.
import { readFileSync } from 'node:fs';

const GUARDED_KEYS = [
  'permissions',
  'optional_permissions',
  'host_permissions',
  'optional_host_permissions',
  'content_scripts',
  'commands',
  'minimum_chrome_version',
] as const;

type Manifest = Record<string, unknown>;

function readJson(relativePath: string): Manifest {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}

const built = readJson('../.output/chrome-mv3/manifest.json');
const expected = readJson('./manifest-expected.json');

const problems = GUARDED_KEYS.flatMap((key) => {
  const actual = JSON.stringify(built[key] ?? null);
  const wanted = JSON.stringify(expected[key] ?? null);
  return actual === wanted ? [] : [`${key}: expected ${wanted}, got ${actual}`];
});

if (problems.length > 0) {
  console.error('The built manifest does not match manifest-expected.json:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.info('Manifest matches manifest-expected.json.');
