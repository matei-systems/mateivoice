import { runMigrations } from "../../scripts/migrate";
import { testDatabaseUrl } from "./test-database";

export default async function setup() {
  await runMigrations(testDatabaseUrl());
}
