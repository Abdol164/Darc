/**
 * Wordmark and icon. The mark is a card with a clipped corner and a chip — geometric, so it
 * reads at favicon size, and it leans into the card metaphor the product is built on.
 * `inverse` draws it in white for use on the card face's gradient.
 */
import b from "./brand.module.css";

export function Mark({ size = 22, inverse }: { size?: number; inverse?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="markFace" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop className={b.stopA} />
          <stop offset="1" className={b.stopB} />
        </linearGradient>
      </defs>
      <path
        d="M4 9.5A3.5 3.5 0 0 1 7.5 6h17A3.5 3.5 0 0 1 28 9.5v8l-6 6H7.5A3.5 3.5 0 0 1 4 20V9.5Z"
        fill={inverse ? undefined : "url(#markFace)"}
        className={inverse ? b.inverseFace : undefined}
      />
      <rect x="7.5" y="10" width="7" height="5" rx="1.4" className={inverse ? b.inverseChip : b.chip} />
      <path d="M28 17.5 22 23.5v-6h6Z" className={inverse ? b.inverseCorner : b.corner} />
    </svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className={b.wordmark}>
      <Mark size={size} />
      {/* Only the font size varies with the mark size, so it stays a CSS variable. */}
      <span className={b.name} style={{ fontSize: size * 1.18 }}>
        Darc
      </span>
    </span>
  );
}
