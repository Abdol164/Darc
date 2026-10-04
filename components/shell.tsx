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
import { ActivityIcon, AgentsIcon, CardsIcon, HomeIcon, VerifyIcon } from "./icons";
import { useOwner } from "@/lib/owner-context";
import s from "./shell.module.css";

/** Account lives behind the address control on the right, so it is not repeated here. */
const NAV = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/cards", label: "Cards", icon: CardsIcon },
  { href: "/activity", label: "Activity", icon: ActivityIcon },
  { href: "/agents", label: "Agents", icon: AgentsIcon },
  { href: "/verify", label: "Verify", icon: VerifyIcon },
] as const;

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export function Shell({
  title,
  subtitle,
  action,
  hero,
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
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { owner, signOut } = useOwner();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className={s.layout}>
      <header className={s.topbar}>
        <div className={s.topbarInner}>
          <Link href="/" className={s.brand}>
            <Wordmark size={22} />
          </Link>

          <nav className={s.nav}>
            {NAV.map(({ href, label }) => (
              <Link key={href} href={href} className={`${s.navItem} ${isActive(href) ? s.navActive : ""}`}>
                {label}
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

      <main className={s.main}>
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

      <nav className={s.mobileBar}>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`${s.mobileItem} ${isActive(href) ? s.mobileActive : ""}`}>
            <Icon size={19} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export { Mark };
