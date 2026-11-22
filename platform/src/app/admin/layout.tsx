import type { ReactNode } from "react";
import {
  Banknote,
  ClipboardList,
  Flag,
  Gavel,
  LayoutDashboard,
  LifeBuoy,
  Lock,
  Package,
  Radio,
  ReceiptText,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Tags,
  TrendingUp,
  UserCog,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { requireStaff, toActor } from "@/server/auth/current";
import { hasPermission, ROLE_LABELS, type Permission } from "@/server/auth/permissions";
import { DashboardShell, type DashboardNavItem } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";

export const metadata = { robots: { index: false, follow: false } };

const icon = "size-[1.1rem]";
const NAV: (DashboardNavItem & { permission: Permission })[] = [
  { href: "/admin", label: "Übersicht", icon: <LayoutDashboard className={icon} />, exact: true, permission: "admin.access" },
  { href: "/admin/users", label: "Nutzer", icon: <Users className={icon} />, permission: "admin.users.view" },
  { href: "/admin/creators", label: "Creator-Prüfung", icon: <UserRoundCheck className={icon} />, permission: "admin.creators.review" },
  { href: "/admin/reports", label: "Meldungen", icon: <Flag className={icon} />, permission: "admin.reports.manage" },
  { href: "/admin/streams", label: "Live & Sitzungen", icon: <Radio className={icon} />, permission: "admin.streams.manage" },
  { href: "/admin/sanctions", label: "Maßnahmen", icon: <Gavel className={icon} />, permission: "admin.sanctions.manage" },
  { href: "/admin/legal-holds", label: "Beweissicherung", icon: <Lock className={icon} />, permission: "admin.legal_holds.manage" },
  { href: "/admin/support", label: "Support", icon: <LifeBuoy className={icon} />, permission: "admin.support.manage" },
  { href: "/admin/privacy", label: "Datenschutz", icon: <ShieldCheck className={icon} />, permission: "admin.privacy.manage" },
  { href: "/admin/finance", label: "Finanzbericht", icon: <TrendingUp className={icon} />, permission: "admin.finance.reports" },
  { href: "/admin/transactions", label: "Bestellungen & Journal", icon: <ReceiptText className={icon} />, permission: "admin.ledger.view" },
  { href: "/admin/payouts", label: "Auszahlungen", icon: <Banknote className={icon} />, permission: "admin.payouts.manage" },
  { href: "/admin/risk", label: "Risikosignale", icon: <ShieldAlert className={icon} />, permission: "admin.risk.review" },
  { href: "/admin/packages", label: "Münzpakete", icon: <Package className={icon} />, permission: "admin.packages.manage" },
  { href: "/admin/categories", label: "Kategorien", icon: <Tags className={icon} />, permission: "admin.categories.manage" },
  { href: "/admin/settings", label: "Einstellungen", icon: <Settings2 className={icon} />, permission: "admin.settings.manage" },
  { href: "/admin/staff", label: "Mitarbeiter", icon: <UserCog className={icon} />, permission: "admin.staff.manage" },
  { href: "/admin/audit", label: "Audit-Protokoll", icon: <ClipboardList className={icon} />, permission: "admin.audit.view" },
];

/** Mitarbeiterbereich: Mitarbeiterrolle + bestätigte 2FA; Navigation zeigt nur erlaubte Bereiche (Seiten prüfen zusätzlich serverseitig). */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireStaff(undefined, "/admin");
  const actor = toActor(session);
  const nav = NAV.filter((item) => hasPermission(actor, item.permission)).map(({ permission: _permission, ...item }) => item);
  return (
    <DashboardShell
      title="Mitarbeiterbereich"
      subtitle={`${session.user.username} · ${ROLE_LABELS[session.user.role]}`}
      nav={nav}
      accent={<Badge tone="success">2FA bestätigt</Badge>}
    >
      {children}
    </DashboardShell>
  );
}
