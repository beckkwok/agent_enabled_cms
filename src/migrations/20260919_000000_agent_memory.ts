import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Long-term agent memory: the `agent_memories` collection (+ embedding/FTS
 * columns), the `memory` value on the agents `capabilities` enum, and the
 * `chat_sessions.summarized_count` watermark for auto-summarisation.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ADD VALUE cannot run inside the same transaction batch as a statement that
  // also uses the new value, so it runs in its own statement.
  await db.execute(sql`ALTER TYPE "public"."enum_agents_capabilities" ADD VALUE 'memory';`)

  await db.execute(sql`
   CREATE TYPE "public"."enum_agent_memories_kind" AS ENUM('fact', 'preference', 'summary');
  CREATE TABLE "agent_memories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"agent_id" integer NOT NULL,
  	"owner_id" integer NOT NULL,
  	"kind" "enum_agent_memories_kind" DEFAULT 'fact' NOT NULL,
  	"content" varchar NOT NULL,
  	"session_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"embedding" vector(1536),
  	"search_tsv" "tsvector"
  );
  ALTER TABLE "chat_sessions" ADD COLUMN "summarized_count" numeric DEFAULT 0;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "agent_memories_id" integer;
  ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "agent_memories_agent_idx" ON "agent_memories" USING btree ("agent_id");
  CREATE INDEX "agent_memories_owner_idx" ON "agent_memories" USING btree ("owner_id");
  CREATE INDEX "agent_memories_session_idx" ON "agent_memories" USING btree ("session_id");
  CREATE INDEX "agent_memories_updated_at_idx" ON "agent_memories" USING btree ("updated_at");
  CREATE INDEX "agent_memories_created_at_idx" ON "agent_memories" USING btree ("created_at");
  CREATE INDEX "agent_memories_embedding_idx" ON "agent_memories" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);
  CREATE INDEX "agent_memories_search_tsv_idx" ON "agent_memories" USING gin ("search_tsv");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_agent_memories_fk" FOREIGN KEY ("agent_memories_id") REFERENCES "public"."agent_memories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_agent_memories_id_idx" ON "payload_locked_documents_rels" USING btree ("agent_memories_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_agent_memories_fk";
  DROP INDEX "payload_locked_documents_rels_agent_memories_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "agent_memories_id";
  DROP TABLE "agent_memories" CASCADE;
  ALTER TABLE "chat_sessions" DROP COLUMN "summarized_count";
  DROP TYPE "public"."enum_agent_memories_kind";`)
  // NB: the 'memory' value added to enum_agents_capabilities is intentionally
  // not removed here — Postgres cannot drop an enum value once it may be used.
}
