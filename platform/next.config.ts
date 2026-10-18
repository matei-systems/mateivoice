import type { NextConfig } from "next";

/**
 * Sicherheitsheader für alle Antworten. Die Content-Security-Policy mit Nonce
 * wird pro Anfrage in src/proxy.ts gesetzt.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    // Kamera/Mikrofon nur für die eigene Origin (spätere Video-Integration).
    value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

/** Private Bereiche dürfen nicht indexiert werden. */
const privatePaths = [
  "/account/:path*",
  "/studio/:path*",
  "/admin/:path*",
  "/sessions/:path*",
  "/login/:path*",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/dev/:path*",
  "/api/:path*",
  "/media/:path*",
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["pg", "sharp"],
  experimental: {
    serverActions: {
      // Bild-Uploads bis 5 MB (+ Formular-Overhead).
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...privatePaths.map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
    ];
  },
};

export default nextConfig;
