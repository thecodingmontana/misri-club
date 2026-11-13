CREATE TYPE "public"."game_result" AS ENUM('white', 'black', 'draw');--> statement-breakpoint
CREATE TYPE "public"."game_source" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TABLE "app_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_meta" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fixtures" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fixtures_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"season_id" integer NOT NULL,
	"matchday" integer NOT NULL,
	"leg" integer NOT NULL,
	"home_player_id" integer,
	"away_player_id" integer,
	"bye_player_id" integer,
	"opens_at" timestamp (3) with time zone NOT NULL,
	"due_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fixtures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "games" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "games_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"season_id" integer NOT NULL,
	"fixture_id" integer,
	"chess_com_url" text NOT NULL,
	"white_player_id" integer NOT NULL,
	"black_player_id" integer NOT NULL,
	"result" "game_result" NOT NULL,
	"time_class" text,
	"ended_at" timestamp (3) with time zone NOT NULL,
	"source" "game_source" DEFAULT 'auto' NOT NULL,
	CONSTRAINT "games_chess_com_url_unique" UNIQUE("chess_com_url")
);
--> statement-breakpoint
ALTER TABLE "games" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "players" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "players_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"username" text NOT NULL,
	"display_name" text,
	"avatar" text,
	"joined_at" timestamp (3) with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "players_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "players" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "season_standings" (
	"season_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"forfeits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "season_standings_season_id_player_id_pk" PRIMARY KEY("season_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "season_standings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "seasons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"label" text NOT NULL,
	"started_at" timestamp (3) with time zone NOT NULL,
	"ended_at" timestamp (3) with time zone,
	"matchday_days" integer DEFAULT 2 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seasons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_home_player_id_players_id_fk" FOREIGN KEY ("home_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_away_player_id_players_id_fk" FOREIGN KEY ("away_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_bye_player_id_players_id_fk" FOREIGN KEY ("bye_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_white_player_id_players_id_fk" FOREIGN KEY ("white_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_black_player_id_players_id_fk" FOREIGN KEY ("black_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_standings" ADD CONSTRAINT "season_standings_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_standings" ADD CONSTRAINT "season_standings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fixtures_season_idx" ON "fixtures" USING btree ("season_id","matchday");--> statement-breakpoint
CREATE INDEX "fixtures_home_idx" ON "fixtures" USING btree ("home_player_id");--> statement-breakpoint
CREATE INDEX "fixtures_away_idx" ON "fixtures" USING btree ("away_player_id");--> statement-breakpoint
CREATE INDEX "fixtures_due_idx" ON "fixtures" USING btree ("season_id","due_at");--> statement-breakpoint
CREATE INDEX "games_season_idx" ON "games" USING btree ("season_id","ended_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "games_white_idx" ON "games" USING btree ("white_player_id");--> statement-breakpoint
CREATE INDEX "games_black_idx" ON "games" USING btree ("black_player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "games_fixture_idx" ON "games" USING btree ("fixture_id");--> statement-breakpoint
CREATE INDEX "standings_player_idx" ON "season_standings" USING btree ("player_id");