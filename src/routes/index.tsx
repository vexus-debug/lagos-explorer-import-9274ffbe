import { createFileRoute } from "@tanstack/react-router";
import { Game } from "../ui/Game";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "ÈKÓ — Lagos Island Open World" },
      { name: "description", content: "Explore Lagos Island on foot in a stylized low-poly first-person open world built from OpenStreetMap." },
      { property: "og:title", content: "ÈKÓ — Lagos Island Open World" },
      { property: "og:description", content: "Walk the streets of Lagos Island in your browser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Game,
});
