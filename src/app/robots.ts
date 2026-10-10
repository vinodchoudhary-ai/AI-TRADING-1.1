import type { MetadataRoute } from "next";

// Set APP_URL when building so the sitemap link is absolute.
const base = process.env.APP_URL?.trim().replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Nothing useful to index: API routes, sign-in/account screens and one-time email links.
      disallow: ["/api/", "/account", "/signin", "/forgot", "/reset", "/verify"],
    },
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
