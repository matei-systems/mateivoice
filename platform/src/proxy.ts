import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (früher „Middleware“):
 *  - Content-Security-Policy mit Nonce pro Anfrage (Schutz gegen XSS)
 *  - HSTS bei HTTPS
 *  - x-pathname für das Layout (Altershinweis-Ausnahmen)
 *  - optimistische Weiterleitung geschützter Bereiche ohne Sitzungs-Cookie
 *
 * Die eigentliche Autorisierung erfolgt IMMER serverseitig in Layouts,
 * Seiten und Server Actions – nicht hier.
 */

const PROTECTED_PREFIXES = ["/account", "/studio", "/admin", "/sessions"];

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const isHttps = request.nextUrl.protocol === "https:";

  const pathname = request.nextUrl.pathname;
  const hasSessionCookie = request.cookies.has("aurora_session") || request.cookies.has("__Host-aurora_session");
  if (PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) && !hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline-Styles werden für Farbverläufe der Platzhalter benötigt; Skripte bleiben streng.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-pathname", pathname);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (isHttps) response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
