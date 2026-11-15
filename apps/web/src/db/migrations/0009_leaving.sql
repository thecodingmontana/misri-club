CREATE TYPE "public"."leave_rule" AS ENUM('award', 'void', 'keep');--> statement-breakpoint
CREATE TABLE "competition_leavers" (
	"competition_id" varchar(16) NOT NULL,
	"user_id" varchar(16) NOT NULL,
	"left_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_leavers_competition_id_user_id_pk" PRIMARY KEY("competition_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "competition_leavers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "leave_rule" "leave_rule" DEFAULT 'award' NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_leavers" ADD CONSTRAINT "competition_leavers_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_leavers" ADD CONSTRAINT "competition_leavers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;