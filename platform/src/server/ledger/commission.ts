/**
 * Provisionsberechnung in ganzen Münzen (reine Funktion, ohne Gleitkomma).
 *
 * VORLÄUFIGE REGEL (siehe config/platform.ts → commission):
 *   creatorShare = floor(gross × (10000 − platformBps) / 10000)
 *   platformShare = gross − creatorShare
 * Damit ergibt die Summe immer exakt den Brutto-Münzverbrauch.
 */
export type CommissionSplit = { gross: number; platformShare: number; creatorShare: number; platformBps: number };

export function splitCommission(gross: number, platformBps: number): CommissionSplit {
  if (!Number.isSafeInteger(gross) || gross < 0) throw new RangeError("gross muss eine nicht-negative Ganzzahl sein");
  if (!Number.isInteger(platformBps) || platformBps < 0 || platformBps > 10_000) {
    throw new RangeError("platformBps muss zwischen 0 und 10000 liegen");
  }
  const creatorShare = Number((BigInt(gross) * BigInt(10_000 - platformBps)) / 10_000n);
  return { gross, platformShare: gross - creatorShare, creatorShare, platformBps };
}

/** Basispunkte als Prozent-Text, z. B. 3000 → "30 %" */
export function formatBps(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const fraction = bps % 100;
  return fraction === 0 ? `${whole} %` : `${whole},${fraction.toString().padStart(2, "0").replace(/0$/, "")} %`;
}
