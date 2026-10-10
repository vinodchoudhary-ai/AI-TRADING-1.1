import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.brand} - XAU/USD & BTC/USD`,
    short_name: SITE.brand,
    description: "Charts and measured, rule-based setups for gold and Bitcoin. Educational only; not investment advice.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f17",
    theme_color: "#0b0f17",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
