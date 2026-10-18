import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies, headers } from "next/headers";
import { Suspense, type ReactNode } from "react";
import { brand } from "@/config/platform";
import { isTestMode } from "@/config/env";
import { AGE_COOKIE } from "@/lib/constants";
import { getCurrentSession } from "@/server/auth/current";
import { unreadNotificationCount } from "@/server/notifications/service";
import { AgeGate } from "@/components/layout/age-gate";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { TestModeBanner } from "@/components/layout/test-mode-banner";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const fraunces = localFont({
  src: [
    { path: "./fonts/fraunces-latin-wght-normal.woff2", style: "normal" },
    { path: "./fonts/fraunces-latin-wght-italic.woff2", style: "italic" },
  ],
  variable: "--font-fraunces",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: `${brand.name} – Live & privat, mit Respekt`, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  openGraph: { type: "website", locale: "de_AT", siteName: brand.name },
  // Kennzeichnung für Jugendschutzfilter (Eltern-Software).
  other: { rating: ["adult", "RTA-5042-1996-1400-1577-RTA"] },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#fffbfc",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Seiten, die ohne Altershinweis erreichbar sein müssen (Rechtliches, Hilfe, E-Mail-Links). */
const AGE_GATE_EXEMPT = ["/legal", "/safety", "/leave", "/support", "/verify-email", "/reset-password", "/forgot-password", "/login"];

function isAgeGateExempt(pathname: string) {
  return AGE_GATE_EXEMPT.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [cookieStore, headerList, session] = await Promise.all([cookies(), headers(), getCurrentSession()]);
  const pathname = headerList.get("x-pathname") ?? "/";
  const user = session && !session.mfaPending ? session.user : null;
  const showAgeGate = !user && cookieStore.get(AGE_COOKIE)?.value !== "1" && !isAgeGateExempt(pathname);
  const unread = user ? await unreadNotificationCount(user.id) : 0;

  return (
    <html lang="de-AT" className={`${inter.variable} ${fraunces.variable}`} data-scroll-behavior="smooth">
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only z-[80] rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Zum Inhalt springen
        </a>
        <ToastProvider>
          {isTestMode() ? <TestModeBanner /> : null}
          <div className="flex min-h-dvh flex-col" inert={showAgeGate}>
            <SiteHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter />
            <Suspense>
              <MobileTabBar role={user?.role ?? null} unread={unread} />
            </Suspense>
          </div>
          {showAgeGate ? <AgeGate /> : null}
        </ToastProvider>
      </body>
    </html>
  );
}
