# Misri Chess Club League

Season standings, fixtures and all-time records for the Misri chess.com club.
Games are pulled from the chess.com public API and matched to a two-leg
round-robin schedule; player pages run Stockfish in the visitor's browser.

Stack: TanStack Start (React), Drizzle ORM on Supabase Postgres, deployed to
Vercel (`dub1`, next to the database).

## Setup

```bash
pnpm install          # also copies Stockfish into public/stockfish/
pnpm auth:set-password  # prints the ADMIN_PASSWORD_HASH line for .env
pnpm db:migrate
pnpm dev              # http://localhost:3005
```

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres for the app — Supabase's **transaction** pooler (port 6543). |
| `DIRECT_DATABASE_URL` | Postgres for migrations — the **session** pooler (port 5432). Falls back to `DATABASE_URL`. |
| `ADMIN_PASSWORD_HASH` | The admin passphrase hash from `pnpm auth:set-password`. Changing it signs every admin out. |
| `CHESSCOM_CLUB_ID` | chess.com club slug. Default `misri`. |
| `CHESSCOM_USER_AGENT` | User-Agent sent to chess.com. Defaults to one with contact details. |

## Scripts

- `pnpm test` — unit tests (`node --test`, no database needed)
- `pnpm typecheck`, `pnpm check` — TypeScript and Biome
- `pnpm db:generate` — new migration after editing `src/db/schema.ts`
- `pnpm db:migrate` — apply migrations (Vercel runs this on production builds)

## How it works

- **Sync** (`src/server/sync.server.ts`): open pages ask the server every few
  minutes; at most one sync runs per 10 minutes across all instances. It reads
  each active member's last two monthly archives, stores league games, links
  them to fixtures, and rebuilds standings.
- **Roster**: the club is private, so chess.com won't list its members. The
  roster comes from `src/server/club-roster.ts` plus the admin roster panel.
- **Scoring** (`src/server/standings.ts`): win 3, draw 1, loss 0. A fixture
  that expires unplayed costs both players a point, unless one has left the
  club or an admin awards a walkover.
- **Admin**: one shared passphrase; every mutating server function goes through
  `adminMiddleware` in `src/server/auth.functions.ts`.
