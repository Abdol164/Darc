import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { OwnerProvider } from "@/lib/owner-context";
import "./globals.css";

/** Serif headings, sans UI, mono for addresses and ledger labels — see globals.css. */
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument" });
const sans = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Darc — spending cards for AI agents",
  description:
    "Issue scoped, revocable, policy-bound payment cards to AI agents. Every attempt, approved or refused, is public on-chain.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <OwnerProvider>{children}</OwnerProvider>
      </body>
    </html>
  );
}
