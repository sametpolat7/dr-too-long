// In an extension page, prefers-color-scheme reports Chrome's theme, which the popup and the
// settings page follow through the tokens' data-theme.
export function followChromeTheme(): void {
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    document.documentElement.dataset.theme = dark.matches ? 'dark' : 'light';
  };
  apply();
  dark.addEventListener('change', apply);
}
