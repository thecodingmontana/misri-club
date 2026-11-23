# Misri Chess Club League II

Chess leagues, knockouts, groups and 1v1 challenges for clubs and friends.
Each competition takes its results either from chess.com (games are read
from the public API and matched to the fixtures) or from the players (one
reports, the opponent confirms), so clubs that play over the board or
elsewhere can use it too. Train runs Stockfish in the visitor's browser.

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

## API

The API is **`apps/api`**, its own Vercel project (`misri-api`): Hono with GraphQL Yoga at `/graphql`, plus `GET /health`. It
shares the schema and client through **`packages/db`** (`@misri/db`), and
callers send `Authorization: Bearer <token>`. Sign-in lives in
**`packages/auth`** (`@misri/auth`), the one Better Auth setup both apps use:
the web app signs people in at `/api/auth/*` (its pages finish the emailed-link
and two-step flows) and returns a signed token in the `set-auth-token` header;
the API checks it with Better Auth's own `getSession`, and refuses raw or
tampered tokens. The API needs `DATABASE_URL`, `BETTER_AUTH_SECRET` (the web
app's), `BETTER_AUTH_URL` and `ADMIN_EMAILS`. It serves `me`,
`myCompetitions`, `openCompetitions`, `competition(slug)` and
`player(username)`, with the web app's access rules. The reads and the rules
behind them (access, standings, brackets, round-robin) live in
**`packages/core`** (`@misri/core`), so both apps run the same code; the
competition page in the web app also refreshes results from chess.com first,
the API reads what's stored. The web app's competition, player and list reads go through the API when
`MISRI_API_URL` is set, via the typed client in **`packages/api-client`**
(`@misri/api-client`), which other apps use too. The web app keeps its own
routes only for auth, cron, version and calendar; it has no GraphQL of its own.

Limits: 120 requests a minute per IP (429 with `Retry-After`), 16 KB bodies,
no batching, and security headers on every response. The GraphQL endpoint
runs the protections in
**`packages/graphql`** (`@misri/graphql`): CSRF prevention (a GET or a
form-encoded POST needs an `x-graphql-yoga-csrf` header; JSON POSTs pass),
GraphQL Armor (depth 6, 5 aliases, 5 directives, 500 tokens, a cost limit, no
"did you mean" hints), at most 5 top-level fields per request, and no
introspection or GraphiQL in production. Run it locally with
`pnpm --filter @misri/api dev` (port 8787).

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres for the app — Supabase's **transaction** pooler (port 6543). |
| `DIRECT_DATABASE_URL` | Postgres for migrations — the **session** pooler (port 5432). Falls back to `DATABASE_URL`. |
| `BETTER_AUTH_SECRET` | Signs sessions. `openssl rand -base64 32`; changing it signs everyone out. |
| `BETTER_AUTH_URL` | The site's address, e.g. `https://misri-chess-club.vercel.app`. |
| `ADMIN_EMAILS` | Comma-separated emails of club admins (verified accounts only). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | "Continue with Google". The button is hidden without them. Redirect URI: `<site>/api/auth/callback/google`. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Sends sign-in links, from e.g. `Misri <noreply@your-domain>` (a domain verified in Resend). |
| `CHESSCOM_USER_AGENT` | User-Agent sent to chess.com. Defaults to one with contact details. |
| `VITE_SITE_URL` | The public site address, e.g. `https://misri-chess-club.vercel.app`. Used for canonical links and share images; set it at build time. |
| `MISRI_API_URL` | The API (`https://misri-api.vercel.app`). When set, the web app's competition, player and competition-list reads go through it as the signed-in visitor; unset, it reads the database directly (local runs, tests, and a one-step rollback). |
| `INTERNAL_API_SECRET` | Shared with the API project, so the API rate-limits each visitor rather than the web server. Any long random string. |

## Scripts

- `pnpm test` — unit tests (`node --test`, no database needed)
- `pnpm --filter @misri/api test:db` — the API's reads and access rules against
  the local database
- `pnpm --filter @misri/web test:db` — whole flows (knockout, leaving,
  seeding, early rounds, time controls) against the local Docker database;
  refuses any non-local `DATABASE_URL`
- `pnpm typecheck`, `pnpm check` — TypeScript and Biome
- `pnpm db:generate` — new migration after editing `src/db/schema.ts`
- `pnpm db:migrate` — apply migrations (Vercel runs this on production builds)
  Production migrates after a successful build, before the new deployment goes
  live, so the old deployment briefly runs on the new schema. Keep migrations
  additive (add columns/tables; backfill; drop only in a later deploy once no
  code reads the old shape).

## How it works

- **Competitions** (`src/server/competitions.server.ts`,
  `membership.server.ts`): anyone creates a league (round robin, one or two
  legs) or a knockout, shares the invite link, and starts it. The organiser
  picks where results come from (chess.com, or reported by the players), the
  scoring, what an unplayed game counts as, what happens when a player
  leaves, a player cap and join approvals.
- **Results** (`src/server/results.server.ts`): a running chess.com
  competition reads its players' chess.com monthly archives at most once per
  five minutes (on a
  page view, the app's background refresh, or the cron), finds the game
  between the two players inside the match window, then advances: the next
  knockout round, or the finish and the champion. In any competition a player
  can report a result and their opponent confirms or disputes it (a dispute
  goes to the organiser); competitions tracked this way are never synced. The
  organiser can enter a result, award a walkover, call a match off, extend it
  or reopen it.
- **Scoring** (`src/server/standings.ts`): the organiser's points per win,
  draw and loss (3/1/0 by default) and their unplayed-game rule.
- **Notifications** (`src/server/notifications.server.ts`): web push plus an
  inbox copy. `/api/cron/deadlines` (Vercel Cron, `Authorization: Bearer
  $CRON_SECRET`) syncs results and reminds players a day before a deadline.
- **Accounts** (`src/server/auth.server.ts`, Better Auth): sign in with
  Google, an emailed link or a passkey, with optional two-step verification
  (authenticator app or passkey, plus backup codes). Manage it at `/account`.
  Onboarding asks for a name, then a chess.com account (verified with a code
  in its profile) or a skip; chess.com is required only to create or join a
  chess.com competition and for Train's game analysis.
- **Access** (`src/lib/access.ts`): guest, player, member and organiser roles
  decide who may see and change what; accounts in `ADMIN_EMAILS` are site
  admins. Every server function checks it.
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
