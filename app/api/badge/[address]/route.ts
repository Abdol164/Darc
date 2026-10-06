import { getAddress, isAddress } from "viem";
import { loadAgentRecord, standingOf, type Standing } from "@/lib/report";

/**
 * An embeddable badge showing an agent's standing and record, for a merchant's checkout or an
 * agent's profile: <img src="https://…/api/badge/0x…">.
 *
 * An SVG served as an image cannot use the site's fonts or CSS variables, so the Ledger
 * colours are written out here and the type falls back to system serif and mono faces.
 */
const INK = "#10182b";
const PAPER = "#ffffff";
const RULE = "#e7e3da";
const INK_3 = "#646c7e";
const MARK: Record<Standing, string> = {
  active: "#1fa67a",
  frozen: "#2446f5",
  revoked: INK,
  expired: INK_3,
  unknown: INK_3,
};

const HEADERS = {
  "content-type": "image/svg+xml; charset=utf-8",
  "cache-control": "public, max-age=60",
  "access-control-allow-origin": "*",
};

function label(standing: Standing, approved: number, refused: number) {
  if (standing === "unknown") return "NO RECORD";
  if (standing === "revoked") return `REVOKED · DO NOT TRANSACT`;
  if (standing === "frozen") return `FROZEN · ${approved} APPROVED · ${refused} REFUSED`;
  const prefix = standing === "expired" ? "EXPIRED" : "ACTIVE";
  return `${prefix} · ${approved} APPROVED · ${refused} REFUSED`;
}

function badge(text: string, mark: string) {
  const H = 28;
  const NOTCH = 8;
  const left = 54;
  // Monospace at 11px with 0.06em tracking: about 7.26px a character.
  const right = Math.ceil(12 + 6 + 8 + text.length * 7.26 + 12);
  const W = left + right;
  // The Darc notch: the bottom-right corner is cut at 45°.
  const outline = `M3 0H${W}V${H - NOTCH}L${W - NOTCH} ${H}H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Darc: ${text.toLowerCase()}">
  <title>Darc: ${text.toLowerCase()}</title>
  <clipPath id="c"><path d="${outline}"/></clipPath>
  <g clip-path="url(#c)">
    <rect width="${W}" height="${H}" fill="${PAPER}"/>
    <rect width="${left}" height="${H}" fill="${INK}"/>
  </g>
  <path d="${outline}" fill="none" stroke="${RULE}"/>
  <text x="${left / 2}" y="19" text-anchor="middle" fill="${PAPER}" font-family="Iowan Old Style, Georgia, serif" font-size="16">Darc</text>
  <rect x="${left + 12}" y="${H / 2 - 3}" width="6" height="6" rx="1" fill="${mark}"/>
  <text x="${left + 26}" y="18" fill="${INK}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" letter-spacing="0.66">${text}</text>
</svg>`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address)) return new Response(badge("NOT AN ADDRESS", INK_3), { status: 400, headers: HEADERS });
  try {
    const record = await loadAgentRecord(getAddress(address));
    const standing = standingOf(record);
    return new Response(badge(label(standing, record.approved, record.declined), MARK[standing]), { headers: HEADERS });
  } catch {
    return new Response(badge("RECORD UNAVAILABLE", INK_3), { status: 502, headers: HEADERS });
  }
}
