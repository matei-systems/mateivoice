import type { MetadataRoute } from "next";
import { getEnv } from "@/config/env";

// Zur Laufzeit erzeugen (Umgebung/DB erst beim Start bekannt, nicht beim Build).
export const dynamic = "force-dynamic";

/** Private Bereiche werden ausgeschlossen. Außerhalb der Produktion wird gar nicht indexiert. */
export default function robots(): MetadataRoute.Robots {
  const env = getEnv();
  if (env.APP_ENV !== "production") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/account", "/studio", "/admin", "/sessions", "/login", "/register", "/verify-email", "/reset-password", "/forgot-password", "/media", "/api", "/dev"],
      },
    ],
    sitemap: new URL("/sitemap.xml", env.APP_URL).toString(),
  };
}
