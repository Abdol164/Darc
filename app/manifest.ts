import type { MetadataRoute } from "next";

/**
 * Lets Darc be added to a phone's Home Screen. On iPhone that is what makes approval alerts
 * possible: iOS only offers Web Push to sites installed this way.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Darc",
    short_name: "Darc",
    description: "Spending cards for AI agents, on the record.",
    start_url: "/approvals",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#fbfaf7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
