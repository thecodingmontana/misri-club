CREATE TYPE "public"."unplayed_rule" AS ENUM('organiser', 'both_forfeit', 'void');--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "unplayed_rule" "unplayed_rule" DEFAULT 'organiser' NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "points" jsonb DEFAULT '{"win":3,"draw":1,"loss":0,"forfeit":-1}'::jsonb NOT NULL;