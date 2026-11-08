export type Theme = 'light' | 'dark';

const RGB = /^rgba?\(([^)]*)\)$/;

// The page's own colors decide: in a content script, prefers-color-scheme reports Chrome's theme,
// not the page's.
export function pageTheme(): Theme {
  for (const element of [document.body, document.documentElement]) {
    if (!element) continue;
    const color = rgbaOf(getComputedStyle(element).backgroundColor);
    if (color && color.alpha >= 0.5) return luminance(color) < 0.2 ? 'dark' : 'light';
  }
  // A transparent page shows Chrome's canvas, which is dark only when the page opts into a dark
  // scheme.
  const scheme = getComputedStyle(document.documentElement).colorScheme;
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = scheme.includes('dark') && (!scheme.includes('light') || prefersDark);
  return dark ? 'dark' : 'light';
}

interface Rgba {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

// Chrome computes classic colors as rgb() or rgba(), and newer ones, such as oklch(), as written;
// a canvas turns those into sRGB.
function rgbaOf(color: string): Rgba | undefined {
  const parts = RGB.exec(color)?.[1]
    ?.split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  if (parts) {
    const [red = 0, green = 0, blue = 0, alpha = 1] = parts;
    return { red, green, blue, alpha };
  }
  const canvas = new OffscreenCanvas(1, 1).getContext('2d');
  if (!canvas) return undefined;
  canvas.fillStyle = color;
  canvas.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0, alpha = 0] = canvas.getImageData(0, 0, 1, 1).data;
  return { red, green, blue, alpha: alpha / 255 };
}

// The relative luminance of WCAG.
function luminance({ red, green, blue }: Rgba): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}
