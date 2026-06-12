import * as fs from 'fs';

/**
 * Vacuous-gate guard for DB-dependent suites.
 *
 * Every DB-gated suite uses `describe.skipIf(!DB_EXISTS)` so local runs
 * without data/database.db stay green. In CI that pattern silently skipped
 * EVERY golden contract test for months (the database is gitignored), making
 * the contract gate vacuous. CI sets REQUIRE_DB=1 after building the DB from
 * the committed seeds; if the DB is ever missing again under that flag, the
 * suite must fail loud, not skip.
 */
export function assertDbGateNotVacuous(dbPath: string): void {
  if (process.env['REQUIRE_DB'] === '1' && !fs.existsSync(dbPath)) {
    throw new Error(
      `REQUIRE_DB=1 but ${dbPath} is missing — the DB-gated suites in this file would be ` +
      'silently skipped (vacuous gate). Run "npm run build:db" before the test step.',
    );
  }
}
