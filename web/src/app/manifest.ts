import type { MetadataRoute } from "next";

/** Lets people add Osmo to their Home Screen and open it full screen, like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Osmo",
    short_name: "Osmo",
    description: "Pay friends in stocks and crypto, on Monad.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3eee5",
    theme_color: "#f3eee5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
