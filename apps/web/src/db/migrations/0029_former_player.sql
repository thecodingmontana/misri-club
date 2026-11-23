-- the owner of a deleted account's played games, so opponents keep their results
INSERT INTO "user" ("id", "name", "email", "email_verified")
VALUES ('former-player', 'A former player', 'former-player@misri.invalid', false)
ON CONFLICT ("id") DO NOTHING;
