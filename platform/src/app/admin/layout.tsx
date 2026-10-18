import type { ReactNode } from "react";
import { ClipboardList, Flag, Gavel, LayoutDashboard, LifeBuoy, ReceiptText, Settings2, UserRoundCheck, Users } from "lucide-react";
import { requireAdmin } from "@/server/auth/current";
import { DashboardShell, type DashboardNavItem } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";

export const metadata = { robots: { index: false, follow: false } };

const icon = "size-[1.1rem]";
const nav: DashboardNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: <LayoutDashboard className={icon} />, exact: true },
  { href: "/admin/users", label: "Nutzer", icon: <Users className={icon} /> },
  { href: "/admin/creators", label: "Creator-Prüfung", icon: <UserRoundCheck className={icon} /> },
  { href: "/admin/reports", label: "Meldungen", icon: <Flag className={icon} /> },
  { href: "/admin/sanctions", label: "Sanktionen", icon: <Gavel className={icon} /> },
  { href: "/admin/transactions", label: "Transaktionen", icon: <ReceiptText className={icon} /> },
  { href: "/admin/support", label: "Support", icon: <LifeBuoy className={icon} /> },
  { href: "/admin/config", label: "Konfiguration", icon: <Settings2 className={icon} /> },
  { href: "/admin/audit", label: "Audit-Protokoll", icon: <ClipboardList className={icon} /> },
];

/** Adminbereich: serverseitig nur mit Rolle „admin“ und bestätigter 2FA erreichbar. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAdmin("/admin");
  return (
    <DashboardShell title="Administration" subtitle={session.user.username} nav={nav} accent={<Badge tone="success">2FA bestätigt</Badge>}>
      {children}
    </DashboardShell>
  );
}
