// Writes THIRD-PARTY-NOTICES.txt into a build: every package the build bundles, its license and the
// license text its authors ship. Each of WXT's Vite builds lists its own packages in licenses/,
// through Vite's build.license option, and this merges the lists; the zip leaves them out.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface License {
  name: string;
  version: string;
  identifier?: string;
  text?: string;
}

export const LICENSE_LISTS = 'licenses';
export const NOTICES_FILE = 'THIRD-PARTY-NOTICES.txt';

// Packages that ship no license file, and the one in their repository.
const REPOSITORY_LICENSES: Record<string, string> = {
  '@ai-sdk/provider-utils': 'vercel-ai.txt',
  '@webext-core/isolated-element': 'webext-core.txt',
  '@wxt-dev/browser': 'wxt.txt',
  '@wxt-dev/storage': 'wxt.txt',
  wxt: 'wxt.txt',
};

const RULE = `\n\n${'-'.repeat(72)}\n\n`;

const readLicense = (file: string) =>
  readFileSync(new URL(`./licenses/${file}`, import.meta.url), 'utf8').trim();

export function writeNotices(outDir: string): void {
  const lists = join(outDir, LICENSE_LISTS);
  const licenses = new Map<string, License>();
  for (const file of readdirSync(lists)) {
    for (const license of JSON.parse(readFileSync(join(lists, file), 'utf8')) as License[]) {
      licenses.set(`${license.name}@${license.version}`, license);
    }
  }

  const sections = [...licenses.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, version, identifier, text }) => {
      const fallback = REPOSITORY_LICENSES[name];
      const body = text ?? (fallback && readLicense(fallback));
      // A new package with no license text must be looked at, not shipped without one.
      if (!body) throw new Error(`${name} ${version} ships no license text; add its repository's.`);
      return `${name} ${version} (${identifier ?? 'no identifier'})\n\n${body}`;
    });
  const apache = `The Apache License 2.0, which the Apache-2.0 packages above refer to\n\n${readLicense('apache-2.0.txt')}`;
  const intro =
    'Dr. Too Long bundles the open-source packages below. Each is listed with its version, its license and its license text.';
  writeFileSync(join(outDir, NOTICES_FILE), `${[intro, ...sections, apache].join(RULE)}\n`);
}
