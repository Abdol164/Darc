import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray package-lock.json above this directory otherwise makes
  // Turbopack guess, and it warns about it.
  turbopack: { root: import.meta.dirname },
  // contracts/ is a Foundry project, not part of the web build.
  outputFileTracingExcludes: { "*": ["./contracts/**"] },
  // Passkeys are bound to the exact hostname that created them, so the app must live at one
  // address. Every other name for the production site redirects to usedarc.site.
  async redirects() {
    return ["www.usedarc.site", "darc-pied.vercel.app", "darc-abdols-projects.vercel.app"].map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: "https://usedarc.site/:path*",
      permanent: host === "www.usedarc.site",
    }));
  },
};

export default nextConfig;
