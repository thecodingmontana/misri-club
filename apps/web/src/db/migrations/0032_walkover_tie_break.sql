ALTER TABLE "competitions" ADD COLUMN "walkover_wins_break_ties" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- competitions that exist keep counting walkover wins in the tie-break, so no table reorders
UPDATE "competitions" SET "walkover_wins_break_ties" = true;
