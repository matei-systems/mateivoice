import "server-only";
import { adminAuditLogs } from "@/server/db/schema";
import type { Executor } from "@/server/db/client";

export type AuditEntry = {
  actorUserId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  reason?: string;
  /** Nur nicht sensible Metadaten (keine Passwörter, Token, Zahlungs- oder Ausweisdaten). */
  metadata?: Record<string, unknown>;
  ipHash?: string | null;
};

/**
 * Schreibt einen Eintrag in das unveränderliche Audit-Protokoll. Sollte in
 * derselben Transaktion wie die protokollierte Änderung aufgerufen werden, damit
 * keine Änderung ohne Protokoll (und kein Protokoll ohne Änderung) entsteht.
 */
export async function writeAuditLog(executor: Executor, entry: AuditEntry) {
  await executor.insert(adminAuditLogs).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    reason: entry.reason ?? null,
    metadata: entry.metadata ?? {},
    ipHash: entry.ipHash ?? null,
  });
}
