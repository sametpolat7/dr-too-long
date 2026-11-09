// The site the Summarize button can be turned off on: an http or https page's hostname. Other pages,
// and the opaque "null" origin of a sandboxed frame, have none.
export function siteHost(address: string | undefined): string | undefined {
  if (address === undefined) return;
  try {
    const url = new URL(address);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.hostname;
  } catch {
    // A tab that has not loaded its first page yet has an empty address.
  }
}
