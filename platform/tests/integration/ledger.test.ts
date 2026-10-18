import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { ledgerEntries, ledgerTransactions, payouts } from "@/server/db/schema";
import {
  adjustTestBalance,
  getBalance,
  getOrCreateAccount,
  grantTestCoins,
  postTransaction,
  reconcileLedger,
  refundTransaction,
} from "@/server/ledger/service";
import { createUser } from "../support/db-helpers";

async function fundedWallet(amount = 500) {
  const user = await createUser({ role: "customer" });
  await grantTestCoins(user.id);
  expect(await getBalance(user.id, "customer_wallet")).toBe(amount);
  return user;
}

async function chargeOnce(userId: string, key: string, amount: number) {
  return getDb().transaction(async (tx) => {
    const wallet = await getOrCreateAccount(tx, { kind: "customer_wallet", ownerUserId: userId, currency: "TEST_COIN" });
    const platform = await getOrCreateAccount(tx, { kind: "platform_revenue", currency: "TEST_COIN" });
    return postTransaction(tx, {
      idempotencyKey: key,
      kind: "session_charge",
      currency: "TEST_COIN",
      description: "Test",
      entries: [
        { accountId: wallet.id, amount: -amount },
        { accountId: platform.id, amount },
      ],
    });
  });
}

