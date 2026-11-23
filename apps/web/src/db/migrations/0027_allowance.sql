CREATE TABLE "allowance" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "allowance" ENABLE ROW LEVEL SECURITY;