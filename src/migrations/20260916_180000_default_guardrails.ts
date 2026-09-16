import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Default (framework) guardrail rules — financial/PII patterns that are not
 * covered by the built-in heuristics. Applications can edit/disable these and
 * add their own in the `Guardrails` collection.
 *
 * Data-only migration: no schema change (the snapshot is unchanged).
 */
const DEFAULT_RULES = [
  { name: 'credit-card', pattern: '\\b(?:\\d[ -]?){13,16}\\b' },
  { name: 'us-ssn', pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b' },
  { name: 'iban', pattern: '\\b[A-Z]{2}\\d{2}[A-Z0-9]{11,30}\\b' },
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    INSERT INTO "guardrails"
      ("name", "enabled", "direction", "action", "pattern", "flags", "replacement", "updated_at", "created_at")
    SELECT
      v."name",
      v."enabled",
      v."direction"::"enum_guardrails_direction",
      v."action"::"enum_guardrails_action",
      v."pattern",
      v."flags",
      v."replacement",
      now(),
      now()
    FROM (VALUES
      ('credit-card', true, 'both', 'redact', '\b(?:\d[ -]?){13,16}\b', 'g', '[REDACTED]'),
      ('us-ssn', true, 'both', 'redact', '\b\d{3}-\d{2}-\d{4}\b', 'g', '[REDACTED]'),
      ('iban', true, 'both', 'redact', '\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b', 'g', '[REDACTED]')
    ) AS v("name", "enabled", "direction", "action", "pattern", "flags", "replacement")
    WHERE NOT EXISTS (SELECT 1 FROM "guardrails" g WHERE g."name" = v."name");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "guardrails"
    WHERE "name" IN (${sql.join(DEFAULT_RULES.map((r) => sql`${r.name}`), sql`, `)});
  `)
}
