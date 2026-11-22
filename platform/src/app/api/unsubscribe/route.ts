import { unsubscribe } from "@/server/email/service";

/** RFC 8058 One-Click-Abmeldung (List-Unsubscribe-Post) für optionale E-Mails. */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const ok = token.length > 0 && token.length < 300 && (await unsubscribe(token));
  return new Response(ok ? "ok" : "invalid", { status: ok ? 200 : 400, headers: { "cache-control": "no-store" } });
}
