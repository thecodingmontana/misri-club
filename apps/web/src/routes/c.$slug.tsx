import {
  createFileRoute,
  Link,
  notFound,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { toast } from 'sonner'
import { Spinner } from '#/components/auth'
import {
  Choice,
  FORMAT_LABEL,
  JoinButton,
  STATUS_LABEL,
} from '#/components/competitions'
import { Copy } from '#/components/icons'
import { displayName, FixtureCard } from '#/components/match-card'
import { PlayerChip } from '#/components/player-chip'
import { Button } from '#/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { seo } from '#/lib/seo'
import { useAdmin } from '#/lib/use-admin'
import { cn } from '#/lib/utils'
import {
  getCompetitionFn,
  startCompetitionFn,
  updateCompetitionSettingsFn,
} from '#/server/competitions.functions'
import type { MatchView, StandingRow } from '#/server/competitions.server'

/** A competition: public to read; the organiser manages it from here. */
export const Route = createFileRoute('/c/$slug')({
  loader: async ({ params }) => {
    const data = await getCompetitionFn({ data: { slug: params.slug } })
    if (!data) throw notFound()
    return data
  },
  head: ({ loaderData, params }) =>
    seo({
      title: loaderData?.competition.name ?? 'Competition',
      description: loaderData
        ? `${FORMAT_LABEL[loaderData.competition.format]} on Misri with ${loaderData.members.length} players.`
        : 'A chess competition on Misri.',
      path: `/c/${params.slug}`,
      noindex: loaderData?.competition.visibility !== 'public',
    }),
  component: CompetitionPage,
})

type Data = ReturnType<typeof Route.useLoaderData>

function CompetitionPage() {
  const data = Route.useLoaderData()
  const { competition, members, isOwner, isMember, join } = data
  const { user } = useAdmin()
  const league = competition.format === 'league'

  return (
    <div className="space-y-5 pt-2">
      <header className="text-center">
        <p className="kicker">
          {FORMAT_LABEL[competition.format]} ·{' '}
          {STATUS_LABEL[competition.status]}
        </p>
        <h1 className="display mt-1 text-3xl">{competition.name}</h1>
        <p className="numeric mt-1 text-xs text-muted-foreground">
          {members.length} player{members.length === 1 ? '' : 's'}
          {league && competition.legs === 2 && ' · home & away'} ·{' '}
          {competition.matchdayDays} day
          {competition.matchdayDays === 1 ? '' : 's'} per round
        </p>
      </header>

      {isOwner && <OwnerPanel data={data} />}

      {!isMember &&
        (join.ok ? (
          user ? (
            competition.visibility === 'public' ? (
              <JoinButton slug={competition.slug} label="Join" size="lg" />
            ) : (
              <p className="rounded-2xl bg-card px-4 py-3 text-center text-sm text-muted-foreground shadow-card">
                Invite only. Ask the organiser for the code.
              </p>
            )
          ) : (
            <Button asChild size="lg" className="w-full rounded-xl">
              <Link
                to="/auth/signin"
                search={{ redirect: `/c/${competition.slug}` }}
              >
                Sign in to join
              </Link>
            </Button>
          )
        ) : (
          <p className="rounded-2xl bg-card px-4 py-3 text-center text-sm text-muted-foreground shadow-card">
            {join.reason}
          </p>
        ))}

      <Tabs defaultValue={competition.status === 'open' ? 'players' : 'table'}>
        <TabsList className="w-full">
          <TabsTrigger value="table">
            {league ? 'Table' : 'Bracket'}
          </TabsTrigger>
          <TabsTrigger value="fixtures">Fixtures</TabsTrigger>
          <TabsTrigger value="players">Players</TabsTrigger>
        </TabsList>
        <TabsContent value="table" className="pt-2">
          {league ? <Standings data={data} /> : <Bracket data={data} />}
        </TabsContent>
        <TabsContent value="fixtures" className="pt-2">
          <Fixtures data={data} />
        </TabsContent>
        <TabsContent value="players" className="space-y-2 pt-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between gap-2 rounded-2xl bg-card px-3 py-2.5 shadow-card"
            >
              <PlayerChip username={displayName(member)} image={member.image} />
              {member.id === competition.ownerId && (
                <span className="kicker">Organiser</span>
              )}
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function OwnerPanel({ data }: { data: Data }) {
  const { competition, members } = data
  const router = useRouter()
  const start = useServerFn(startCompetitionFn)
  const update = useServerFn(updateCompetitionSettingsFn)
  const [busy, setBusy] = useState(false)
  const league = competition.format === 'league'

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true)
    try {
      await action()
      await router.invalidate()
      if (done) toast.success(done)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const save = (settings: {
    visibility: 'public' | 'private'
    allowLateEntry: boolean
  }) => run(() => update({ data: { slug: competition.slug, ...settings } }))

  async function copyLink() {
    const link = `${window.location.origin}/join/${competition.inviteCode}`
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Invite link copied')
    } catch {
      toast.error("Couldn't copy. Share the code instead.")
    }
  }

  const canTakePlayers =
    competition.status === 'open' ||
    (league && competition.status === 'running' && competition.allowLateEntry)

  return (
    <section
      aria-label="Organiser"
      className="space-y-4 rounded-2xl bg-card p-4 shadow-card"
    >
      {canTakePlayers && competition.inviteCode && (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="kicker">Invite code</p>
            <p className="display numeric text-2xl tracking-[0.2em]">
              {competition.inviteCode}
            </p>
          </div>
          <Button
            variant="secondary"
            className="rounded-full"
            onClick={copyLink}
          >
            <Copy />
            Copy link
          </Button>
        </div>
      )}

      <Choice
        label="Who can join"
        value={competition.visibility}
        onChange={(visibility) =>
          save({ visibility, allowLateEntry: competition.allowLateEntry })
        }
        options={[
          { value: 'private', label: 'Invite only' },
          { value: 'public', label: 'Anyone' },
        ]}
      />

      {league && competition.status !== 'finished' && (
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={competition.allowLateEntry}
            disabled={busy}
            onChange={(event) =>
              save({
                visibility: competition.visibility,
                allowLateEntry: event.target.checked,
              })
            }
          />
          <span>
            <span className="block font-medium">Allow late entry</span>
            <span className="block text-xs text-muted-foreground">
              Players can still join after it starts.
            </span>
          </span>
        </label>
      )}

      {competition.status === 'open' && (
        <Button
          size="lg"
          className="w-full rounded-xl"
          disabled={busy || members.length < 2}
          onClick={() =>
            run(
              () => start({ data: { slug: competition.slug } }),
              'Started. Fixtures are out.',
            )
          }
        >
          {busy && <Spinner />}
          {members.length < 2 ? 'Start (needs 2 players)' : 'Start'}
        </Button>
      )}
    </section>
  )
}

function Standings({ data }: { data: Data }) {
  const rows: Array<StandingRow> = data.standings ?? []
  if (rows.length === 0 || data.matches.length === 0) {
    return <Empty>The table appears once the league starts.</Empty>
  }
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <table className="numeric w-full text-sm">
        <thead className="kicker">
          <tr className="border-b border-border">
            <th className="w-8 py-2 pl-3 text-left font-semibold">#</th>
            <th className="py-2 text-left font-semibold">Player</th>
            <th className="py-2 text-center font-semibold" title="Wins">
              W
            </th>
            <th className="py-2 text-center font-semibold" title="Draws">
              D
            </th>
            <th className="py-2 text-center font-semibold" title="Losses">
              L
            </th>
            <th className="py-2 pr-3 text-right font-semibold" title="Points">
              Pts
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.player.id}
              className="border-b border-border/60 last:border-0"
            >
              <td className="py-2 pl-3 text-muted-foreground">{index + 1}</td>
              <td className="max-w-0 py-2">
                <PlayerChip
                  username={displayName(row.player)}
                  image={row.player.image}
                  size="sm"
                />
              </td>
              <td className="py-2 text-center">{row.wins}</td>
              <td className="py-2 text-center">{row.draws}</td>
              <td className="py-2 text-center">{row.losses}</td>
              <td className="py-2 pr-3 text-right font-bold">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function byRound(matches: Array<MatchView>) {
  const rounds = new Map<number, Array<MatchView>>()
  for (const match of matches) {
    rounds.set(match.round, [...(rounds.get(match.round) ?? []), match])
  }
  return [...rounds.entries()]
}

function knockoutRoundName(matchCount: number, round: number) {
  if (matchCount === 1) return 'Final'
  if (matchCount === 2) return 'Semi-finals'
  if (matchCount === 4) return 'Quarter-finals'
  return `Round ${round}`
}

function roundLabel(data: Data, round: number, matchCount: number) {
  if (data.competition.format === 'knockout') {
    return knockoutRoundName(matchCount, round)
  }
  return round > data.scheduledRounds ? 'Late entry' : `Round ${round}`
}

function Fixtures({ data }: { data: Data }) {
  // Read once per render; good enough for "2d 4h left" labels.
  const now = Date.now()
  if (data.matches.length === 0) {
    return <Empty>Fixtures appear once the organiser starts it.</Empty>
  }
  return (
    <div className="space-y-5">
      {byRound(data.matches).map(([round, matches]) => (
        <section key={round} className="space-y-2">
          <h2 className="kicker">{roundLabel(data, round, matches.length)}</h2>
          {matches.map((match) => (
            <FixtureCard key={match.id} match={match} now={now} />
          ))}
        </section>
      ))}
    </div>
  )
}

/** Knockout rounds side by side as a compact list of pairings. */
function Bracket({ data }: { data: Data }) {
  if (data.matches.length === 0) {
    return <Empty>The bracket appears once the tournament starts.</Empty>
  }
  return (
    <div className="space-y-5">
      {byRound(data.matches).map(([round, matches]) => (
        <section key={round} className="space-y-2">
          <h2 className="kicker">{knockoutRoundName(matches.length, round)}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {matches.map((match) => (
              <div
                key={match.id}
                className="space-y-1 rounded-2xl bg-card px-3 py-2.5 shadow-card"
              >
                {match.bye ? (
                  <BracketLine player={match.bye} won note="Bye" />
                ) : (
                  <>
                    <BracketLine
                      player={match.home}
                      won={
                        match.winnerId !== null &&
                        match.winnerId === match.home?.id
                      }
                    />
                    <BracketLine
                      player={match.away}
                      won={
                        match.winnerId !== null &&
                        match.winnerId === match.away?.id
                      }
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function BracketLine({
  player,
  won,
  note,
}: {
  player: MatchView['home']
  won: boolean
  note?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2',
        !won && 'opacity-90',
      )}
    >
      {player ? (
        <PlayerChip
          username={displayName(player)}
          image={player.image}
          size="sm"
          className={won ? 'font-bold' : undefined}
        />
      ) : (
        <span className="text-xs text-muted-foreground">Left</span>
      )}
      {note && <span className="kicker">{note}</span>}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl bg-card px-4 py-5 text-center text-sm text-muted-foreground shadow-card">
      {children}
    </p>
  )
}
