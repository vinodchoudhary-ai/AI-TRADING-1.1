import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";

const base = process.env.APP_URL?.trim().replace(/\/+$/, "");

/** Public pages only. Sitemap URLs must be absolute, so without APP_URL at build time this is empty. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!base) return [];
  const lastModified = new Date(SITE.legalUpdated);
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/signals`, changeFrequency: "hourly", priority: 0.6 },
    { url: `${base}/risk`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
