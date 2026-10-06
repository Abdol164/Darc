/**
 * Token accessors for the few places that need values in TypeScript (inline SVG fills,
 * computed gradients). Everything else reads the CSS variables in app/globals.css —
 * these names must stay in step with that file.
 */
export const STATUS = {
  active: { label: "Active", color: "var(--approve)", bg: "var(--approve-wash)" },
  approved: { label: "Approved", color: "var(--approve)", bg: "var(--approve-wash)" },
  declined: { label: "Declined", color: "var(--refuse)", bg: "var(--refuse-wash)" },
  revoked: { label: "Revoked", color: "var(--paper-raised)", bg: "var(--void)" },
  pending: { label: "Pending", color: "var(--hold)", bg: "var(--hold-wash)" },
  expired: { label: "Expired", color: "var(--ink-3)", bg: "var(--paper-sunk)" },
  frozen: { label: "Frozen", color: "var(--cobalt)", bg: "var(--cobalt-wash)" },
} as const;

export type StatusKind = keyof typeof STATUS;
