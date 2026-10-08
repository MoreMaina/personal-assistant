import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Personal Assistant",
    short_name: "Assistant",
    description:
      "My personal study, reading, projects and life assistant.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6efe2",
    theme_color: "#23412F",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}