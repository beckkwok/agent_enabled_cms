import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_agents_tools" AS ENUM('searchKnowledge', 'listContent', 'getContent', 'countContent');
  CREATE TABLE "agents_tools" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_agents_tools",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_search_knowledge" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_list_content" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_get_content" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_count_content" boolean DEFAULT true;
  ALTER TABLE "agents_tools" ADD CONSTRAINT "agents_tools_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "agents_tools_order_idx" ON "agents_tools" USING btree ("order");
  CREATE INDEX "agents_tools_parent_idx" ON "agents_tools" USING btree ("parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "agents_tools" CASCADE;
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_search_knowledge";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_list_content";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_get_content";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_count_content";
  DROP TYPE "public"."enum_agents_tools";`)
}
