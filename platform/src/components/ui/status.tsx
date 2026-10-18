import { BadgeCheck, CircleDashed, FlaskConical, ShieldAlert, ShieldQuestion } from "lucide-react";
import type { VerificationDisplay } from "@/lib/verification";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";

export type Availability = "offline" | "online" | "live" | "in_private";

const availabilityText: Record<Availability, string> = {
  live: "Live",
  online: "Online",
  in_private: "Im privaten Chat",
  offline: "Offline",
};

/** Live-/Online-Status mit animiertem Indikator. */
export function AvailabilityBadge({ availability, className, overlay }: { availability: Availability; className?: string; overlay?: boolean }) {
  if (availability === "live") {
    return (
      <Badge tone="live" className={cn("uppercase tracking-wide", className)}>
        <span className="size-1.5 animate-live-pulse rounded-full bg-white" aria-hidden="true" />
        {availabilityText.live}
      </Badge>
    );
  }
  const dot =
    availability === "online" ? "bg-success-600" : availability === "in_private" ? "bg-warning-600" : "bg-ink-400";
  return (
    <Badge tone={overlay ? "dark" : "neutral"} className={className}>
      <span className={cn("size-1.5 rounded-full", dot)} aria-hidden="true" />
      {availabilityText[availability]}
    </Badge>
  );
}

export function availabilityLabel(availability: Availability) {
  return availabilityText[availability];
}

/** Verifizierungsstatus – „Verifiziert“ erscheint nur bei echter Anbieterprüfung. */
export function VerificationBadge({ verification, className }: { verification: VerificationDisplay; className?: string }) {
  const icon = verification.isVerified ? (
    <BadgeCheck className="size-3.5" aria-hidden="true" />
  ) : verification.tone === "test" ? (
    <FlaskConical className="size-3.5" aria-hidden="true" />
  ) : verification.tone === "danger" ? (
    <ShieldAlert className="size-3.5" aria-hidden="true" />
  ) : verification.tone === "warning" ? (
    <CircleDashed className="size-3.5" aria-hidden="true" />
  ) : (
    <ShieldQuestion className="size-3.5" aria-hidden="true" />
  );
  return (
    <Badge tone={verification.tone === "success" ? "success" : verification.tone} icon={icon} title={verification.description} className={className}>
      {verification.label}
    </Badge>
  );
}

export function TestProfileBadge({ className }: { className?: string }) {
  return (
    <Badge tone="test" icon={<FlaskConical className="size-3.5" aria-hidden="true" />} className={className} title="Fiktives Profil für die Entwicklung">
      Testprofil
    </Badge>
  );
}
