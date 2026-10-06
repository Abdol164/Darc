"use client";

/**
 * The product shell: a sticky, blurred top bar on desktop, a bottom bar on phones, and an
 * account control that shows who is signed in. Every screen renders inside this, so the
 * product has a frame rather than being a set of standalone pages.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Wordmark, Mark } from "./brand";
import { ActivityIcon, AgentsIcon, ApprovalsIcon, CardsIcon, HomeIcon, VerifyIcon } from "./icons";
import { useHeldPayments } from "./approvals";
import { listCards } from "@/lib/cards";
import { useOwner } from "@/lib/owner-context";
import s from "./shell.module.css";

/** Account lives behind the address control on the right, so it is not repeated here. */
const NAV = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/cards", label: "Cards", icon: CardsIcon },
  { href: "/approvals", label: "Approvals", icon: ApprovalsIcon },
  { href: "/activity", label: "Activity", icon: ActivityIcon },
  { href: "/agents", label: "Agents", icon: AgentsIcon },
  { href: "/verify", label: "Verify", icon: VerifyIcon },
] as const;

/** Phones get five: Agents is the one that can wait for a bigger screen. */
const MOBILE_NAV = NAV.filter((n) => n.href !== "/agents");

/** A visitor's header: the page's own sections and the public verifier, not the app's tabs. */
const LANDING_NAV = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#checks", label: "The checks" },
  { href: "/verify", label: "Verify an agent" },
] as const;

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export function Shell({
  title,
  subtitle,
  action,
  hero,
  landing,
  children,
}: {
  /**
   * A string, or a node when part of it is set in the italic accent (<em>). Leave it out
   * when the page brings its own opening, as the landing page does.
   */
  title?: ReactNode;
  subtitle?: string;
  action?: ReactNode;
  /** Display-size heading on ruled ledger lines, for the signed-out front door. */
  hero?: boolean;
  /** The marketing page: a visitor's header and no app tab bar, because it is not the dashboard. */
  landing?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { owner, signOut } = useOwner();
  // Payments waiting on the owner, counted on every screen so a request is never missed.
  const { held } = useHeldPayments(owner && !landing ? listCards(owner).map((c) => c.cardId) : []);
  const waiting = held.length;
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className={s.layout}>
      <header className={s.topbar}>
        <div className={s.topbarInner}>
          <Link href="/" className={s.brand}>
            <Wordmark size={22} />
          </Link>

          <nav className={s.nav}>
            {landing
              ? LANDING_NAV.map(({ href, label }) =>
                  href.startsWith("#") ? (
                    <a key={href} href={href} className={s.navItem}>
                      {label}
                    </a>
                  ) : (
                    <Link key={href} href={href} className={s.navItem}>
                      {label}
                    </Link>
                  ),
                )
              : NAV.map(({ href, label }) => (
                  <Link key={href} href={href} className={`${s.navItem} ${isActive(href) ? s.navActive : ""}`}>
                    {label}
                    {href === "/approvals" && waiting > 0 && <span className={s.count}>{waiting}</span>}
                  </Link>
                ))}
          </nav>

          <div className={s.account}>
            {owner ? (
              <>
                <Link href="/settings" className={`${s.accountChip} ${isActive("/settings") ? s.accountChipActive : ""}`}>
                  <span className={s.avatar} />
                  {short(owner)}
                </Link>
                <button className={s.signOut} onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <Link href="/sign-in" className={s.signIn}>
                Sign in
              </Link>
            )}
          </div>

          <Link href={owner ? "/settings" : "/sign-in"} className={`${s.mobileAccount} ${owner ? s.mobileAddress : ""}`}>
            {owner ? short(owner) : "Sign in"}
          </Link>
        </div>
      </header>

      <main className={`${s.main} ${landing ? s.mainLanding : ""}`}>
        {title && (
          <header className={`${s.header} ${hero ? s.hero : ""}`}>
            {hero && <div className={s.ruled} aria-hidden />}
            <div className={s.headerRow}>
              <div className={s.min0}>
                <h1 className={s.title}>{title}</h1>
                {subtitle && <p className={s.subtitle}>{subtitle}</p>}
              </div>
              {action}
            </div>
          </header>
        )}
        {children}
      </main>

      {!landing && (
        <nav className={s.mobileBar}>
          {MOBILE_NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`${s.mobileItem} ${isActive(href) ? s.mobileActive : ""}`}>
              <span className={s.mobileIcon}>
                <Icon size={19} />
                {href === "/approvals" && waiting > 0 && <span className={s.countDot}>{waiting}</span>}
              </span>
              {label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

export { Mark };
