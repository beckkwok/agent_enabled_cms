import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_agents_safety_mode" AS ENUM('off', 'monitor', 'enforce');
  ALTER TABLE "agents" ADD COLUMN "safety_mode" "enum_agents_safety_mode" DEFAULT 'monitor';
  ALTER TABLE "agent_runs" ADD COLUMN "flagged" boolean DEFAULT false;
  ALTER TABLE "agent_runs" ADD COLUMN "flag_reasons" varchar;
  CREATE INDEX "agents_safety_mode_idx" ON "agents" USING btree ("safety_mode");
  CREATE INDEX "agent_runs_flagged_idx" ON "agent_runs" USING btree ("flagged");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "agents_safety_mode_idx";
  DROP INDEX "agent_runs_flagged_idx";
  ALTER TABLE "agents" DROP COLUMN "safety_mode";
  ALTER TABLE "agent_runs" DROP COLUMN "flagged";
  ALTER TABLE "agent_runs" DROP COLUMN "flag_reasons";
  DROP TYPE "public"."enum_agents_safety_mode";`)
}
