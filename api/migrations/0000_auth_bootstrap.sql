CREATE TABLE IF NOT EXISTS "agents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"username_lower" text NOT NULL,
	"password_hash" text NOT NULL,
	"parent_id" bigint,
	"has_children" boolean DEFAULT false NOT NULL,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"failed_logins" smallint DEFAULT 0 NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "agents_username_lower_unique" UNIQUE("username_lower"),
	CONSTRAINT "master_no_parent" CHECK (("agents"."parent_id" IS NULL) = ("agents"."id" = 1))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"token_hash" "bytea" PRIMARY KEY NOT NULL,
	"agent_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip" "inet"
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agents" ADD CONSTRAINT "agents_parent_id_agents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_agents_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agents_parent" ON "agents" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agents_username_lower" ON "agents" USING btree ("username_lower");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_agent" ON "sessions" USING btree ("agent_id");
--> statement-breakpoint
-- has_children maintenance trigger — AUTH_DESIGN.md §3.3
-- Drizzle doesn't model PG triggers, so hand-appended here.
-- Maintains agents.has_children on the parent row when children are inserted or deleted.
-- No UPDATE handler because reparenting isn't supported in MVP (§3.3 note).
CREATE OR REPLACE FUNCTION agents_set_has_children() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE agents SET has_children = TRUE WHERE id = NEW.parent_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE agents SET has_children = (
      EXISTS (SELECT 1 FROM agents WHERE parent_id = OLD.parent_id AND id <> OLD.id)
    ) WHERE id = OLD.parent_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agents_has_children_after_insert
  AFTER INSERT ON agents FOR EACH ROW EXECUTE FUNCTION agents_set_has_children();
--> statement-breakpoint
CREATE TRIGGER agents_has_children_after_delete
  AFTER DELETE ON agents FOR EACH ROW EXECUTE FUNCTION agents_set_has_children();
