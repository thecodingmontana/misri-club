CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fixtures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`matchday` integer NOT NULL,
	`leg` integer NOT NULL,
	`home_player_id` integer,
	`away_player_id` integer,
	`bye_player_id` integer,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`home_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`away_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bye_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fixtures_season_idx` ON `fixtures` (`season_id`,`matchday`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`fixture_id` integer,
	`chess_com_url` text NOT NULL,
	`white_player_id` integer NOT NULL,
	`black_player_id` integer NOT NULL,
	`result` text NOT NULL,
	`time_class` text,
	`ended_at` integer NOT NULL,
	`source` text DEFAULT 'auto' NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`white_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`black_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_chess_com_url_unique` ON `games` (`chess_com_url`);--> statement-breakpoint
CREATE INDEX `games_season_idx` ON `games` (`season_id`,`ended_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `games_fixture_idx` ON `games` (`fixture_id`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`display_name` text,
	`avatar` text,
	`joined_at` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_username_unique` ON `players` (`username`);--> statement-breakpoint
CREATE TABLE `season_standings` (
	`season_id` integer NOT NULL,
	`player_id` integer NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`draws` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`season_id`, `player_id`),
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer
);
