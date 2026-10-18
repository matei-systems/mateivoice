/**
 * Legt ein Admin-Konto an. Es gibt bewusst KEINE öffentliche Admin-Registrierung.
 *
 * Aufruf:  ADMIN_EMAIL=… ADMIN_USERNAME=… ADMIN_PASSWORD=… pnpm admin:create
 * Das Passwort wird nicht geloggt. Beim ersten Login ist die Einrichtung der
 * Zwei-Faktor-Authentifizierung verpflichtend.
 */
import "dotenv/config";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !username || !password) {
    throw new Error("Bitte ADMIN_EMAIL, ADMIN_USERNAME und ADMIN_PASSWORD als Umgebungsvariablen setzen.");
  }
  const { getDb, closeDb } = await import("@/server/db/client");
  const { users, notificationPreferences } = await import("@/server/db/schema");
  const { hashPassword, passwordSchema } = await import("@/server/auth/password");
  const { emailSchema, usernameSchema } = await import("@/server/auth/service");
  const { writeAuditLog } = await import("@/server/audit");

  const parsedPassword = passwordSchema.safeParse(password);
  if (!parsedPassword.success) throw new Error(parsedPassword.error.issues[0]?.message ?? "Ungültiges Passwort");
  const parsedEmail = emailSchema.parse(email);
  const parsedUsername = usernameSchema.parse(username);

  const db = getDb();
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: parsedEmail,
        username: parsedUsername,
        passwordHash: await hashPassword(parsedPassword.data),
        role: "admin",
        emailVerifiedAt: new Date(),
        adultSelfDeclaredAt: new Date(),
      })
      .returning({ id: users.id });
    await tx.insert(notificationPreferences).values({ userId: user!.id });
    await writeAuditLog(tx, { actorUserId: null, action: "admin.created_via_cli", targetType: "user", targetId: user!.id });
  });
  console.log(`Admin-Konto für ${parsedEmail} angelegt. Beim ersten Login muss 2FA eingerichtet werden.`);
  await closeDb();
}

main().catch((error: unknown) => {
  console.error("Fehler:", error instanceof Error ? error.message : error);
  process.exit(1);
});
