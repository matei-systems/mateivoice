"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { getEnv } from "@/config/env";
import { AGE_COOKIE } from "@/lib/constants";

/** Speichert die Selbstauskunft „18+“ (keine Altersverifikation) für 30 Tage. */
export async function acknowledgeAgeAction(): Promise<void> {
  const store = await cookies();
  store.set(AGE_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().APP_URL.startsWith("https://"),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  refresh();
}
