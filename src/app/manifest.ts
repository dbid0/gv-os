import type { MetadataRoute } from "next";

// Installable-app manifest. Chrome offers "Install GV OS" from the omnibox;
// the installed window opens standalone with the charcoal chrome.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GV OS",
    short_name: "GV OS",
    description: "The Global Ventures agency OS.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#131316",
    theme_color: "#131316",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
