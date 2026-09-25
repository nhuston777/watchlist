import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Watchlist",
    short_name: "Watchlist",
    description: "Movies and shows to watch, for Me, Dot & Me, and the Fam.",
    start_url: "/",
    display: "standalone",
    background_color: "#16120f",
    theme_color: "#16120f",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
