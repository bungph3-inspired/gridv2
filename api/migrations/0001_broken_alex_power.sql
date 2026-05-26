CREATE TABLE IF NOT EXISTS "fixtures" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"oddspapi_event_id" text NOT NULL,
	"sport" text NOT NULL,
	"league" text NOT NULL,
	"home_team" text NOT NULL,
	"away_team" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixtures_oddspapi_event_id_unique" UNIQUE("oddspapi_event_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "markets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fixture_id" bigint NOT NULL,
	"market_type" text NOT NULL,
	"period" text DEFAULT 'fulltime' NOT NULL,
	"oddspapi_market_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_markets_natural_key" UNIQUE("fixture_id","market_type","period")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prices" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"market_id" bigint NOT NULL,
	"side" text NOT NULL,
	"odds" numeric(8, 3) NOT NULL,
	"line" numeric(8, 2),
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "markets" ADD CONSTRAINT "markets_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prices" ADD CONSTRAINT "prices_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fixtures_starts_at" ON "fixtures" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fixtures_sport_league" ON "fixtures" USING btree ("sport","league");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fixtures_status" ON "fixtures" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_markets_fixture" ON "markets" USING btree ("fixture_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prices_market_captured" ON "prices" USING btree ("market_id","captured_at");