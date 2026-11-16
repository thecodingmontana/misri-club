ALTER TYPE "public"."competition_format" ADD VALUE 'groups';--> statement-breakpoint
ALTER TABLE "competition_members" ADD COLUMN "group_no" integer;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "group_count" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "advancing" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "group_no" integer;