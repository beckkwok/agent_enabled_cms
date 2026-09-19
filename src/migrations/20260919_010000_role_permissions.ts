import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Role → permissions: adds the `roles.permissions` select (hasMany) —
 * enum + join table — and grants the default permissions to the seeded
 * `admin`/`user` roles so existing deployments keep current behaviour.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_roles_permissions" AS ENUM('content.write', 'runs.read');
  CREATE TABLE "roles_permissions" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_roles_permissions",
  	"id" serial PRIMARY KEY NOT NULL
  );
  ALTER TABLE "roles_permissions" ADD CONSTRAINT "roles_permissions_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "roles_permissions_order_idx" ON "roles_permissions" USING btree ("order");
  CREATE INDEX "roles_permissions_parent_idx" ON "roles_permissions" USING btree ("parent_id");

  INSERT INTO "roles_permissions" ("order", "parent_id", "value")
  SELECT 0, r."id", v."value"::"enum_roles_permissions"
  FROM "roles" r
  JOIN (VALUES ('content.write'), ('runs.read')) AS v("value") ON true
  WHERE r."name" = 'admin'
    AND NOT EXISTS (
      SELECT 1 FROM "roles_permissions" rp
      WHERE rp."parent_id" = r."id" AND rp."value" = v."value"::"enum_roles_permissions"
    );

  INSERT INTO "roles_permissions" ("order", "parent_id", "value")
  SELECT 0, r."id", 'content.write'::"enum_roles_permissions"
  FROM "roles" r
  WHERE r."name" = 'user'
    AND NOT EXISTS (
      SELECT 1 FROM "roles_permissions" rp
      WHERE rp."parent_id" = r."id" AND rp."value" = 'content.write'::"enum_roles_permissions"
    );`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "roles_permissions" CASCADE;
  DROP TYPE "public"."enum_roles_permissions";`)
}
