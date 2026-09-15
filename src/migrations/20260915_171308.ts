import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_knowledge_visibility" AS ENUM('public', 'authenticated', 'role', 'private');
  CREATE TYPE "public"."enum__knowledge_v_version_visibility" AS ENUM('public', 'authenticated', 'role', 'private');
  CREATE TABLE "knowledge_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"roles_id" integer
  );
  
  CREATE TABLE "_knowledge_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"roles_id" integer
  );
  
  ALTER TABLE "knowledge" ADD COLUMN "visibility" "enum_knowledge_visibility" DEFAULT 'authenticated';
  ALTER TABLE "knowledge" ADD COLUMN "owner_id" integer;
  ALTER TABLE "_knowledge_v" ADD COLUMN "version_visibility" "enum__knowledge_v_version_visibility" DEFAULT 'authenticated';
  ALTER TABLE "_knowledge_v" ADD COLUMN "version_owner_id" integer;
  ALTER TABLE "knowledge_rels" ADD CONSTRAINT "knowledge_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."knowledge"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "knowledge_rels" ADD CONSTRAINT "knowledge_rels_roles_fk" FOREIGN KEY ("roles_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_knowledge_v_rels" ADD CONSTRAINT "_knowledge_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_knowledge_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_knowledge_v_rels" ADD CONSTRAINT "_knowledge_v_rels_roles_fk" FOREIGN KEY ("roles_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "knowledge_rels_order_idx" ON "knowledge_rels" USING btree ("order");
  CREATE INDEX "knowledge_rels_parent_idx" ON "knowledge_rels" USING btree ("parent_id");
  CREATE INDEX "knowledge_rels_path_idx" ON "knowledge_rels" USING btree ("path");
  CREATE INDEX "knowledge_rels_roles_id_idx" ON "knowledge_rels" USING btree ("roles_id");
  CREATE INDEX "_knowledge_v_rels_order_idx" ON "_knowledge_v_rels" USING btree ("order");
  CREATE INDEX "_knowledge_v_rels_parent_idx" ON "_knowledge_v_rels" USING btree ("parent_id");
  CREATE INDEX "_knowledge_v_rels_path_idx" ON "_knowledge_v_rels" USING btree ("path");
  CREATE INDEX "_knowledge_v_rels_roles_id_idx" ON "_knowledge_v_rels" USING btree ("roles_id");
  ALTER TABLE "knowledge" ADD CONSTRAINT "knowledge_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_knowledge_v" ADD CONSTRAINT "_knowledge_v_version_owner_id_users_id_fk" FOREIGN KEY ("version_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "knowledge_visibility_idx" ON "knowledge" USING btree ("visibility");
  CREATE INDEX "knowledge_owner_idx" ON "knowledge" USING btree ("owner_id");
  CREATE INDEX "_knowledge_v_version_version_visibility_idx" ON "_knowledge_v" USING btree ("version_visibility");
  CREATE INDEX "_knowledge_v_version_version_owner_idx" ON "_knowledge_v" USING btree ("version_owner_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "knowledge_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_knowledge_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "knowledge_rels" CASCADE;
  DROP TABLE "_knowledge_v_rels" CASCADE;
  ALTER TABLE "knowledge" DROP CONSTRAINT "knowledge_owner_id_users_id_fk";
  
  ALTER TABLE "_knowledge_v" DROP CONSTRAINT "_knowledge_v_version_owner_id_users_id_fk";
  
  DROP INDEX "knowledge_visibility_idx";
  DROP INDEX "knowledge_owner_idx";
  DROP INDEX "_knowledge_v_version_version_visibility_idx";
  DROP INDEX "_knowledge_v_version_version_owner_idx";
  ALTER TABLE "knowledge" DROP COLUMN "visibility";
  ALTER TABLE "knowledge" DROP COLUMN "owner_id";
  ALTER TABLE "_knowledge_v" DROP COLUMN "version_visibility";
  ALTER TABLE "_knowledge_v" DROP COLUMN "version_owner_id";
  DROP TYPE "public"."enum_knowledge_visibility";
  DROP TYPE "public"."enum__knowledge_v_version_visibility";`)
}
