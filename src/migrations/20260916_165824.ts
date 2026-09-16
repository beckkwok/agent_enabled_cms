import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_guardrails_direction" AS ENUM('input', 'output', 'both');
  CREATE TYPE "public"."enum_guardrails_action" AS ENUM('flag', 'block', 'redact');
  CREATE TABLE "guardrails" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"direction" "enum_guardrails_direction" DEFAULT 'both',
  	"action" "enum_guardrails_action" DEFAULT 'flag',
  	"pattern" varchar NOT NULL,
  	"flags" varchar DEFAULT 'i',
  	"replacement" varchar DEFAULT '[REDACTED]',
  	"agent_id" integer,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "guardrails_id" integer;
  ALTER TABLE "guardrails" ADD CONSTRAINT "guardrails_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "guardrails_name_idx" ON "guardrails" USING btree ("name");
  CREATE INDEX "guardrails_enabled_idx" ON "guardrails" USING btree ("enabled");
  CREATE INDEX "guardrails_agent_idx" ON "guardrails" USING btree ("agent_id");
  CREATE INDEX "guardrails_updated_at_idx" ON "guardrails" USING btree ("updated_at");
  CREATE INDEX "guardrails_created_at_idx" ON "guardrails" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_guardrails_fk" FOREIGN KEY ("guardrails_id") REFERENCES "public"."guardrails"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_guardrails_id_idx" ON "payload_locked_documents_rels" USING btree ("guardrails_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "guardrails" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "guardrails" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_guardrails_fk";
  
  DROP INDEX "payload_locked_documents_rels_guardrails_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "guardrails_id";
  DROP TYPE "public"."enum_guardrails_direction";
  DROP TYPE "public"."enum_guardrails_action";`)
}
