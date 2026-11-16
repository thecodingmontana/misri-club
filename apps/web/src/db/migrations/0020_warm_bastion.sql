ALTER TYPE "public"."competition_format" ADD VALUE 'challenge';--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "best_of" integer DEFAULT 1 NOT NULL;