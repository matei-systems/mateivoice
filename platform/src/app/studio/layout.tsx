import type { ReactNode } from "react";
import { BadgeCheck, CalendarClock, Coins, Eye, LayoutDashboard, Landmark, Radio, Tag, UserRoundPen } from "lucide-react";
import { requireRole } from "@/server/auth/current";
import { getOwnProfile } from "@/server/creators/service";
import { DashboardShell, type DashboardNavItem } from "@/components/layout/dashboard-shell";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { AvailabilityBadge } from "@/components/ui/status";

export const metadata = { robots: { index: false, follow: false } };

const icon = "size-[1.1rem]";
const nav: DashboardNavItem[] = [
  { href: "/studio", label: "Übersicht", icon: <LayoutDashboard className={icon} />, exact: true },
  { href: "/studio/live", label: "Live & Anfragen", icon: <Radio className={icon} /> },
  { href: "/studio/profile", label: "Profil", icon: <UserRoundPen className={icon} /> },
  { href: "/studio/pricing", label: "Preise", icon: <Tag className={icon} /> },
  { href: "/studio/sessions", label: "Sitzungen", icon: <CalendarClock className={icon} /> },
  { href: "/studio/earnings", label: "Einnahmen", icon: <Coins className={icon} /> },
  { href: "/studio/payouts", label: "Auszahlungen", icon: <Landmark className={icon} /> },
  { href: "/studio/verification", label: "Verifizierung", icon: <BadgeCheck className={icon} /> },
];

export default async function StudioLayout({ children }: { children: ReactNode }) {
  const session = await requireRole(["creator"], "/studio");
  const own = await getOwnProfile(session.user.id);
  return (
    <DashboardShell
      title="Creator-Studio"
      subtitle={own ? own.profile.displayName : session.user.username}
      nav={nav}
      accent={
        own ? (
          <div className="flex flex-wrap items-center gap-2">
            <AvailabilityBadge availability={own.profile.availability} />
            <ButtonLink href={`/creators/${own.profile.slug}`} size="sm" variant="ghost" icon={<Eye className="size-4" aria-hidden="true" />}>
              Profil ansehen
            </ButtonLink>
          </div>
        ) : null
      }
    >
      {session.user.status === "suspended" ? (
        <Alert tone="danger" title="Dein Konto ist gesperrt" action={<ButtonLink href="/account/support" size="sm" variant="outline">Details & Einspruch</ButtonLink>} />
      ) : null}
      {!session.user.emailVerified ? (
        <Alert tone="warning" title="E-Mail-Adresse noch nicht bestätigt" action={<ButtonLink href="/account" size="sm" variant="outline">Bestätigen</ButtonLink>}>
          Profil einreichen, Verifizierung und Live-Funktionen sind erst danach möglich.
        </Alert>
      ) : null}
      {children}
    </DashboardShell>
  );
}
