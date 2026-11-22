import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { creatorProfiles, notifications, users } from "@/server/db/schema";
import { grantTestCoins } from "@/server/ledger/service";
import {
  createAppeal,
  createReport,
  createSanction,
  decideAppeal,
  liftSanction,
  updateReport,
} from "@/server/moderation/service";
import { addUserMessage, createSupportTicket, getTicketForUser } from "@/server/support/service";
import { requestPrivateSession, respondToRequest } from "@/server/video/service";
import { validateSessionToken } from "@/server/auth/session";
import { actorOf, createCreator, createSessionFor, createUser } from "../support/db-helpers";


describe("Moderation", () => {
  it("Meldung zu möglichen Minderjährigen ist kritisch und benachrichtigt Admins", async () => {
    const admin = await createUser({ role: "admin" });
    const reporter = await createUser();
    const { profile } = await createCreator();
    const report = await createReport(actorOf(reporter), {
      targetType: "creator_profile",
      targetId: profile.id,
      category: "minor_suspected",
      description: "Die Person wirkt deutlich minderjährig.",
    });
    expect(report.priority).toBe("critical");
    const adminNotifications = await getDb().select().from(notifications).where(eq(notifications.userId, admin.id));
    expect(adminNotifications[0]?.title).toContain("KRITISCHE");
  });

  it("fremde private Sitzungen können nicht über Meldungen ausgespäht werden", async () => {
    const customer = await createUser();
    await grantTestCoins(customer.id);
    const { user: creator, profile } = await createCreator();
    const session = await requestPrivateSession(actorOf(customer), profile.id);
    await respondToRequest(actorOf(creator), session.id, "accept");
    const outsider = await createUser();
    await expect(
      createReport(actorOf(outsider), { targetType: "video_session", targetId: session.id, category: "other", description: "Ich rate eine ID." }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      createReport(actorOf(customer), { targetType: "video_session", targetId: session.id, category: "harassment", description: "Unangemessenes Verhalten." }),
    ).resolves.toBeTruthy();
  });

  it("Sperre: Konto gesperrt, Anmeldungen beendet, Einspruch möglich, Aufhebung stellt wieder her", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();
    const session = await createSessionFor(target);
    await expect(createSanction(admin.id, { userId: target.id, kind: "suspension", reason: "kurz" })).rejects.toMatchObject({ code: "validation" });
    const sanction = await createSanction(admin.id, { userId: target.id, kind: "suspension", reason: "Wiederholte Belästigung anderer Nutzer" });
    const [suspended] = await getDb().select().from(users).where(eq(users.id, target.id));
    expect(suspended?.status).toBe("suspended");
    expect(await validateSessionToken(session.token)).toBeNull();

    const suspendedActor = { ...actorOf(target), status: "suspended" as const };
    await createAppeal(suspendedActor, { sanctionId: sanction.id, message: "Ich bitte um erneute Prüfung, das war ein Missverständnis." });
    await expect(
      createAppeal(suspendedActor, { sanctionId: sanction.id, message: "Noch ein Einspruch zur selben Maßnahme bitte." }),
    ).rejects.toMatchObject({ code: "conflict" });

    const [appeal] = (await getDb().execute<{ id: string }>(sql`SELECT id FROM appeals`)).rows;
    await decideAppeal({ adminUserId: admin.id, appealId: appeal!.id, decision: "overturned", note: "Missverständnis bestätigt, Sperre aufgehoben" });
    const [restored] = await getDb().select().from(users).where(eq(users.id, target.id));
    expect(restored?.status).toBe("active");
    await expect(liftSanction({ adminUserId: admin.id, sanctionId: sanction.id, reason: "Doppelte Aufhebung testen" })).rejects.toMatchObject({
      code: "conflict",
    });
    const audit = await getDb().execute<{ action: string }>(sql`SELECT action FROM admin_audit_logs ORDER BY id`);
    expect(audit.rows.map((r) => r.action)).toEqual(["sanction.suspension", "appeal.overturned"]);
  });

  it("Admins können nicht sanktioniert werden; Einsprüche nur für eigene Maßnahmen", async () => {
    const admin = await createUser({ role: "admin" });
    const otherAdmin = await createUser({ role: "admin" });
    await expect(createSanction(admin.id, { userId: otherAdmin.id, kind: "suspension", reason: "Admin sperren geht nicht" })).rejects.toMatchObject({
      code: "forbidden",
    });
    const target = await createUser();
    const sanction = await createSanction(admin.id, { userId: target.id, kind: "warning", reason: "Hinweis auf Community-Regeln" });
    const stranger = await createUser();
    await expect(
      createAppeal(actorOf(stranger), { sanctionId: sanction.id, message: "Ich lege für jemand anderen Einspruch ein." }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("Profil ausblenden entfernt es aus der öffentlichen Ansicht", async () => {
    const admin = await createUser({ role: "admin" });
    const { user, profile } = await createCreator();
    await createSanction(admin.id, { userId: user.id, kind: "profile_hidden", reason: "Profiltext verstößt gegen Richtlinien" });
    const [row] = await getDb().select().from(creatorProfiles).where(eq(creatorProfiles.id, profile.id));
    expect(row?.reviewStatus).toBe("suspended");
  });

  it("Abschluss einer Meldung verlangt dokumentierte Begründung", async () => {
    const admin = await createUser({ role: "admin" });
    const reporter = await createUser();
    const { profile } = await createCreator();
    const report = await createReport(actorOf(reporter), { targetType: "creator_profile", targetId: profile.id, category: "spam", description: "Wirbt für externe Seiten." });
    await expect(updateReport({ adminUserId: admin.id, reportId: report.id, status: "no_action", note: "" })).rejects.toMatchObject({ code: "validation" });
    await updateReport({ adminUserId: admin.id, reportId: report.id, status: "no_action", note: "Kein Verstoß gegen die Richtlinien festgestellt" });
  });
});

describe("Support", () => {
  it("Gäste brauchen eine E-Mail; Tickets sind nur für den Inhaber sichtbar", async () => {
    const ctx = { ipHash: "support-ip", userAgent: null };
    await expect(createSupportTicket(null, { category: "account", subject: "Hilfe", message: "Ich komme nicht in mein Konto." }, ctx)).rejects.toMatchObject({
      code: "validation",
    });
    await createSupportTicket(null, { category: "account", subject: "Hilfe", message: "Ich komme nicht in mein Konto.", email: "gast@example.test" }, ctx);

    const owner = await createUser();
    const other = await createUser();
    const ticket = await createSupportTicket(actorOf(owner), { category: "technical", subject: "Fehler", message: "Die Seite lädt nicht richtig." }, ctx);
    expect(await getTicketForUser(owner.id, ticket.id)).not.toBeNull();
    expect(await getTicketForUser(other.id, ticket.id)).toBeNull();
    await expect(addUserMessage(other.id, ticket.id, "Fremde Nachricht")).rejects.toMatchObject({ code: "not_found" });
  });
});