describe("Testguthaben", () => {
  it("schreibt einmal pro Tag simuliertes Guthaben gut", async () => {
    const user = await createUser({ role: "customer" });
    const result = await grantTestCoins(user.id);
    expect(result.amount).toBe(500);
    await expect(grantTestCoins(user.id)).rejects.toMatchObject({ code: "conflict" });
    expect(await getBalance(user.id, "customer_wallet")).toBe(500);

    const [tx] = await getDb().select().from(ledgerTransactions).where(eq(ledgerTransactions.id, result.transactionId));
    expect(tx?.simulated).toBe(true);
    expect(tx?.currency).toBe("TEST_COIN");
  });

  it("Creator und Admins erhalten kein Testguthaben", async () => {
    const creator = await createUser({ role: "creator" });
    const admin = await createUser({ role: "admin" });
    await expect(grantTestCoins(creator.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(grantTestCoins(admin.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("an verschiedenen Tagen erneut möglich, aber nur unterhalb des Höchstsaldos", async () => {
    const user = await createUser({ role: "customer" });
    for (let day = 1; day <= 4; day++) await grantTestCoins(user.id, new Date(`2026-11-0${day}T12:00:00Z`));
    expect(await getBalance(user.id, "customer_wallet")).toBe(2000);
    await expect(grantTestCoins(user.id, new Date("2026-11-05T12:00:00Z"))).rejects.toMatchObject({ code: "invalid_state" });
  });
});

describe("Buchungsjournal", () => {
  it("erzeugt bei wiederholter Anfrage mit gleicher Referenz keine Doppelbuchung", async () => {
    const user = await fundedWallet();
    const first = await chargeOnce(user.id, "charge-abc", 100);
    const second = await chargeOnce(user.id, "charge-abc", 100);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.transactionId).toBe(first.transactionId);
    expect(await getBalance(user.id, "customer_wallet")).toBe(400);
  });

  it("verhindert doppelte Buchungen auch bei parallelen Anfragen", async () => {
    const user = await fundedWallet();
    const results = await Promise.all(Array.from({ length: 8 }, () => chargeOnce(user.id, "parallel-key", 50)));
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(new Set(results.map((r) => r.transactionId)).size).toBe(1);
    expect(await getBalance(user.id, "customer_wallet")).toBe(450);
  });

  it("verhindert Überziehung bei parallelen Belastungen", async () => {
    const user = await fundedWallet(); // 500
    const outcomes = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => chargeOnce(user.id, `concurrent-${i}`, 100)),
    );
    const succeeded = outcomes.filter((o) => o.status === "fulfilled");
    const failed = outcomes.filter((o) => o.status === "rejected");
    expect(succeeded).toHaveLength(5);
    expect(failed).toHaveLength(5);
    for (const failure of failed) {
      expect((failure as PromiseRejectedResult).reason).toMatchObject({ code: "insufficient_funds" });
    }
    expect(await getBalance(user.id, "customer_wallet")).toBe(0);
    expect((await reconcileLedger()).ok).toBe(true);
  });

  it("lehnt unausgeglichene Buchungen ab (Anwendung und Datenbank)", async () => {
    const user = await fundedWallet();
    await expect(
      getDb().transaction(async (tx) => {
        const wallet = await getOrCreateAccount(tx, { kind: "customer_wallet", ownerUserId: user.id, currency: "TEST_COIN" });
        const platform = await getOrCreateAccount(tx, { kind: "platform_revenue", currency: "TEST_COIN" });
        return postTransaction(tx, {
          idempotencyKey: "unbalanced",
          kind: "session_charge",
          currency: "TEST_COIN",
          description: "x",
          entries: [
            { accountId: wallet.id, amount: -10 },
            { accountId: platform.id, amount: 9 },
          ],
        });
      }),
    ).rejects.toThrow(/nicht ausgeglichen/);

    // Direkter SQL-Versuch am Anwendungscode vorbei → Datenbank-Trigger greift beim Commit.
    await expect(
      getDb().transaction(async (tx) => {
        const wallet = await getOrCreateAccount(tx, { kind: "customer_wallet", ownerUserId: user.id, currency: "TEST_COIN" });
        const [t] = await tx
          .insert(ledgerTransactions)
          .values({ idempotencyKey: "raw-unbalanced", kind: "adjustment", currency: "TEST_COIN", simulated: true, description: "x" })
          .returning();
        await tx.insert(ledgerEntries).values({ transactionId: t!.id, accountId: wallet.id, amount: 999, balanceAfter: 999 });
      }),
    ).rejects.toThrow();
    expect(await getBalance(user.id, "customer_wallet")).toBe(500);
  });

  it("Journal ist unveränderlich", async () => {
    await fundedWallet();
    await expect(getDb().execute(sql`UPDATE ledger_entries SET amount = amount * 2`)).rejects.toThrow();
    await expect(getDb().execute(sql`DELETE FROM ledger_transactions`)).rejects.toThrow();
  });

  it("echte Münzen sind im Prototyp gesperrt", async () => {
    const user = await createUser();
    await expect(
      getDb().transaction(async (tx) => {
        const wallet = await getOrCreateAccount(tx, { kind: "customer_wallet", ownerUserId: user.id, currency: "COIN" });
        const clearing = await getOrCreateAccount(tx, { kind: "system_payment_clearing", currency: "COIN" });
        return postTransaction(tx, {
          idempotencyKey: "real-coins",
          kind: "purchase",
          currency: "COIN",
          description: "x",
          entries: [
            { accountId: clearing.id, amount: -100 },
            { accountId: wallet.id, amount: 100 },
          ],
        });
      }),
    ).rejects.toMatchObject({ code: "feature_unavailable" });
  });

  it("Testmünzen können per Datenbank-Constraint nicht ausgezahlt werden", async () => {
    const creator = await createUser({ role: "creator" });
    await expect(
      getDb().insert(payouts).values({ creatorUserId: creator.id, amount: 100, currency: "TEST_COIN", provider: "none" }),
    ).rejects.toThrow();
  });
});

describe("Korrekturen", () => {
  it("Rückerstattung genau einmal, mit Audit-Protokoll", async () => {
    const user = await fundedWallet();
    const admin = await createUser({ role: "admin" });
    const charge = await chargeOnce(user.id, "refund-me", 120);
    await refundTransaction({ originalTransactionId: charge.transactionId, adminUserId: admin.id, reason: "Technisches Problem in der Sitzung" });
    expect(await getBalance(user.id, "customer_wallet")).toBe(500);
    await expect(
      refundTransaction({ originalTransactionId: charge.transactionId, adminUserId: admin.id, reason: "Nochmal erstatten bitte" }),
    ).rejects.toMatchObject({ code: "conflict" });
    const audit = await getDb().execute<{ action: string }>(sql`SELECT action FROM admin_audit_logs`);
    expect(audit.rows.map((r) => r.action)).toEqual(["ledger.refund"]);
    expect((await reconcileLedger()).ok).toBe(true);
  });

  it("manuelle Korrektur verlangt Begründung und erzeugt Audit-Eintrag", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    await expect(
      adjustTestBalance({ adminUserId: admin.id, userId: user.id, amount: 50, reason: "kurz", requestId: "r1" }),
    ).rejects.toMatchObject({ code: "validation" });
    await adjustTestBalance({ adminUserId: admin.id, userId: user.id, amount: 50, reason: "Testfall für Support nachstellen", requestId: "r2" });
    await adjustTestBalance({ adminUserId: admin.id, userId: user.id, amount: 50, reason: "Testfall für Support nachstellen", requestId: "r2" });
    expect(await getBalance(user.id, "customer_wallet")).toBe(50);
    await expect(
      adjustTestBalance({ adminUserId: admin.id, userId: user.id, amount: -80, reason: "Abzug größer als Guthaben", requestId: "r3" }),
    ).rejects.toMatchObject({ code: "insufficient_funds" });
    const audit = await getDb().execute<{ count: string }>(sql`SELECT count(*) FROM admin_audit_logs WHERE action = 'ledger.adjust'`);
    expect(Number(audit.rows[0]?.count)).toBe(1);
  });
});
