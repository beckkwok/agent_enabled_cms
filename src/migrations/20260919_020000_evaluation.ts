import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Agent evaluation framework: `eval_cases`, `eval_runs`, `eval_results`
 * collections (+ their enums and locked-document relation columns).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_eval_cases_type" AS ENUM('correctness', 'tool-use', 'safety');
  CREATE TYPE "public"."enum_eval_cases_match" AS ENUM('contains', 'exact');
  CREATE TYPE "public"."enum_eval_runs_status" AS ENUM('queued', 'running', 'succeeded', 'failed');
  CREATE TABLE "eval_cases" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"agent_id" integer NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"type" "enum_eval_cases_type" DEFAULT 'correctness' NOT NULL,
  	"match" "enum_eval_cases_match" DEFAULT 'contains',
  	"input" varchar NOT NULL,
  	"expected" varchar,
  	"expect_flagged" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE "eval_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"agent_id" integer NOT NULL,
  	"status" "enum_eval_runs_status" DEFAULT 'queued' NOT NULL,
  	"case_count" numeric DEFAULT 0,
  	"passed" numeric DEFAULT 0,
  	"failed" numeric DEFAULT 0,
  	"score" numeric DEFAULT 0,
  	"completed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE "eval_results" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"eval_run_id" integer NOT NULL,
  	"case_id" integer NOT NULL,
  	"agent_id" integer,
  	"agent_run_id" integer,
  	"output" varchar,
  	"tool_calls" varchar,
  	"flagged" boolean DEFAULT false,
  	"flag_reasons" varchar,
  	"pass" boolean DEFAULT false,
  	"score" numeric DEFAULT 0,
  	"reasons" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "eval_cases_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "eval_runs_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "eval_results_id" integer;
  ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_eval_run_id_eval_runs_id_fk" FOREIGN KEY ("eval_run_id") REFERENCES "public"."eval_runs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_case_id_eval_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."eval_cases"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_eval_cases_fk" FOREIGN KEY ("eval_cases_id") REFERENCES "public"."eval_cases"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_eval_runs_fk" FOREIGN KEY ("eval_runs_id") REFERENCES "public"."eval_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_eval_results_fk" FOREIGN KEY ("eval_results_id") REFERENCES "public"."eval_results"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "eval_cases_name_idx" ON "eval_cases" USING btree ("name");
  CREATE INDEX "eval_cases_agent_idx" ON "eval_cases" USING btree ("agent_id");
  CREATE INDEX "eval_cases_enabled_idx" ON "eval_cases" USING btree ("enabled");
  CREATE INDEX "eval_cases_updated_at_idx" ON "eval_cases" USING btree ("updated_at");
  CREATE INDEX "eval_cases_created_at_idx" ON "eval_cases" USING btree ("created_at");
  CREATE INDEX "eval_runs_agent_idx" ON "eval_runs" USING btree ("agent_id");
  CREATE INDEX "eval_runs_status_idx" ON "eval_runs" USING btree ("status");
  CREATE INDEX "eval_runs_updated_at_idx" ON "eval_runs" USING btree ("updated_at");
  CREATE INDEX "eval_runs_created_at_idx" ON "eval_runs" USING btree ("created_at");
  CREATE INDEX "eval_results_eval_run_idx" ON "eval_results" USING btree ("eval_run_id");
  CREATE INDEX "eval_results_case_idx" ON "eval_results" USING btree ("case_id");
  CREATE INDEX "eval_results_agent_idx" ON "eval_results" USING btree ("agent_id");
  CREATE INDEX "eval_results_agent_run_idx" ON "eval_results" USING btree ("agent_run_id");
  CREATE INDEX "eval_results_pass_idx" ON "eval_results" USING btree ("pass");
  CREATE INDEX "eval_results_updated_at_idx" ON "eval_results" USING btree ("updated_at");
  CREATE INDEX "eval_results_created_at_idx" ON "eval_results" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_eval_cases_id_idx" ON "payload_locked_documents_rels" USING btree ("eval_cases_id");
  CREATE INDEX "payload_locked_documents_rels_eval_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("eval_runs_id");
  CREATE INDEX "payload_locked_documents_rels_eval_results_id_idx" ON "payload_locked_documents_rels" USING btree ("eval_results_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_eval_cases_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_eval_runs_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_eval_results_fk";
  DROP INDEX "payload_locked_documents_rels_eval_cases_id_idx";
  DROP INDEX "payload_locked_documents_rels_eval_runs_id_idx";
  DROP INDEX "payload_locked_documents_rels_eval_results_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "eval_cases_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "eval_runs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "eval_results_id";
  DROP TABLE "eval_results" CASCADE;
  DROP TABLE "eval_runs" CASCADE;
  DROP TABLE "eval_cases" CASCADE;
  DROP TYPE "public"."enum_eval_runs_status";
  DROP TYPE "public"."enum_eval_cases_match";
  DROP TYPE "public"."enum_eval_cases_type";`)
}
