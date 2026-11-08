// Renders the PNG icons from the SVG masters in design/. It needs rsvg-convert from librsvg (brew
// install librsvg, or apt install librsvg2-bin) and runs only when a master changes: the PNGs are
// committed, and the build never renders them.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const master = (name: string) => new URL(`../design/${name}`, import.meta.url).pathname;
const icon = (size: number) => new URL(`../public/icon/${size}.png`, import.meta.url).pathname;

// The small master is drawn on whole pixels, so it stays sharp at 16 and 32 px, the toolbar's sizes
// at 1x and 2x.
const SIZES = [
  { size: 16, from: 'icon-small.svg' },
  { size: 24, from: 'icon.svg' },
  { size: 32, from: 'icon-small.svg' },
  { size: 48, from: 'icon.svg' },
];

mkdirSync(new URL('../public/icon/', import.meta.url), { recursive: true });
for (const { size, from } of SIZES) {
  execFileSync('rsvg-convert', [
    ...['--width', String(size), '--height', String(size)],
    ...[master(from), '--output', icon(size)],
  ]);
}
// The Web Store's 128 px icon holds 96 px of artwork inside 16 px of transparent padding.
execFileSync('rsvg-convert', [
  ...['--width', '96', '--height', '96', '--page-width', '128', '--page-height', '128'],
  ...['--left', '16', '--top', '16', master('icon.svg'), '--output', icon(128)],
]);
console.info('Rendered public/icon/16, 24, 32, 48 and 128.png.');
