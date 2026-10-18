import type { ReactNode } from "react";
import { Bell, CalendarClock, LayoutDashboard, LifeBuoy, Settings, Shield, Sparkles, Wallet } from "lucide-react";
import { requireSession } from "@/server/auth/current";
import { getActiveSanctions } from "@/server/moderation/service";
import { resendVerificationAction } from "@/actions/auth";
import { DashboardShell, type DashboardNavItem } from "@/components/layout/dashboard-shell";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { robots: { index: false, follow: false } };

const icon = "size-[1.1rem]";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const session = await requireSession("/account");
  const { user } = session;
  const sanctions = user.status === "suspended" ? await getActiveSanctions(user.id) : [];

  const nav: DashboardNavItem[] = [
    ...(user.role === "customer"
      ? [
          { href: "/account", label: "Übersicht", icon: <LayoutDashboard className={icon} />, exact: true },
          { href: "/account/wallet", label: "Testguthaben", icon: <Wallet className={icon} /> },
          { href: "/account/sessions", label: "Sitzungen", icon: <CalendarClock className={icon} /> },
        ]
      : []),
    { href: "/account/notifications", label: "Benachrichtigungen", icon: <Bell className={icon} /> },
    { href: "/account/support", label: "Support & Meldungen", icon: <LifeBuoy className={icon} /> },
    { href: "/account/settings", label: "Einstellungen", icon: <Settings className={icon} /> },
    { href: "/account/security", label: "Sicherheit", icon: <Shield className={icon} /> },
  ];

  return (
    <DashboardShell
      title="Mein Konto"
      subtitle={<span>Angemeldet als {user.username}</span>}
      nav={nav}
      accent={
        user.role === "creator" ? (
          <ButtonLink href="/studio" size="sm" variant="secondary" icon={<Sparkles className="size-4" aria-hidden="true" />}>
            Zum Creator-Studio
          </ButtonLink>
        ) : user.role === "admin" ? (
          <ButtonLink href="/admin" size="sm" variant="secondary">
            Zum Adminbereich
          </ButtonLink>
        ) : null
      }
    >
      {user.status === "suspended" ? (
        <Alert
          tone="danger"
          title="Dein Konto ist derzeit gesperrt"
          action={<ButtonLink href="/account/support" size="sm" variant="outline">Einspruch einlegen</ButtonLink>}
        >
          {sanctions[0]?.reason ? `Begründung: ${sanctions[0].reason}` : "Details findest du unter Support & Meldungen."}
          {sanctions[0]?.endsAt ? ` Die Sperre endet am ${sanctions[0].endsAt.toLocaleDateString("de-AT")}.` : ""}
        </Alert>
      ) : null}
      {!user.emailVerified ? (
        <Alert tone="warning" title="Bitte bestätige deine E-Mail-Adresse">
          <div className="space-y-2">
            <p>Einige Funktionen (z. B. private Chats, Testguthaben, Meldungen) sind erst danach verfügbar.</p>
            <ActionForm action={resendVerificationAction} submitLabel="Bestätigungslink erneut senden" submitVariant="outline" submitSize="sm" inlineSuccess />
          </div>
        </Alert>
      ) : null}
      {children}
    </DashboardShell>
  );
}
