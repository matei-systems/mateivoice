/**
 * Schutzmechanismen für Entwicklungsskripte: Sie dürfen niemals gegen eine
 * Produktionsdatenbank laufen.
 */
export function assertDevelopmentDatabase(options: { allowTestDb?: boolean } = {}) {
  const appEnv = process.env.APP_ENV ?? "development";
  if (appEnv === "production" || appEnv === "staging") {
    throw new Error(`Abbruch: Dieses Skript ist nur für Entwicklung/Test gedacht (APP_ENV=${appEnv}).`);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ist nicht gesetzt.");
  const name = new URL(url).pathname.replace(/^\//, "");
  const allowed = name.endsWith("_dev") || (options.allowTestDb && (name.endsWith("_test") || name.endsWith("_e2e")));
  if (!allowed) {
    throw new Error(
      `Abbruch: Datenbank "${name}" ist keine Entwicklungsdatenbank (Name muss auf _dev${options.allowTestDb ? ", _test oder _e2e" : ""} enden).`,
    );
  }
  return name;
}
