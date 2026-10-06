# Darc Design System: Ledger

Darc issues spending cards to AI agents, and every attempt they make, approved or refused, becomes a public record. The design treats that record as a notarised document. It uses warm paper, ink, one cobalt accent for anything you can act on, serif headings over a precise sans, and mono labels like the column headings of a ledger.

The source of truth is `app/globals.css`. Every colour, size and shadow is a token there, and components read only `var(--name)`.

---

## Principles

1. **The record is the product.** Refusals sit beside approvals, never hidden. Every record shows its verdict at a glance.
2. **One colour means "act".** Cobalt is used only for buttons, links, focus and the active nav item. Never use it for decoration.
3. **Verdicts are colours; the accent is not.** Green, red and amber mean approved, refused and pending, nothing else.
4. **Paper, not glass.** Borders and hairlines separate things. Shadows are kept for the one physical object, the card.
5. **Quiet chrome, dense data.** Generous space around tables and panels, tight figures inside them.

---

## Signatures

These elements make the system recognisably Darc. Keep them.

| Signature | What it is | Where |
|---|---|---|
| **The notch** | The clipped bottom-right corner from the Darc mark, cut at 45° | Card face (24px), panels (14px), stat tiles, primary button, Sign in (8px) |
| **The verdict line** | A 3px green, red or amber rule down the left edge of a record (amber: held for the owner) | Every table row of payment attempts; every line of the agent's run log (2px); every held payment |
| **Ledger paper** | Horizontal rules every 32px with a cobalt margin line | Behind the landing headline (copy written to the right of the margin line); the closing call panel |
| **Receipt rows** | Label/value rows separated by dashed rules | Every `DataRow` list (policy, identity, account) |
| **Security print** | Fine concentric linework on the card, like a cheque | The card face |
| **The stamp** | A red, double-ruled, rotated "REVOKED" stamp over grey card stock | Revoked cards |
| **The italic accent** | One or two words of a display heading in italic cobalt serif | The landing headline ("for *AI agents*") |

---

## Colour

Light theme only for now.

### Paper and ink

| Token | Value | Use |
|---|---|---|
| `--paper` | `#fbfaf7` | Page background |
| `--paper-raised` | `#ffffff` | Panels, inputs, buttons that are not primary |
| `--paper-sunk` | `#f3f1ec` | Table headers, the run log, the card stage, info notices |
| `--ink` | `#10182b` | Headings and body text |
| `--ink-2` | `#3a4458` | Labels, secondary button text |
| `--ink-3` | `#646c7e` | Muted text, captions, ledger labels (4.6:1 on paper, 4.7:1 on sunk) |
| `--rule` | `#e7e3da` | Hairlines, panel borders, table row lines |
| `--rule-strong` | `#d3cdbf` | Input borders, dashed receipt rules, ghost buttons |

### Cobalt (the accent)

| Token | Value | Use |
|---|---|---|
| `--cobalt` | `#2446f5` | Primary buttons, links, focus, active nav underline (6.4:1 on white) |
| `--cobalt-hover` | `#1b37d1` | Hover |
| `--cobalt-press` | `#142a9e` | Pressed; second stop of the logo gradient |
| `--cobalt-wash` | cobalt at 7% | Selected rows, active account chip |
| `--cobalt-edge` | cobalt at 35% | Outlined button border, selected border, ledger margin line |
| `--on-cobalt` | `#ffffff` | Text on a cobalt fill |

### Verdicts

Each verdict has a **text** tone (at least 4.5:1 on its own wash at 12px), a brighter **mark** for dots and verdict lines, and a **wash/edge** pair for badges.

