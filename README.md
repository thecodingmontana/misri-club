# Misri Chess Club

Chess leagues, knockouts, groups and 1v1 challenges for clubs and friends,
with free training built in.

**Live:** [misri-chess-club.vercel.app](https://misri-chess-club.vercel.app)

- **Competitions:** round robin (one or two legs), knockouts, groups and
  1v1 challenges, with invite links, join approvals, scoring and leave rules
  set by the organiser.
- **Results from chess.com or from the players:** games are read from
  chess.com's public API and matched to the fixtures, or one player reports
  and the opponent confirms, so clubs playing over the board can use it too.
- **Train:** Lichess puzzles by theme, 13 opening courses, famous master
  games, a brilliant-moves lesson, Stockfish 19 at five strengths and a
  progress dashboard. The engine runs on your device.
- **Works offline:** an installable app (PWA) that keeps your competitions,
  inbox and training on the device, syncs your data with PowerSync and sends
  what you did offline once you're back.
- **Notifications:** web push and an inbox, deadline reminders and a
  calendar feed of your matches.

## Stack

TanStack Start (React) on Vercel, Drizzle ORM on Supabase Postgres, Better
Auth (Google, emailed links, passkeys, two-step), a Hono + GraphQL Yoga API,
PowerSync for on-device sync, and Stockfish (WebAssembly) in the browser.

## Repository

A pnpm monorepo:

| Path | What it is |
| --- | --- |
| `apps/web` | The site and installable app (TanStack Start). |
| `apps/api` | The API: Hono with GraphQL Yoga at `/graphql`, its own Vercel project. |
| `packages/core` | Shared reads, rules and every write (`actions.ts`): access, standings, brackets, round robin. |
| `packages/db` | The Drizzle schema and database client. |
| `packages/auth` | The one Better Auth setup both apps use. |
| `packages/api-client` | A typed client for the API, for any app. |
| `packages/graphql` | The API's GraphQL protections. |

## Getting started

Needs Node 24, pnpm and a Postgres database.

```bash
pnpm install          # also copies Stockfish into apps/web/public/stockfish/
cp apps/web/.env.example apps/web/.env.local   # then fill it in
pnpm db:migrate
pnpm dev              # http://localhost:3005
```

Without `RESEND_API_KEY`, sign-in links are printed in the terminal instead
of emailed. Run the API with `pnpm --filter @misri/api dev` (port 8787).

## API

Every write a player can make (create, join, start, report a result, decide
a match, rename, leave, …) is one entry in `packages/core/src/actions.ts`,
with its input check, rate limit and the call that does it. The API exposes
each as a GraphQL mutation (`renameCompetition(input: JSON): JSON` and so on,
signed in only), and the web app's server functions run the same actions,
through the API when `MISRI_API_URL` is set. Callers send
`Authorization: Bearer <token>`; messages meant for the player pass through,
anything else is masked.

Reads: `me`, `myCompetitions`, `openCompetitions`, `competition(slug)`,
`player(username)` and the player's own inbox, games and analyses.

Limits: 120 requests a minute per IP, 16 KB bodies, no batching, depth 6,
5 aliases, 500 tokens, at most 5 top-level fields, CSRF prevention and no
introspection in production. The API needs `DATABASE_URL`,
`BETTER_AUTH_SECRET` (the web app's), `BETTER_AUTH_URL`, `ADMIN_EMAILS`,
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `EMAIL_FROM`.

## Offline and sync

- The service worker (`apps/web/public/sw.js`) keeps the app's files, the
  pages you open, your competitions and Train for offline use.
- PowerSync keeps a copy of your competitions, inbox and analyses on the
  device (`apps/web/src/lib/sync`). Better Auth issues its short-lived
  tokens (`/api/auth/token`, keys at `/api/auth/jwks`).
- Changes made offline (reading the inbox, saving an analysis, reporting a
  result, answering a report or a join request, giving a walkover) wait in
  PowerSync's upload queue and run through the same actions once online.

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

Paths below are under `apps/web`.

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

## Contributing

Issues and pull requests are welcome. Commits follow
[Conventional Commits](https://www.conventionalcommits.org) (commitlint checks
them), and `pnpm typecheck`, `pnpm check` and `pnpm test` should pass.

## Licence

[MIT](LICENSE)
