import type { Metadata } from "next";
import QRCode from "qrcode";
import { KeyRound, MonitorSmartphone, ShieldCheck } from "lucide-react";
import {
  changePasswordAction,
  confirmTotpAction,
  disableTotpAction,
  signOutOtherSessionsAction,
  startTotpAction,
} from "@/actions/account";
import { requireSession } from "@/server/auth/current";
import { getPendingTotpEnrollment } from "@/server/auth/service";
import { listUserSessions } from "@/server/auth/session";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Sicherheit" };

export default async function SecurityPage({ searchParams }: PageProps<"/account/security">) {
  const params = await searchParams;
  const session = await requireSession("/account/security");
  const { user } = session;
  const [pending, sessions] = await Promise.all([user.totpEnabled ? null : getPendingTotpEnrollment(user.id), listUserSessions(user.id)]);
  const qrSvg = pending ? await QRCode.toString(pending.uri, { type: "svg", margin: 1, color: { dark: "#2a1d2c", light: "#ffffff" } }) : null;

  return (
    <>
      <PageHeader eyebrow="Konto" title="Sicherheit" description="Passwort, Zwei-Faktor-Authentifizierung und aktive Anmeldungen." />
      {params.mfa === "required" ? (
        <Alert tone="warning" title="Zwei-Faktor-Authentifizierung erforderlich">
          Für den Adminbereich muss die Zwei-Faktor-Authentifizierung eingerichtet sein.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Zwei-Faktor-Authentifizierung (TOTP)"
          description="Zusätzlicher Schutz mit einer Authenticator-App (z. B. Aegis, 2FAS, Google Authenticator)."
          action={user.totpEnabled ? <Badge tone="success" icon={<ShieldCheck className="size-3.5" />}>Aktiv</Badge> : <Badge tone="warning">Nicht aktiv</Badge>}
        />
        <CardBody>
          {user.totpEnabled ? (
            user.role === "admin" ? (
              <p className="text-sm text-ink-700">Für Administratoren ist die Zwei-Faktor-Authentifizierung verpflichtend und kann nicht deaktiviert werden.</p>
            ) : (
              <ActionForm action={disableTotpAction} submitLabel="2FA deaktivieren" submitVariant="outline" className="max-w-md">
                <Field id="totp-disable-password" label="Passwort">
                  <Input id="totp-disable-password" name="password" type="password" autoComplete="current-password" required />
                </Field>
                <Field id="totp-disable-code" label="Aktueller Code">
                  <Input id="totp-disable-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
                </Field>
              </ActionForm>
            )
          ) : pending && qrSvg ? (
            <div className="grid gap-6 md:grid-cols-[12rem_1fr]">
              <div className="rounded-2xl border border-line bg-white p-3" aria-label="QR-Code für die Authenticator-App" role="img" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <div className="space-y-4">
                <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-700">
                  <li>Scanne den QR-Code mit deiner Authenticator-App.</li>
                  <li>
                    Oder gib den Schlüssel manuell ein: <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-xs break-all">{pending.secret}</code>
                  </li>
                  <li>Bestätige mit dem angezeigten 6-stelligen Code.</li>
                </ol>
                <ActionForm action={confirmTotpAction} submitLabel="Bestätigen und aktivieren" className="max-w-xs">
                  <Field id="totp-code" label="Code">
                    <Input id="totp-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className="font-mono tracking-[0.3em]" />
                  </Field>
                </ActionForm>
              </div>
            </div>
          ) : (
            <ActionForm action={startTotpAction} submitLabel="Einrichtung starten" submitIcon={<KeyRound className="size-4" aria-hidden="true" />} />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Passwort ändern" description="Nach der Änderung werden alle anderen Anmeldungen beendet." />
        <CardBody>
          <ActionForm action={changePasswordAction} submitLabel="Passwort ändern" submitVariant="outline" className="max-w-md" resetOnSuccess>
            <Field id="currentPassword" label="Aktuelles Passwort">
              <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
            </Field>
            <Field id="newPassword" label="Neues Passwort" hint="Mindestens 12 Zeichen.">
              <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={12} />
            </Field>
            <Field id="newPasswordConfirm" label="Neues Passwort wiederholen">
              <Input id="newPasswordConfirm" name="newPasswordConfirm" type="password" autoComplete="new-password" required minLength={12} />
            </Field>
          </ActionForm>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Aktive Anmeldungen" action={sessions.length > 1 ? <ActionForm action={signOutOtherSessionsAction} submitLabel="Andere abmelden" submitVariant="outline" submitSize="sm" /> : null} />
        <CardBody>
          <ul className="divide-y divide-line">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <MonitorSmartphone className="mt-0.5 size-5 shrink-0 text-ink-500" aria-hidden="true" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium text-ink-900">{s.userAgent ?? "Unbekanntes Gerät"}</p>
                  <p className="text-xs text-ink-600">
                    Angemeldet {formatDateTime(s.createdAt)} · zuletzt aktiv {formatDateTime(s.lastSeenAt)} · gültig bis {formatDateTime(s.expiresAt)}
                  </p>
                </div>
                {s.id === session.sessionId ? <Badge tone="brand">Diese Sitzung</Badge> : null}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </>
  );
}
