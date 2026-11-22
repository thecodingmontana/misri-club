CREATE TYPE "public"."result_source" AS ENUM('chesscom', 'manual');--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "result_source" "result_source" DEFAULT 'chesscom' NOT NULL;