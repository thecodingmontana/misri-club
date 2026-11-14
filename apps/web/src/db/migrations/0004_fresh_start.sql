-- Fresh start (owner decision): empty every account and drop the old
-- single-league tables before the competitions model is created.
-- "user" cascades to session, account, passkey, two_factor and chess_accounts.
TRUNCATE "user", "verification", "rate_limit", "app_meta" RESTART IDENTITY CASCADE;--> statement-breakpoint
DROP TABLE "fixtures" CASCADE;--> statement-breakpoint
DROP TABLE "games" CASCADE;--> statement-breakpoint
DROP TABLE "player_games" CASCADE;--> statement-breakpoint
DROP TABLE "players" CASCADE;--> statement-breakpoint
DROP TABLE "season_standings" CASCADE;--> statement-breakpoint
DROP TABLE "seasons" CASCADE;--> statement-breakpoint
DROP TYPE "public"."game_result";--> statement-breakpoint
DROP TYPE "public"."game_source";--> statement-breakpoint
CREATE TYPE "public"."competition_format" AS ENUM('league', 'knockout');--> statement-breakpoint
CREATE TYPE "public"."competition_status" AS ENUM('open', 'running', 'finished');--> statement-breakpoint
CREATE TYPE "public"."competition_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."match_result" AS ENUM('white', 'black', 'draw');--> statement-breakpoint
CREATE TABLE "competition_members" (
	"competition_id" varchar(16) NOT NULL,
	"user_id" varchar(16) NOT NULL,
	"joined_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_members_competition_id_user_id_pk" PRIMARY KEY("competition_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "competition_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" varchar(16) PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"format" "competition_format" NOT NULL,
	"legs" integer DEFAULT 1 NOT NULL,
	"matchday_days" integer DEFAULT 2 NOT NULL,
	"status" "competition_status" DEFAULT 'open' NOT NULL,
	"visibility" "competition_visibility" DEFAULT 'private' NOT NULL,
	"allow_late_entry" boolean DEFAULT false NOT NULL,
	"owner_id" varchar(16) NOT NULL,
	"invite_code" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp (3) with time zone,
	CONSTRAINT "competitions_slug_unique" UNIQUE("slug"),
	CONSTRAINT "competitions_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
ALTER TABLE "competitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "matches" (
	"id" varchar(16) PRIMARY KEY NOT NULL,
	"competition_id" varchar(16) NOT NULL,
	"round" integer NOT NULL,
	"leg" integer DEFAULT 1 NOT NULL,
	"home_user_id" varchar(16),
	"away_user_id" varchar(16),
	"bye_user_id" varchar(16),
	"opens_at" timestamp (3) with time zone NOT NULL,
	"due_at" timestamp (3) with time zone NOT NULL,
	"result" "match_result",
	"white_user_id" varchar(16),
	"game_url" text,
	"ended_at" timestamp (3) with time zone,
	"winner_user_id" varchar(16)
);
--> statement-breakpoint
ALTER TABLE "matches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "competition_members" ADD CONSTRAINT "competition_members_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_members" ADD CONSTRAINT "competition_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_user_id_user_id_fk" FOREIGN KEY ("home_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_user_id_user_id_fk" FOREIGN KEY ("away_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_bye_user_id_user_id_fk" FOREIGN KEY ("bye_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_white_user_id_user_id_fk" FOREIGN KEY ("white_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_user_id_user_id_fk" FOREIGN KEY ("winner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competition_members_user_idx" ON "competition_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "matches_competition_round_idx" ON "matches" USING btree ("competition_id","round");--> statement-breakpoint
