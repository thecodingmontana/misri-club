CREATE TABLE "chess_accounts" (
	"id" varchar(16) PRIMARY KEY NOT NULL,
	"user_id" varchar(16) NOT NULL,
	"username" text NOT NULL,
	"verified_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "chess_accounts_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "chess_accounts_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "chess_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chess_accounts" ADD CONSTRAINT "chess_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;