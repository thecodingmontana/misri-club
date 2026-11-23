import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { FORMAT_LABEL, STATUS_LABEL } from '#/components/competitions'
import { ExternalLink, Trophy } from '#/components/icons'
import { PlayerAvatar, PlayerChip } from '#/components/player-chip'
import { relativeTime } from '#/lib/format'
import { seo } from '#/lib/seo'
import { cn } from '#/lib/utils'
import { getPlayerFn } from '#/server/competitions.functions'
import type { getPlayer, PlayerResult, WinRecord } from '#/server/player.server'

type Page = NonNullable<Awaited<ReturnType<typeof getPlayer>>>

/** A player: their record, their results, and how you do against them. */
export const Route = createFileRoute('/_authed/p/$username')({
  head: () =>
    seo({ title: 'Player', description: 'A player on Misri.', noindex: true }),
  loader: async ({ params }) => {
    const page = await getPlayerFn({ data: { username: params.username } })
    if (!page) throw notFound()
    return page
  },
  component: PlayerPage,
})

const OUTCOME = {
  win: { label: 'W', className: 'bg-win/15 text-foreground' },
  draw: { label: '½', className: 'bg-secondary text-muted-foreground' },
  loss: { label: 'L', className: 'bg-destructive/12 text-destructive' },
  forfeit: { label: 'F', className: 'bg-destructive/12 text-destructive' },
} as const

function PlayerPage() {
  const page: Page = Route.useLoaderData()
  const { player, record, played, headToHead, titles, competitions, recent } =
    page

  return (
    <div className="space-y-6 pt-2">
      <header className="flex flex-col items-center gap-2 text-center">
        <PlayerAvatar
          username={player.name}
          image={player.image}
          className="size-20"
        />
        <h1 className="display text-3xl">{player.name}</h1>
        {player.chessUsername && (
          <a
            href={`https://www.chess.com/member/${encodeURIComponent(player.chessUsername)}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary"
          >
            chess.com profile
            <ExternalLink className="size-3" />
          </a>
        )}
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Tile label="Record" value={tally(record)} hint="W–D–L" />
        <Tile
          label="Titles"
          value={String(titles)}
          hint={titles === 1 ? 'competition won' : 'competitions won'}
        />
        <Tile
          label={player.isYou ? 'Played' : 'You vs them'}
          value={headToHead ? tally(headToHead) : String(played)}
          hint={headToHead ? 'your W–D–L' : 'games, walkovers aside'}
        />
      </div>

      <section>
        <h2 className="display mb-2 px-1 text-lg">Recent results</h2>
        {recent.length === 0 ? (
          <p className="rounded-2xl bg-card px-4 py-5 text-center text-sm text-muted-foreground shadow-card">
            No results yet in competitions you can see.
          </p>
        ) : (
          <ul className="space-y-2">
            {recent.map((r) => (
              <ResultRow key={r.matchId} result={r} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="display mb-2 px-1 text-lg">Competitions</h2>
        {competitions.length === 0 ? (
          <p className="rounded-2xl bg-card px-4 py-5 text-center text-sm text-muted-foreground shadow-card">
            None you can see.
          </p>
        ) : (
          <ul className="space-y-2">
            {competitions.map((c) => (
              <li key={c.slug}>
                <Link
                  to="/c/$slug"
                  params={{ slug: c.slug }}
                  className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-card transition-colors duration-150 hover:bg-secondary"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {c.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {FORMAT_LABEL[c.format]} · {STATUS_LABEL[c.status]}
                    </span>
                  </span>
                  {c.won && (
                    <Trophy
                      className="size-5 shrink-0 text-primary"
                      aria-label="Won it"
                    />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

const tally = (r: WinRecord) => `${r.wins}–${r.draws}–${r.losses}`

function Tile({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-2xl bg-card px-3 py-3 text-center shadow-card">
      <div className="kicker text-[0.6rem]">{label}</div>
      <div className="display numeric mt-0.5 text-xl text-primary">{value}</div>
      <div className="text-[0.65rem] text-muted-foreground">{hint}</div>
    </div>
  )
}

function ResultRow({ result }: { result: PlayerResult }) {
  const look = OUTCOME[result.outcome]
  return (
    <li>
      <Link
        to="/c/$slug"
        params={{ slug: result.slug }}
        className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5 shadow-card transition-colors duration-150 hover:bg-secondary"
      >
        <span
          className={cn(
            'numeric grid size-7 shrink-0 place-items-center rounded-full text-[0.7rem] font-bold',
            look.className,
          )}
          title={result.outcome}
        >
          {look.label}
        </span>
        <span className="min-w-0 flex-1">
          <PlayerChip
            username={result.opponent}
            image={result.opponentImage}
            size="sm"
          />
          <span className="mt-0.5 block truncate text-[0.68rem] text-muted-foreground">
            {result.competition}
          </span>
        </span>
        {result.endedAt && (
          <span
            className="shrink-0 text-[0.62rem] text-muted-foreground"
            suppressHydrationWarning
          >
            {relativeTime(result.endedAt)}
          </span>
        )}
      </Link>
    </li>
  )
}