| Verdict | Text | Mark | Wash | Edge | Means |
|---|---|---|---|---|---|
| Approve | `--approve` `#13795b` | `--approve-mark` `#1fa67a` | mark at 12% | mark at 40% | Approved, active, connected |
| Refuse | `--refuse` `#b42d26` | `--refuse-mark` `#e0473d` | mark at 9% | mark at 38% | Refused, declined, blocked, errors |
| Hold | `--hold` `#8f5d0f` | `--hold-mark` `#e2a93b` | mark at 14% | mark at 45% | Pending, and payments held for the owner's approval |
| Void | `--void` = `--ink` | | | | Revoked: a solid ink badge, like a stamp |

Expired and skipped states use `--ink-3` on `--paper-sunk`. **Frozen** (stopped by the velocity rule, waiting for the owner to unfreeze) uses cobalt: text `--cobalt` on `--cobalt-wash` with a `--cobalt-edge` border, and the card face frosts over with `--card-frost`.

### Card stock

| Token | Value | Use |
|---|---|---|
| `--card-hi` | `#1c2a4d` | Top of the card gradient |
| `--card-lo` | `#090e1c` | Bottom of the card gradient |
| `--card-line` | `rgba(255,255,255,0.04)` | Security-print linework |
| `--card-void-hi` / `--card-void-lo` | `#3a3f4a` / `#161a22` | Revoked card stock |
| `--chip-light` / `--chip-mid` / `--chip-dark` | `#ecdcae` / `#c9a85a` / `#a8873e` | The EMV chip |

### On cobalt

The sign-in stage is the one place cobalt is a surface. Everything on it is white (`--on-cobalt`) or a white tint, with two brighter verdict marks:
- `--signal` `#6ff0bf`: approve, on cobalt.
- `--signal-refuse` `#ffb4ab`: refuse, on cobalt.

### Merchant marks

Hues that carry no verdict meaning: `--merchant-0` cobalt, `--merchant-1` `#0e7490` (deep teal), `--merchant-2` ink.

---

## Typography

| Role | Token | Family | Notes |
|---|---|---|---|
| Display and headings | `--serif` | **Instrument Serif** 400, with italic | Headings only. Never bold. |
| Interface and body | `--sans` | **Geist** | 400 body, 500 buttons and emphasis, 600 strong |
| Data and labels | `--mono` | **Geist Mono** | Addresses, amounts in tables, card number, ledger labels |

All three are self-hosted through `next/font/google` in `app/layout.tsx`.

### Scale

| Token | Size | Used for |
|---|---|---|
| `--fs-3xl` | 64px | Landing headline (line-height 1, tracking −0.02em; 44px on phones) |
| `--fs-2xl` | 40px | Page titles (1.05; 32px on phones), stat figures |
| `--fs-xl` | 24px | Panel titles, verdict text on Verify |
| (inline) | 25px | Agent name and limit on the card face |
| (inline) | 22px | Empty-state titles |
| `--fs-lg` | 17px | Page subtitles, in `--ink-3` |
| `--fs-md` | 15px | Body (line-height 1.55) |
| `--fs-sm` | 14px | Table cells, data rows, buttons, nav, notes |
| (inline) | 13px | Mono values: addresses, amounts |
| `--fs-xs` | 12px | Badges, captions, persona lines |
| `--fs-micro` | 11px | Ledger labels |

### The ledger label

Table headers, stat labels, field labels and the labels on the card all use one style: `--mono`, 11px, weight 500, uppercase, letter-spacing 0.08em, colour `--ink-3`. It is the most-repeated type style in the system. Use it for any column or field name.

Headings use `text-wrap: balance`. Figures in tables and data rows use `tabular-nums`.

---

## Space, shape and depth

