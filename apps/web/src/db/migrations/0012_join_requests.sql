CREATE TABLE "competition_requests" (
	"competition_id" varchar(16) NOT NULL,
	"user_id" varchar(16) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_requests_competition_id_user_id_pk" PRIMARY KEY("competition_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "competition_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "require_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_requests" ADD CONSTRAINT "competition_requests_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_requests" ADD CONSTRAINT "competition_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;