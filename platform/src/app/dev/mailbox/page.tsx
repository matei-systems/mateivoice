import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { Inbox } from "lucide-react";
import { getEnv } from "@/config/env";
import { getDb } from "@/server/db/client";
import { emailOutbox } from "@/server/db/schema";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Entwicklungs-Mailbox", robots: { index: false, follow: false } };

/**
 * NUR ENTWICKLUNG: zeigt gespeicherte (nicht versendete) E-Mails an.
 * In staging/production nicht erreichbar (404).
 */
export default async function DevMailboxPage() {
  const env = getEnv();
  if (!(env.APP_ENV === "development" || env.APP_ENV === "test") || env.EMAIL_PROVIDER !== "dev-outbox") notFound();
  const mails = await getDb().select().from(emailOutbox).orderBy(desc(emailOutbox.createdAt)).limit(50);

  const linkify = (text: string) =>
    text.split(/(https?:\/\/\S+)/g).map((part, index) =>
      /^https?:\/\//.test(part) ? (
        <Link key={index} href={part.replace(env.APP_URL, "") || "/"} className="font-medium break-all text-brand-700 underline">
          {part}
        </Link>
      ) : (
        <span key={index}>{part}</span>
      ),
    );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader eyebrow="Nur Entwicklung" title="Entwicklungs-Mailbox" description="E-Mails werden im Testmodus nur gespeichert und hier angezeigt – nichts wird versendet." />
      <Alert tone="test">Diese Seite existiert nur bei APP_ENV=development/test und ist in Produktion nicht erreichbar.</Alert>
      {mails.length === 0 ? (
        <EmptyState icon={<Inbox className="size-6" aria-hidden="true" />} title="Keine Nachrichten" description="Registriere ein Konto oder fordere einen Passwort-Link an." />
      ) : (
        <ul className="space-y-4">
          {mails.map((mail) => (
            <li key={mail.id} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink-950">{mail.subject}</p>
                <Badge tone="test">{mail.template}</Badge>
              </div>
              <p className="mt-1 text-xs text-ink-600">
                An {mail.toAddress} · {formatDateTime(mail.createdAt)}
              </p>
              <pre className="mt-4 font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink-800">{mail.bodyText ? linkify(mail.bodyText) : "(Inhalt nicht gespeichert)"}</pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
