CREATE TABLE "competition_views" (
	"competition_id" varchar(16) NOT NULL,
	"user_id" varchar(16) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	CONSTRAINT "competition_views_competition_id_user_id_pk" PRIMARY KEY("competition_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "competition_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "competition_views" ADD CONSTRAINT "competition_views_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_views" ADD CONSTRAINT "competition_views_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;