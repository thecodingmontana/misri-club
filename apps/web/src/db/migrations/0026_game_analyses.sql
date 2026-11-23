CREATE TABLE "game_analyses" (
	"user_id" varchar(16) NOT NULL,
	"game_url" text NOT NULL,
	"scores" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_analyses_user_id_game_url_pk" PRIMARY KEY("user_id","game_url")
);
--> statement-breakpoint
ALTER TABLE "game_analyses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "game_analyses" ADD CONSTRAINT "game_analyses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;