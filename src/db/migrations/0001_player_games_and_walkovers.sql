CREATE TABLE "player_games" (
	"player_id" integer NOT NULL,
	"chess_com_url" text NOT NULL,
	"ended_at" timestamp (3) with time zone NOT NULL,
	"time_class" text NOT NULL,
	"rated" boolean NOT NULL,
	"colour" text NOT NULL,
	"outcome" text NOT NULL,
	"rating" integer,
	"opponent" text NOT NULL,
	"opponent_rating" integer,
	"opening" text,
	"pgn" text NOT NULL,
	CONSTRAINT "player_games_player_id_chess_com_url_pk" PRIMARY KEY("player_id","chess_com_url")
);
--> statement-breakpoint
ALTER TABLE "player_games" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN "walkover_winner_id" integer;--> statement-breakpoint
ALTER TABLE "player_games" ADD CONSTRAINT "player_games_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_games_recent_idx" ON "player_games" USING btree ("player_id","ended_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_walkover_winner_id_players_id_fk" FOREIGN KEY ("walkover_winner_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;