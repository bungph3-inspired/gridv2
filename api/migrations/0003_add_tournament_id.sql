ALTER TABLE "fixtures" ADD COLUMN "tournament_id" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fixtures_tournament" ON "fixtures" USING btree ("tournament_id");