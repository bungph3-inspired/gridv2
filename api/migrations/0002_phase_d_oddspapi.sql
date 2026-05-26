ALTER TABLE "markets" DROP CONSTRAINT "uq_markets_natural_key";--> statement-breakpoint
ALTER TABLE "fixtures" ALTER COLUMN "home_team" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "fixtures" ALTER COLUMN "away_team" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "markets" ALTER COLUMN "oddspapi_market_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN "participant1_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN "participant2_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "line" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "is_alt_line" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" DROP COLUMN IF EXISTS "line";--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "uq_markets_fixture_oddspapi_id" UNIQUE("fixture_id","oddspapi_market_id");