**Spacing** (4px base): `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 20 · `--sp-6` 24 · `--sp-8` 32 · `--sp-10` 40 · `--sp-12` 48 · `--sp-16` 64 (reserved).

Panels pad 24px (20px on phones). Stacks and grids gap 24px. Pages start 48px below the bar.

**Radius** is small and crisp: `--rd-1` 3px (buttons, badges, inputs, rows) · `--rd-2` 6px (panels, stat tiles, notices) · `--rd-3` 10px (the card) · `--rd-round` 999px (reserved).

**Notch sizes:** `--notch` 14px (panels) · `--notch-sm` 8px (stat tiles, primary buttons) · `--notch-lg` 24px (the card).

**Depth:** only the card casts a shadow.

| Token | Value |
|---|---|
| `--lift-card` | `drop-shadow(0 22px 24px rgba(16,24,43,.26)) drop-shadow(0 6px 10px rgba(36,70,245,.14))` |
| `--lift-card-hover` | `drop-shadow(0 30px 32px rgba(16,24,43,.30)) drop-shadow(0 8px 14px rgba(36,70,245,.20))` |
| `--focus` | `0 0 0 2px var(--paper-raised), 0 0 0 4px var(--cobalt)` |
| `--lift-1`, `--lift-2` | Reserved: ink-tinted box shadows, not used yet |

The card's shadow is a `filter: drop-shadow()` on a wrapper, because the notch's `clip-path` would cut off a `box-shadow`. The second, cobalt-tinted layer is what makes the card glow slightly blue.

---

## Motion

`--t-fast` 140ms (hover, colour) · `--t-base` 220ms (shadow) · `--ease` `cubic-bezier(0.22, 1, 0.36, 1)`.

Motion has one vocabulary: lines rise into place, the record writes itself, the card floats over turning rings, and refusals are stamped.

| Where | Motion |
|---|---|
| Any new card | `card-reveal`: rises 10px and settles from a −0.6° tilt |
| Revoked card | `stamp`: the REVOKED stamp lands, scaling from 1.35 to 1 with a slight bounce |
| Run log | `fade-in`: each line rises 3px |
| Pending badge, live dots | `pulse`: the mark breathes; live dots also send out a `ping` |
| Landing opening | The margin line draws down (1.1s), then the stamp, headline, lede, actions and fact tiles rise in turn, 80–100ms apart |
| Landing card | Floats 8px on a 7s cycle over three rings turning once every 90s |
| Landing record | On scroll into view, each row posts from the left, its verdict line draws, then its badge is stamped, 600ms apart |
| Landing checks | On scroll into view, rows 1–9 sweep cobalt in order; row 10 holds red |
| Landing sections | Rise in on scroll (CSS scroll timelines; browsers without them show sections as they are) |
| Rotating word | `RotatingWord` cycles one word of a heading every 2.8s; each word rises in, slightly blurred (sign-in headline, landing closing call) |
| Sign-in stage | Dot grid; two ring sets turning in opposite directions (48s and 64s); a breathing glow; the card floats; the sample run writes one line every 1.3s, holds, then repeats |

Rules:
- Cards lift by shadow on hover and never move.
- Every entrance starts from a visible state, or is held only once JavaScript is running and motion is allowed, so the content always shows.
- Everything stops under `prefers-reduced-motion`. The rotating word stays on its first word and the sample run shows all its lines.
- **Keyframes live in the CSS module that uses them.** CSS modules rename animation names, so a keyframe declared in `globals.css` is never found by a component.

---

## Layout

- Max content width `--page-max` 1120px, with gutters `--gutter` 32px, `--gutter-md` 24px (≤1023px) and `--gutter-sm` 16px (≤860px).
- **Desktop:** a sticky top bar (`--bar-h` 64px, paper at 85% with blur, bottom hairline). The wordmark sits on the left, then the nav. The active item gets a 2px cobalt underline on the bar's edge. The account chip and Sign out sit on the right.
- **Phone (≤860px):** a 56px top bar with the wordmark and account, and a bottom tab bar with icons and labels. The active tab is cobalt.
- Two-column pages use `5fr / 6fr`, so the second column (tables, the agent run) gets the room. They stack below 860px.
- Stat tiles auto-fit at 180px minimum, two per row on phones.
- Card grids auto-fill at 300px minimum.
- Tables scroll sideways inside their panel on phones. The page never does.

---

## Components

All of these live in `components/`. Screens compose them and never style their own panels or buttons.

**Shell** (`shell.tsx`): the frame for every screen, with the bar, nav, account and page header. It takes `title` (a string, or a node with an `<em>` for the italic accent), `subtitle`, `action`, and `hero` (the landing's 64px headline on ledger paper).

**Panel**: a notched paper sheet with an optional serif `title`, a muted `note`, and an `action` on the right. Use `flush` when a table fills it edge to edge.

**Button**:

| Variant | Look | Use |
|---|---|---|
| `primary` | Cobalt fill, white text, notched corner, inset focus ring | The one main action on a screen |
| `secondary` | White, cobalt text, cobalt-edge border | The alternative action |
| `ghost` | White, ink-2 text, rule-strong border | Cancel, sign out, filters |
| `destructive` | White, refuse text, refuse-edge border | Revoke |

Sizes are default (14px) and `lg` (15px, larger padding).

**StatusBadge**: 12px, weight 500, 3px radius, with a square 6px mark like a tick in a ledger column. The kinds are `active`, `approved`, `declined`, `pending`, `revoked` (solid ink) and `expired`. Labels are sentence case. Decline reasons are shown as written on-chain (`DailyCapExceeded`).

**DataRow**: a receipt line, with the label in `--ink-3` (160px column, stacked above the value on phones), the value in `--ink`, and dashed `--rule-strong` rules between rows.

**Table**: ledger-label headers on `--paper-sunk`, 14px cells, hairline rows, and a faint hover. Add `railOk` or `railNo` to a `<tr>` for its verdict line.

**Stat**: a notched tile with a ledger label, a 40px serif figure and a 12px note.

**Notice**: `info` is sunk paper with a 3px cobalt edge. `error` is the refuse wash with a red edge and red title. Write a calm sentence, then what to do.

**Empty**: a centred 22px serif title, a muted line, and an optional single action.

**AgentCardFace** (`agent-card.tsx`): the payment card. It is ISO ratio 1.586, at most 400px wide (320px for `small`). It has ink stock lit by cobalt, security-print linework, the gold chip, a mono masked number, the serif agent name and daily limit, and a mono status chip. Revoked cards switch to grey stock and get the stamp. Expired cards are greyed out.

**MerchantCell**: a 28px mono-initial tile in the merchant's mark colour, with the name and what they sell.

**AddressLink**: a shortened address in mono with an external-link icon, opening the block explorer.

**Landing** (`landing.tsx`): the signed-out `/`. Its sections, in order:
1. The opening on ledger paper: a mono "Live on Monad Testnet" stamp, the 72px serif headline with its italic accent, the lede, actions and four fact tiles.
2. A full-width band of `--paper-sunk` holding the card and its policy beside a sample run with verdict lines. Refused amounts are struck through in `--refuse-mark`.
3. How it works: three numbered step panels, each with a mono code line.
4. The ten checks, in order, as a table.
5. A closing call on ruled paper.
6. The footer.

Every figure on it is a property of the system (10 checks, 1 revoke transaction, $0 held by the agent), never a traffic number. Two patterns start here:
- **Kicker:** a ledger label led by an 8px square (cobalt, or `--approve-mark` for the record).
- **Band:** full-bleed sunk paper with hairlines top and bottom, to set off a stage.

**Sign in** (`app/sign-in/`): a split screen.
- **Left:** the cobalt stage, with the brand, a network pill, the headline "Darc controls your agent's *budget*" (its last word rotating), the frosted demo card and the sample run writing itself.
- **Right:** the paper side.
  - The two real ways in sit in a segmented control: "I have a passkey" and "Create an account".
  - Receipt lines say what the ceremony does.
  - One primary button, a link to the public verifier, the passkey-provider advisory, and network and contract details with a live UTC clock.
- On narrow screens the stage shrinks to a header.
- There is no password, wallet or SSO path, so none is shown.

**ApprovalInbox** (`approvals.tsx`): payments held for the owner. Each is a notched slip with an amber verdict line, a mono "Needs your approval" kicker, the serif question ("Approve $200 to Horizon Data API?"), the reason in plain words, a live expiry countdown, and two answers: "Approve with passkey" (primary) and "Decline" (ghost). It polls the chain every 4 seconds; the app bar shows the waiting count as an amber chip on Approvals.

**PushToggle** (`push-toggle.tsx`): signs a device up for approval alerts with the owner's passkey. Explains plainly when a browser cannot, when iOS needs Darc on the Home Screen first, and when the server has no push keys.

**RuleFields** (`rule-fields.tsx`): "What the card is for" (a textarea) and "Freeze on a burst" (Off, 3, 5 or 10 attempts a minute), each with a one-line hint. Shared by the issue and edit forms.

**Wordmark and Mark** (`brand.tsx`): the mark is a card with a chip and the clipped corner, in a cobalt gradient. Use `inverse` (white) on dark grounds such as the card. The wordmark is the mark plus "Darc" in the serif.

---

## Voice

- **Plain and specific.** "Spending above it is refused on-chain, not just flagged."
- **Name the outcome.** Buttons say exactly what happens: "Issue to Atlas", "Revoke card", "Claim AUSD and approve".
- **Errors are calm.** Give a title saying what failed, then what to do: "Passkeys need a secure connection. Open this page over HTTPS, or on localhost."
- **Sentence case everywhere** except ledger labels, which are uppercase by style, not by text.
- **No emoji. No exclamation marks.**
- **Call things what people see.** Cards, merchants, limits and refusals, not "policies" or "attestations" unless the screen is about the registry.
- **Naming:** the brand is **Darc**, and what it issues are **agent cards**. The signed contract domain stays `AgentCard`, because the deployed contracts check it.

---

## Do and don't

**Do**
- Read every value from a token in `app/globals.css`.
- Put the notch on any new top-level surface (panel, tile, primary action).
- Give every new record list its verdict line.
- Use the ledger label for every column and field name.
- Keep cobalt for things you can click.

**Don't**
- Use green, red or amber for decoration or branding.
- Use cobalt as a background for whole sections. The sign-in stage is the single exception.
- Add shadows to panels. Only the card floats.
- Set headings in the sans, or set the serif in bold.
- Use pills or circles. Even status marks are square, and the account avatar is a tiny notched card.
- Add a second accent colour.

---

## Tokens, ready to paste

```css
:root {
  /* Paper */
  --paper: #fbfaf7;
  --paper-raised: #ffffff;
  --paper-sunk: #f3f1ec;
  /* Ink */
  --ink: #10182b;
  --ink-2: #3a4458;
  --ink-3: #646c7e;
  /* Rules */
  --rule: #e7e3da;
  --rule-strong: #d3cdbf;
  /* Cobalt */
  --cobalt: #2446f5;
  --cobalt-hover: #1b37d1;
  --cobalt-press: #142a9e;
  --cobalt-wash: color-mix(in oklab, var(--cobalt), transparent 93%);
  --cobalt-edge: color-mix(in oklab, var(--cobalt), transparent 65%);
  --on-cobalt: #ffffff;
  /* Verdicts */
  --approve: #13795b;
  --approve-mark: #1fa67a;
  --approve-wash: color-mix(in oklab, var(--approve-mark), transparent 88%);
  --approve-edge: color-mix(in oklab, var(--approve-mark), transparent 60%);
  --refuse: #b42d26;
  --refuse-mark: #e0473d;
  --refuse-wash: color-mix(in oklab, var(--refuse-mark), transparent 91%);
  --refuse-edge: color-mix(in oklab, var(--refuse-mark), transparent 62%);
  --hold: #8f5d0f;
  --hold-mark: #e2a93b;
  --hold-wash: color-mix(in oklab, var(--hold-mark), transparent 86%);
  --hold-edge: color-mix(in oklab, var(--hold-mark), transparent 55%);
  --void: var(--ink);
  /* Card stock */
  --card-hi: #1c2a4d;
  --card-lo: #090e1c;
  --card-line: rgba(255, 255, 255, 0.04);
  --card-void-hi: #3a3f4a;
  --card-void-lo: #161a22;
  --chip-light: #ecdcae;
  --chip-mid: #c9a85a;
  --chip-dark: #a8873e;
  /* Merchant marks */
  --merchant-0: var(--cobalt);
  --merchant-1: #0e7490;
  --merchant-2: var(--ink);
  /* Type (families come from next/font: Instrument Serif, Geist, Geist Mono) */
  --serif: var(--font-instrument), "Iowan Old Style", Georgia, serif;
  --sans: var(--font-geist), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace;
  --fs-micro: 11px;
  --fs-xs: 12px;
  --fs-sm: 14px;
  --fs-md: 15px;
  --fs-lg: 17px;
  --fs-xl: 24px;
  --fs-2xl: 40px;
  --fs-3xl: 64px;
  /* Space */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;
  --sp-8: 32px;
  --sp-10: 40px;
  --sp-12: 48px;
  --sp-16: 64px;
  /* Shape */
  --rd-1: 3px;
  --rd-2: 6px;
  --rd-3: 10px;
  --rd-round: 999px;
  --notch: 14px;
  --notch-sm: 8px;
  --notch-lg: 24px;
  /* Lift */
  --lift-1: 0 1px 2px rgba(16, 24, 43, 0.06);
  --lift-2: 0 14px 30px -14px rgba(16, 24, 43, 0.22), 0 4px 10px -6px rgba(16, 24, 43, 0.1);
  --lift-card: drop-shadow(0 22px 24px rgba(16, 24, 43, 0.26)) drop-shadow(0 6px 10px rgba(36, 70, 245, 0.14));
  --lift-card-hover: drop-shadow(0 30px 32px rgba(16, 24, 43, 0.3)) drop-shadow(0 8px 14px rgba(36, 70, 245, 0.2));
  --focus: 0 0 0 2px var(--paper-raised), 0 0 0 4px var(--cobalt);
  /* Motion */
  --t-fast: 140ms;
  --t-base: 220ms;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  /* Layout */
  --page-max: 1120px;
  --gutter: 32px;
  --gutter-md: 24px;
  --gutter-sm: 16px;
  --bar-h: 64px;
}
```

### The notch, as CSS

```css
.notched {
  position: relative;
  border: 1px solid var(--rule);
  border-radius: var(--rd-2);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - var(--notch)), calc(100% - var(--notch)) 100%, 0 100%);
}
/* The clip removes the corner's border, so the cut edge is drawn back in. */
.notched::after {
  content: "";
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: var(--notch);
  height: var(--notch);
  background: linear-gradient(to top left, transparent 50%, var(--rule) 50%, var(--rule) calc(50% + 1px), transparent calc(50% + 1px));
  pointer-events: none;
}
```

### The verdict line, as CSS

```css
.railOk td:first-child { box-shadow: inset 3px 0 0 var(--approve-mark); }
.railNo td:first-child { box-shadow: inset 3px 0 0 var(--refuse-mark); }
```

---

## Where things live

| File | Holds |
|---|---|
| `app/globals.css` | Every token, base element styles, keyframes |
| `app/layout.tsx` | Font loading (Instrument Serif, Geist, Geist Mono) |
| `app/styles/tokens.ts` | Status labels and colours for TypeScript |
| `components/ui/` | Panel, Button, StatusBadge, DataRow, Table, Empty, Notice, utilities |
| `components/pieces.*` | Stat, MerchantCell, AddressLink, layout grids, forms, the run log |
| `components/agent-card.*` | The card face |
| `components/shell.*` | The bar, nav, page header, hero |
| `components/brand.*` | Mark and wordmark |
| `app/icon.svg` | Favicon |
