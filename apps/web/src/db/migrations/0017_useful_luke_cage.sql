CREATE TYPE "public"."early_rounds" AS ENUM('wait', 'auto', 'organiser');--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "early_rounds" "early_rounds" DEFAULT 'organiser' NOT NULL;