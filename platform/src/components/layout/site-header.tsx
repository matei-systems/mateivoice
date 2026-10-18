import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { getCurrentSession } from "@/server/auth/current";
import { getBalance } from "@/server/ledger/service";
import { unreadNotificationCount } from "@/server/notifications/service";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { CoinIcon } from "@/components/ui/coins";
import { formatCoins } from "@/lib/utils";
import { MainNav } from "./main-nav";
import { MobileMenu } from "./mobile-menu";
import { UserMenu } from "./user-menu";

export async function SiteHeader() {
  const session = await getCurrentSession();
  const user = session && !session.mfaPending ? session.user : null;
  const [balance, unread] = user
    ? await Promise.all([
        user.role === "customer" ? getBalance(user.id, "customer_wallet") : Promise.resolve(null),
        unreadNotificationCount(user.id),
      ])
    : [null, 0];

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/80 backdrop-blur-xl supports-[backdrop-filter]:bg-canvas/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:gap-6">
        <Logo />
        <MainNav />
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/creators"
            className="hidden size-10 place-items-center rounded-full text-ink-700 transition hover:bg-brand-50 hover:text-brand-700 sm:grid"
            aria-label="Creator suchen"
          >
            <Search className="size-5" aria-hidden="true" />
          </Link>
          {user ? (
            <>
              {balance !== null ? (
                <Link
                  href="/account/wallet"
                  className="hidden items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800 ring-1 ring-inset ring-brand-200 transition hover:bg-brand-100 sm:inline-flex"
                  title="Testguthaben (ohne Geldwert)"
                >
                  <CoinIcon className="size-4" />
                  <span className="tabular-nums">{formatCoins(balance)}</span>
                  <span className="sr-only">Testmünzen</span>
                </Link>
              ) : null}
              <Link
                href="/account/notifications"
                className="relative hidden size-10 place-items-center rounded-full text-ink-700 transition hover:bg-brand-50 hover:text-brand-700 md:grid"
                aria-label={unread > 0 ? `Benachrichtigungen (${unread} ungelesen)` : "Benachrichtigungen"}
              >
                <Bell className="size-5" aria-hidden="true" />
                {unread > 0 ? (
                  <span className="absolute top-1.5 right-1.5 grid min-w-4 animate-pop place-items-center rounded-full bg-brand-600 px-1 text-[0.6rem] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </Link>
              <UserMenu username={user.username} role={user.role} />
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                Anmelden
              </ButtonLink>
              <ButtonLink href="/register" size="sm">
                Registrieren
              </ButtonLink>
            </>
          )}
          <MobileMenu signedIn={!!user} role={user?.role ?? null} />
        </div>
      </div>
    </header>
  );
}
