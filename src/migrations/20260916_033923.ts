import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_knowledge_index_status" AS ENUM('idle', 'pending', 'processing', 'indexed', 'failed');
  CREATE TYPE "public"."enum__knowledge_v_version_index_status" AS ENUM('idle', 'pending', 'processing', 'indexed', 'failed');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'reindexKnowledge';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'reindexKnowledge';
  ALTER TABLE "knowledge" ADD COLUMN "file_id" integer;
  ALTER TABLE "knowledge" ADD COLUMN "extracted_text" varchar;
  ALTER TABLE "knowledge" ADD COLUMN "index_status" "enum_knowledge_index_status" DEFAULT 'idle';
  ALTER TABLE "knowledge" ADD COLUMN "chunk_count" numeric DEFAULT 0;
  ALTER TABLE "knowledge" ADD COLUMN "index_error" varchar;
  ALTER TABLE "_knowledge_v" ADD COLUMN "version_file_id" integer;
  ALTER TABLE "_knowledge_v" ADD COLUMN "version_extracted_text" varchar;
  ALTER TABLE "_knowledge_v" ADD COLUMN "version_index_status" "enum__knowledge_v_version_index_status" DEFAULT 'idle';
  ALTER TABLE "_knowledge_v" ADD COLUMN "version_chunk_count" numeric DEFAULT 0;
  ALTER TABLE "_knowledge_v" ADD COLUMN "version_index_error" varchar;
  ALTER TABLE "knowledge" ADD CONSTRAINT "knowledge_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_knowledge_v" ADD CONSTRAINT "_knowledge_v_version_file_id_media_id_fk" FOREIGN KEY ("version_file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "knowledge_file_idx" ON "knowledge" USING btree ("file_id");
  CREATE INDEX "knowledge_index_status_idx" ON "knowledge" USING btree ("index_status");
  CREATE INDEX "_knowledge_v_version_version_file_idx" ON "_knowledge_v" USING btree ("version_file_id");
  CREATE INDEX "_knowledge_v_version_version_index_status_idx" ON "_knowledge_v" USING btree ("version_index_status");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "knowledge" DROP CONSTRAINT "knowledge_file_id_media_id_fk";
  
  ALTER TABLE "_knowledge_v" DROP CONSTRAINT "_knowledge_v_version_file_id_media_id_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'runAgent');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'runAgent');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "knowledge_file_idx";
  DROP INDEX "knowledge_index_status_idx";
  DROP INDEX "_knowledge_v_version_version_file_idx";
  DROP INDEX "_knowledge_v_version_version_index_status_idx";
  ALTER TABLE "knowledge" DROP COLUMN "file_id";
  ALTER TABLE "knowledge" DROP COLUMN "extracted_text";
  ALTER TABLE "knowledge" DROP COLUMN "index_status";
  ALTER TABLE "knowledge" DROP COLUMN "chunk_count";
  ALTER TABLE "knowledge" DROP COLUMN "index_error";
  ALTER TABLE "_knowledge_v" DROP COLUMN "version_file_id";
  ALTER TABLE "_knowledge_v" DROP COLUMN "version_extracted_text";
  ALTER TABLE "_knowledge_v" DROP COLUMN "version_index_status";
  ALTER TABLE "_knowledge_v" DROP COLUMN "version_chunk_count";
  ALTER TABLE "_knowledge_v" DROP COLUMN "version_index_error";
  DROP TYPE "public"."enum_knowledge_index_status";
  DROP TYPE "public"."enum__knowledge_v_version_index_status";`)
}
