/**
 * Zustandsautomat für Video-Sitzungen (reine Funktion).
 *
 * requested ──accept──▶ accepted ──start──▶ active ──end──▶ ended
 *     │                    │                   └──fail──▶ failed
 *     ├─decline▶ declined  ├─cancel▶ cancelled
 *     ├─cancel─▶ cancelled ├─expire▶ expired
 *     └─expire─▶ expired   └─fail──▶ failed
 */

export type SessionStatus =
  | "requested"
  | "accepted"
  | "active"
  | "ended"
  | "declined"
  | "cancelled"
  | "expired"
  | "failed";

export type SessionEvent = "accept" | "decline" | "cancel" | "expire" | "start" | "end" | "fail";

const TRANSITIONS: Record<SessionStatus, Partial<Record<SessionEvent, SessionStatus>>> = {
  requested: { accept: "accepted", decline: "declined", cancel: "cancelled", expire: "expired", fail: "failed" },
  accepted: { start: "active", cancel: "cancelled", expire: "expired", fail: "failed" },
  active: { end: "ended", fail: "failed" },
  ended: {},
  declined: {},
  cancelled: {},
  expired: {},
  failed: {},
};

export const OPEN_STATUSES: readonly SessionStatus[] = ["requested", "accepted", "active"];

export function nextStatus(current: SessionStatus, event: SessionEvent): SessionStatus | null {
  return TRANSITIONS[current][event] ?? null;
}

export function isTerminal(status: SessionStatus): boolean {
  return Object.keys(TRANSITIONS[status]).length === 0;
}

/** Abrechenbare Minuten (Prepaid: jede begonnene Minute wird zu Beginn berechnet). */
export function dueMinutes(startedAt: Date, now: Date, intervalSeconds = 60): number {
  const elapsedMs = now.getTime() - startedAt.getTime();
  if (elapsedMs < 0) return 0;
  return Math.floor(elapsedMs / (intervalSeconds * 1000)) + 1;
}
