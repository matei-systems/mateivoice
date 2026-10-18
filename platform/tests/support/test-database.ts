/**
 * Ermittelt die Testdatenbank. Aus Sicherheitsgründen muss der Datenbankname
 * auf "_test" enden – so kann ein Test niemals Entwicklungs- oder
 * Produktionsdaten löschen.
 */
export function testDatabaseUrl(): string {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgres://aurora:aurora_dev_only@localhost:5432/aurora_test";
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(`Testdatenbank muss auf "_test" enden (gefunden: "${name}"). Abbruch zum Schutz der Daten.`);
  }
  return url;
}
