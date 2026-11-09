// The extension's icon, drawn inline: as an image file it would have to be web-accessible, which
// lets any page detect the extension. The same shapes as design/icon-small.svg.
export function Mark({ size = 16 }: { size?: number }) {
  return (
    <svg class="mark" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <rect width="16" height="16" rx="3" fill="#ffe58f" />
      <path fill="#1a1a1a" d="M6 2h4v4H6zm0 6h4v4H6zm2 4h2v1H8zm-1 1h2v1H7zm-1 1h2v1H6z" />
    </svg>
  );
}
