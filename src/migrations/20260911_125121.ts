import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_agents_capabilities" AS ENUM('knowledge');
  CREATE TYPE "public"."enum_agents_run_access" AS ENUM('public', 'authenticated', 'admin');
  CREATE TYPE "public"."enum_agent_runs_status" AS ENUM('queued', 'running', 'succeeded', 'failed');
  CREATE TYPE "public"."enum_agent_runs_triggered_by" AS ENUM('api', 'queue', 'schedule');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'runAgent');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'runAgent');
  CREATE TABLE "agents_capabilities" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_agents_capabilities",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "agent_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"agent_id" integer NOT NULL,
  	"status" "enum_agent_runs_status" DEFAULT 'queued' NOT NULL,
  	"triggered_by" "enum_agent_runs_triggered_by" DEFAULT 'api' NOT NULL,
  	"input" varchar,
  	"output" varchar,
  	"error" varchar,
  	"session_id" integer,
  	"started_at" timestamp(3) with time zone,
  	"completed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "chat_sessions" ADD COLUMN "agent_id" integer;
  ALTER TABLE "agents" ADD COLUMN "run_access" "enum_agents_run_access" DEFAULT 'authenticated' NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "agent_runs_id" integer;
  ALTER TABLE "agents_capabilities" ADD CONSTRAINT "agents_capabilities_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "agents_capabilities_order_idx" ON "agents_capabilities" USING btree ("order");
  CREATE INDEX "agents_capabilities_parent_idx" ON "agents_capabilities" USING btree ("parent_id");
  CREATE INDEX "agent_runs_agent_idx" ON "agent_runs" USING btree ("agent_id");
  CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status");
  CREATE INDEX "agent_runs_session_idx" ON "agent_runs" USING btree ("session_id");
  CREATE INDEX "agent_runs_updated_at_idx" ON "agent_runs" USING btree ("updated_at");
  CREATE INDEX "agent_runs_created_at_idx" ON "agent_runs" USING btree ("created_at");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_agent_runs_fk" FOREIGN KEY ("agent_runs_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "chat_sessions_agent_idx" ON "chat_sessions" USING btree ("agent_id");
  CREATE INDEX "agents_run_access_idx" ON "agents" USING btree ("run_access");
  CREATE INDEX "payload_locked_documents_rels_agent_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("agent_runs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "agents_capabilities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "agent_runs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs_log" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "agents_capabilities" CASCADE;
  DROP TABLE "agent_runs" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  ALTER TABLE "chat_sessions" DROP CONSTRAINT "chat_sessions_agent_id_agents_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_agent_runs_fk";
  
  DROP INDEX "chat_sessions_agent_idx";
  DROP INDEX "agents_run_access_idx";
  DROP INDEX "payload_locked_documents_rels_agent_runs_id_idx";
  ALTER TABLE "chat_sessions" DROP COLUMN "agent_id";
  ALTER TABLE "agents" DROP COLUMN "run_access";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "agent_runs_id";
  DROP TYPE "public"."enum_agents_capabilities";
  DROP TYPE "public"."enum_agents_run_access";
  DROP TYPE "public"."enum_agent_runs_status";
  DROP TYPE "public"."enum_agent_runs_triggered_by";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";`)
}
