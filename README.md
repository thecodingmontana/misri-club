# Misri Chess Club League II

Season standings, fixtures and all-time records for the Misri chess.com club.
Games are pulled from the chess.com public API and matched to a two-leg
round-robin schedule; player pages run Stockfish in the visitor's browser.

Stack: TanStack Start (React), Drizzle ORM on Supabase Postgres, Better Auth,
deployed to Vercel (`dub1`, next to the database).

## Layout

A pnpm monorepo. `apps/*` are things people run: today only `apps/web`; a
desktop or React Native app joins it later. `packages/*` is for code they
share, once there is a second app to share it with. Vercel builds `apps/web`.

## Setup

```bash
pnpm install          # also copies Stockfish into apps/web/public/stockfish/
pnpm db:migrate
pnpm dev              # http://localhost:3005
```

Put local settings in `apps/web/.env.local`. Without `RESEND_API_KEY`, sign-in
links are printed in the terminal instead of emailed.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres for the app — Supabase's **transaction** pooler (port 6543). |
| `DIRECT_DATABASE_URL` | Postgres for migrations — the **session** pooler (port 5432). Falls back to `DATABASE_URL`. |
| `BETTER_AUTH_SECRET` | Signs sessions. `openssl rand -base64 32`; changing it signs everyone out. |
| `BETTER_AUTH_URL` | The site's address, e.g. `https://mini-chess-club.vercel.app`. |
| `ADMIN_EMAILS` | Comma-separated emails of club admins (verified accounts only). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | "Continue with Google". The button is hidden without them. Redirect URI: `<site>/api/auth/callback/google`. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Sends sign-in links, from e.g. `Misri <noreply@your-domain>` (a domain verified in Resend). |
| `CHESSCOM_CLUB_ID` | chess.com club slug. Default `misri`. |
| `CHESSCOM_USER_AGENT` | User-Agent sent to chess.com. Defaults to one with contact details. |
| `VITE_SITE_URL` | The public site address, e.g. `https://mini-chess-club.vercel.app`. Used for canonical links and share images; set it at build time. |

## Scripts

- `pnpm test` — unit tests (`node --test`, no database needed)
- `pnpm typecheck`, `pnpm check` — TypeScript and Biome
- `pnpm db:generate` — new migration after editing `src/db/schema.ts`
- `pnpm db:migrate` — apply migrations (Vercel runs this on production builds)

## How it works

- **Sync** (`src/server/sync.server.ts`): open pages ask the server every few
  minutes and sync at most once per 10 minutes across all instances; the Sync
  button can sync once a minute. It reads
  each active member's last two monthly archives, stores league games, links
  them to fixtures, and rebuilds standings.
- **Roster**: the club is private, so chess.com won't list its members. The
  roster comes from `src/server/club-roster.ts` plus the admin roster panel.
- **Scoring** (`src/server/standings.ts`): win 3, draw 1, loss 0. A fixture
  that expires unplayed costs both players a point, unless one has left the
  club or an admin awards a walkover.
- **Accounts** (`src/server/auth.server.ts`, Better Auth): sign in with
  Google, an emailed link or a passkey, with optional two-step verification
  (authenticator app or passkey, plus backup codes). Manage it at `/account`.
- **Admin**: accounts listed in `ADMIN_EMAILS`; every mutating server function
  goes through `adminMiddleware` in `src/server/auth.functions.ts`.
- **Train** (`src/routes/train.*`): a hub of free practice, mostly built on
  Lichess:
  - **Puzzles** from the Lichess puzzle API, by theme and difficulty.
  - **Openings**: 13 courses (`src/lib/openings.ts`) checked against the
    Lichess opening data set (CC0, bundled as `public/openings.tsv`), with
    Learn and Drill modes, Lichess cloud evaluations and a search over every
    named opening.
  - **Master games** (`src/lib/masters.ts`): famous games, verified against
    chessgames.com or Wikipedia, with notes, guess-the-move and a Stockfish
    evaluation graph.
  - **Brilliant moves**: a lesson on finding them, linked to the masters.
  - **Play Stockfish** 19 lite in a Web Worker at five strengths.
  - **Progress**: a dashboard of streak, themes and records.
  All training data stays in the visitor's browser.
- **SEO** (`src/lib/seo.ts`): every page sets its title, description,
  canonical link, Open Graph and Twitter tags through `seo()`; `/robots.txt`
  and `/sitemap.xml` are generated server routes, the sitemap listing the
  live roster.
- **Sound** (`src/lib/sound.ts`): cuelume synthesizes interface sounds in the
  browser. Buttons, inputs, tabs and toasts sound through `data-cuelume-*`
  attributes; a top-bar toggle turns them off per browser.
