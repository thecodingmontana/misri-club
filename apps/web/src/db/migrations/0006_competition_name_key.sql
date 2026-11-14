ALTER TABLE "competitions" ADD COLUMN "name_key" text;--> statement-breakpoint
-- Existing rows get their normalized name; a later duplicate keeps its id on the end so the key stays unique.
UPDATE "competitions" AS c SET "name_key" = k.key || CASE WHEN k.n > 1 THEN ' ' || lower(c.id) ELSE '' END
FROM (
  SELECT id, lower(trim(regexp_replace(name, '\s+', ' ', 'g'))) AS key,
    row_number() OVER (PARTITION BY lower(trim(regexp_replace(name, '\s+', ' ', 'g'))) ORDER BY created_at, id) AS n
  FROM "competitions"
) AS k
WHERE k.id = c.id;--> statement-breakpoint
ALTER TABLE "competitions" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_name_key_unique" UNIQUE("name_key");
