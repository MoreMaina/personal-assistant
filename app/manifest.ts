import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Personal Assistant",
    short_name: "Assistant",
    description:
      "My personal study, reading, projects and life assistant.",
    start_url: "/",
    display: "standalone",
    background_color: "#edf6f9",
    theme_color: "#edf6f9",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}