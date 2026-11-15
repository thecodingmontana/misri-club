ALTER TABLE "competitions" ADD COLUMN "finished_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "champion_user_id" varchar(16);--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "synced_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "voided" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_champion_user_id_user_id_fk" FOREIGN KEY ("champion_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;