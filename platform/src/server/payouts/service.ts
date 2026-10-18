import "server-only";
import { desc, eq } from "drizzle-orm";
import { getEnv } from "@/config/env";
import { getDb } from "@/server/db/client";
import { payouts } from "@/server/db/schema";
import { featureUnavailable } from "@/server/errors";
import { getBalance } from "@/server/ledger/service";

/**
 * Creator-Auszahlungen – vorbereitet, aber im Prototyp NICHT ausführbar.
 *
 * Voraussetzungen für eine Aktivierung (siehe docs/LEGAL-OPEN-QUESTIONS-AT.md):
 *  - zugelassener, für das Geschäftsmodell schriftlich freigegebener Anbieter,
 *  - Creator-Verträge, KYC der Creator beim Anbieter, steuerliche Klärung,
 *  - echte Münzen (COIN) statt Testmünzen. Testmünzen sind per
 *    Datenbank-Constraint niemals auszahlbar.
 */

export type PayoutAvailability = { available: false; reason: string };

/** Im Prototyp immer „nicht verfügbar“ – es gibt bewusst keinen Freischaltpfad. */
export function payoutAvailability(): PayoutAvailability {
  return {
    available: false,
    reason:
      getEnv().PAYOUT_PROVIDER === "none"
        ? "Es ist noch kein zugelassener Auszahlungsanbieter eingerichtet. Testmünzen sind grundsätzlich nicht auszahlbar."
        : "Auszahlungen sind noch nicht freigegeben.",
  };
}

export async function requestPayout(_creatorUserId: string, _amount: number): Promise<never> {
  throw featureUnavailable(payoutAvailability().reason);
}

export async function getPayoutOverview(creatorUserId: string) {
  const [testEarnings, history] = await Promise.all([
    getBalance(creatorUserId, "creator_earnings", "TEST_COIN"),
    getDb().select().from(payouts).where(eq(payouts.creatorUserId, creatorUserId)).orderBy(desc(payouts.createdAt)).limit(20),
  ]);
  return { availability: payoutAvailability(), testEarnings, history };
}
