"use client";

import { Bell, CalendarClock, LayoutDashboard, LogOut, Settings, Shield, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { Dropdown, type DropdownItem } from "@/components/ui/dropdown";
import { PlaceholderPortrait } from "@/components/ui/avatar";

const roleLabel = { customer: "Kunde", creator: "Creator", admin: "Administrator" } as const;

export function UserMenu({ username, role }: { username: string; role: "customer" | "creator" | "admin" }) {
  const icon = "size-4 text-ink-500";
  const roleItems: DropdownItem[] =
    role === "admin"
      ? [{ type: "link", href: "/admin", label: "Adminbereich", icon: <ShieldCheck className={icon} /> }]
      : role === "creator"
        ? [
            { type: "link", href: "/studio", label: "Creator-Studio", icon: <Sparkles className={icon} /> },
            { type: "link", href: "/studio/live", label: "Live & Anfragen", icon: <CalendarClock className={icon} /> },
          ]
        : [
            { type: "link", href: "/account", label: "Mein Bereich", icon: <LayoutDashboard className={icon} /> },
            { type: "link", href: "/account/wallet", label: "Testguthaben", icon: <Wallet className={icon} /> },
            { type: "link", href: "/account/sessions", label: "Sitzungen", icon: <CalendarClock className={icon} /> },
          ];
  return (
    <Dropdown
      label="Benutzermenü öffnen"
      trigger={
        <>
          <PlaceholderPortrait name={username} className="size-8 rounded-full text-[0.7rem]" />
          <span className="hidden max-w-28 truncate text-sm font-medium text-ink-800 xl:inline">{username}</span>
        </>
      }
      items={[
        {
          type: "label",
          label: (
            <span>
              Angemeldet als <strong className="text-ink-900">{username}</strong>
              <br />
              {roleLabel[role]}
            </span>
          ),
        },
        { type: "separator" },
        ...roleItems,
        { type: "link", href: "/account/notifications", label: "Benachrichtigungen", icon: <Bell className={icon} /> },
        { type: "link", href: "/account/settings", label: "Einstellungen", icon: <Settings className={icon} /> },
        { type: "link", href: "/account/security", label: "Sicherheit", icon: <Shield className={icon} /> },
        { type: "separator" },
        { type: "form", action: logoutAction, label: "Abmelden", icon: <LogOut className="size-4" />, danger: true },
      ]}
    />
  );
}
