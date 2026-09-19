import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Evaluation semantic scorer + gate: `judge` value on the eval-cases `match`
 * enum, `pass_threshold`/`gate_passed` on eval-runs, and `gate_enforced` on
 * agents.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TYPE "public"."enum_eval_cases_match" ADD VALUE 'judge';`)

  await db.execute(sql`
   ALTER TABLE "eval_runs" ADD COLUMN "pass_threshold" numeric DEFAULT 1;
  ALTER TABLE "eval_runs" ADD COLUMN "gate_passed" boolean DEFAULT false;
  ALTER TABLE "agents" ADD COLUMN "gate_enforced" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "agents" DROP COLUMN "gate_enforced";
  ALTER TABLE "eval_runs" DROP COLUMN "gate_passed";
  ALTER TABLE "eval_runs" DROP COLUMN "pass_threshold";`)
  // NB: the 'judge' value added to enum_eval_cases_match is not removed here —
  // Postgres cannot drop an enum value once it may be used.
}
