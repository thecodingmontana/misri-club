import {
  type GameReview,
  positionsOf,
  reviewFor,
  type Score,
  weakPoints,
} from '@misri/core/analysis'
import { GAME_COUNTS, type MyGame } from '@misri/core/my-games'
import { router, Stack } from 'expo-router'
import { Button, Card, PressableFeedback } from 'heroui-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { Kicker } from '@/competitions'
import { Problem, Screen } from '@/components'
import { useEngine } from '@/engine-host'
import { SelectField } from '@/form'
import { Icon } from '@/icon'
import { relativeTime } from '@/lib/format'
import { useSession } from '@/lib/session'
import { useLoad } from '@/lib/use-load'
import { PlayerAvatar } from '@/match'
import { CompetitionListSkeleton } from '@/skeletons'

const MOVETIME_MS = 120

/** Your latest chess.com games, checked by Stockfish, as on the website. */
export default function Analysis() {
  const { api } = useSession()
  const { data, error, reload } = useLoad(
    () => (api ? api.myGames() : Promise.resolve(null)),
    String(Boolean(api)),
  )
  const [count, setCount] = useState<number>(GAME_COUNTS[1])

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerClassName="gap-5 p-4 pb-12">
        <View className="items-center gap-1">
          <Kicker>Train</Kicker>
          <Text className="font-display text-center text-4xl uppercase text-foreground">
            Analyse your games
          </Text>
          <Text className="font-normal text-center text-xs text-muted">
            {data
              ? `Your latest games as ${data.username} on chess.com.`
              : 'Your latest games on chess.com.'}
          </Text>
        </View>
        <SelectField
          label="How many games"
          value={String(count)}
          options={GAME_COUNTS.map((option) => ({
            value: String(option),
            label: `Your last ${option} games`,
          }))}
          onChange={(value) => setCount(Number(value))}
        />
        {error && !data ? (
          <Problem message={error} onRetry={reload} />
        ) : !data ? (
          <View className="gap-2">
            <Text className="text-center font-normal text-xs text-muted">
              Fetching your games from chess.com
            </Text>
            <CompetitionListSkeleton count={6} />
          </View>
        ) : data.games.length === 0 ? (
          <Card>
            <Card.Body>
              <Text className="text-center font-normal text-sm text-muted">
                No standard chess games on chess.com in the last year.
              </Text>
            </Card.Body>
          </Card>
        ) : (
          <Games games={data.games.slice(0, count)} />
        )}
      </ScrollView>
    </Screen>
  )
}

function Games({ games }: { games: MyGame[] }) {
  const { api } = useSession()
  const { engine, host, restart } = useEngine()
  const urls = useMemo(() => games.map((g) => g.chessComUrl), [games])
  const { data: saved } = useLoad(
    () => (api ? api.savedAnalyses(urls) : Promise.resolve({})),
    urls.join(' '),
  )
  // games analysed here this visit, on top of what the account has saved
  const [fresh, setFresh] = useState<Record<string, Score[]>>({})
  const stored = useMemo(
    () => ({ ...(saved as Record<string, Score[]> | null), ...fresh }),
    [saved, fresh],
  )
  const [progress, setProgress] = useState<{
    game: number
    games: number
    position: number
    positions: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // analysed here but not yet kept with the account: retried without Stockfish
  const [unsaved, setUnsaved] = useState<Record<string, Score[]>>({})
  const save = (url: string, scores: Score[]) =>
    api
      ?.act('saveAnalysis', { url, scores })
      .then(() => setUnsaved(({ [url]: _, ...rest }) => rest))
      .catch(() => setUnsaved((current) => ({ ...current, [url]: scores })))
  const running = useRef(0)
  useEffect(
    () => () => {
      running.current++
    },
    [],
  )

  const reviews = useMemo(() => {
    const byUrl = new Map<string, GameReview>()
    for (const game of games) {
      const scores = stored[game.chessComUrl]
      if (!scores) continue
      try {
        byUrl.set(
          game.chessComUrl,
          reviewFor(game.colour, positionsOf(game.pgn), scores),
        )
      } catch {
        // an unreadable PGN simply stays unanalysed
      }
    }
    return byUrl
  }, [games, stored])

  const reviewed = [...reviews.values()]
  const pending = games.filter((g) => !stored[g.chessComUrl])
  const weak = weakPoints(reviewed)
  const accuracy = reviewed.length
    ? reviewed.reduce((sum, r) => sum + r.accuracy, 0) / reviewed.length
    : null
  const wins = games.filter((g) => g.outcome === 'win').length
  const draws = games.filter((g) => g.outcome === 'draw').length

  const start = async () => {
    const run = ++running.current
    setError(null)
    let skipped = 0
    try {
      for (const [index, game] of pending.entries()) {
        let fens: string[]
        try {
          fens = positionsOf(game.pgn).fens
        } catch {
          skipped++
          continue
        }
        const scores: Score[] = []
        for (const fen of fens) {
          if (running.current !== run) return
          setProgress({
            game: index + 1,
            games: pending.length,
            position: scores.length + 1,
            positions: fens.length,
          })
          scores.push(await engine.evaluate(fen, MOVETIME_MS))
        }
        if (running.current !== run) return
        setFresh((current) => ({ ...current, [game.chessComUrl]: scores }))
        // kept with the account, for the website and other phones
        void save(game.chessComUrl, scores)
      }
      if (skipped > 0) {
        setError(
          `${skipped} game${skipped === 1 ? '' : 's'} could not be read.`,
        )
      }
    } catch (failure) {
      if (running.current === run) setError((failure as Error).message)
      // the next try gets a fresh engine
      restart()
    } finally {
      if (running.current === run) setProgress(null)
    }
  }

  const done =
    progress &&
    ((progress.game - 1) * progress.positions + progress.position) /
      (progress.games * progress.positions)

  return (
    <>
      {host}
      <View className="flex-row flex-wrap gap-2">
        <Tile
          label="Games"
          value={String(games.length)}
          hint={`${reviewed.length} analysed`}
        />
        <Tile
          label="Win rate"
          value={`${Math.round((wins / games.length) * 100)}%`}
          hint={`${wins}W ${draws}D ${games.length - wins - draws}L`}
        />
        <Tile
          label="Avg accuracy"
          value={accuracy === null ? '—' : `${accuracy.toFixed(1)}%`}
          hint="analysed games"
        />
        <Tile
          label="Blunders / game"
          value={
            reviewed.length ? (weak.blunders / reviewed.length).toFixed(1) : '—'
          }
          hint={
            reviewed.length ? `${weak.mistakes} mistakes` : 'run the engine'
          }
        />
      </View>

      <Card>
        <Card.Body className="gap-3">
          <View className="flex-row items-center gap-3">
            <View className="size-10 items-center justify-center rounded-xl bg-accent/15">
              <Icon name="Cpu" size={20} />
            </View>
            <View className="flex-1">
              <Text className="font-semibold text-sm text-foreground">
                Stockfish
              </Text>
              <Text className="font-normal text-xs text-muted">
                {pending.length === 0
                  ? `All ${games.length} games analysed`
                  : `${games.length - pending.length} of ${games.length} games analysed`}
              </Text>
            </View>
            {progress ? (
              <Button
                size="sm"
                variant="danger-soft"
                onPress={() => {
                  running.current++
                  setProgress(null)
                }}
              >
                Stop
              </Button>
            ) : (
              pending.length > 0 && (
                <Button size="sm" onPress={start}>
                  {`Analyse ${pending.length}`}
                </Button>
              )
            )}
          </View>
          {progress && (
            <View className="gap-1.5">
              <View className="h-2 overflow-hidden rounded-full bg-background">
                <View
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.round((done ?? 0) * 100)}%` }}
                />
              </View>
              <Text className="font-normal text-xs text-muted">
                Game {progress.game} of {progress.games} · position{' '}
                {progress.position}/{progress.positions} · keep this screen open
              </Text>
            </View>
          )}
          {error && (
            <Text className="font-normal text-xs text-danger">{error}</Text>
          )}
          {Object.keys(unsaved).length > 0 && (
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 font-normal text-xs text-danger">
                {`${Object.keys(unsaved).length} analysed game${Object.keys(unsaved).length === 1 ? " wasn't" : "s weren't"} saved to your account.`}
              </Text>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => {
                  for (const [url, scores] of Object.entries(unsaved))
                    void save(url, scores)
                }}
              >
                Save again
              </Button>
            </View>
          )}
          {!progress && (
            <Text className="font-normal text-xs text-muted">
              About ten seconds a game. Results are kept with your account, so
              each game is only analysed once, here or on the website.
            </Text>
          )}
        </Card.Body>
      </Card>

      {reviewed.length > 0 && (
        <View className="gap-2">
          <Text className="font-display text-xl uppercase text-foreground">
            Weak points
          </Text>
          <Card>
            <Card.Body className="gap-3">
              {[
                {
                  label: 'Blunders',
                  hint: 'threw away 30%+ winning chance',
                  count: weak.blunders,
                },
                {
                  label: 'Mistakes',
                  hint: 'gave away 20–30%',
                  count: weak.mistakes,
                },
                {
                  label: 'Inaccuracies',
                  hint: 'gave away 10–20%',
                  count: weak.inaccuracies,
                },
              ].map((row, index) => (
                <View key={row.label} className="flex-row items-center gap-3">
                  <View className="size-7 items-center justify-center rounded-full bg-danger/15">
                    <Text className="font-bold text-xs text-danger">
                      {index + 1}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-medium text-sm text-foreground">
                      {row.label}
                    </Text>
                    <Text className="font-normal text-xs text-muted">
                      {row.hint}
                    </Text>
                  </View>
                  <Text className="font-semibold text-sm text-foreground">
                    ×{row.count}
                  </Text>
                </View>
              ))}
              <Text className="font-normal text-xs text-muted">
                {weak.weakestPhase
                  ? `Most fragile phase: ${weak.weakestPhase.phase} (${(weak.weakestPhase.rate * 100).toFixed(0)}% of moves are mistakes or blunders)`
                  : `No mistakes across ${reviewed.length} analysed games. Clean.`}
              </Text>
            </Card.Body>
          </Card>
        </View>
      )}

      <View className="gap-2">
        <Text className="font-display text-xl uppercase text-foreground">
          Games
        </Text>
        {games.map((game) => {
          const review = reviews.get(game.chessComUrl)
          return (
            <Card key={game.chessComUrl} className="p-0">
              <PressableFeedback
                className="flex-row items-center gap-3 px-3 py-2.5"
                onPress={() =>
                  router.push({
                    pathname: '/train/analysis/game',
                    params: { url: game.chessComUrl },
                  })
                }
              >
                <View
                  className={`size-7 items-center justify-center rounded-full ${game.outcome === 'win' ? 'bg-success/15' : game.outcome === 'draw' ? 'bg-background' : 'bg-danger/15'}`}
                >
                  <Text
                    className={`font-bold text-2xs ${game.outcome === 'loss' ? 'text-danger' : 'text-foreground'}`}
                  >
                    {game.outcome === 'win'
                      ? 'W'
                      : game.outcome === 'draw'
                        ? '½'
                        : 'L'}
                  </Text>
                </View>
                <PlayerAvatar
                  player={{
                    name: game.opponent,
                    chessUsername: game.opponent,
                    image: null,
                  }}
                  size="sm"
                />
                <View className="min-w-0 flex-1">
                  <Text
                    numberOfLines={1}
                    className="font-semibold text-sm text-foreground"
                  >
                    {game.opponent}
                    {game.opponentRating ? (
                      <Text className="font-normal text-muted">
                        {' '}
                        ({game.opponentRating})
                      </Text>
                    ) : null}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="font-normal text-xs text-muted"
                  >
                    {game.label}
                  </Text>
                </View>
                <View className="items-end">
                  <Text
                    className={`font-semibold text-xs ${review ? 'text-accent' : 'text-muted'}`}
                  >
                    {review ? `${review.accuracy.toFixed(1)}%` : '—'}
                  </Text>
                  <Text className="font-normal text-2xs text-muted">
                    {relativeTime(new Date(game.endedAt).toISOString())}
                  </Text>
                </View>
              </PressableFeedback>
            </Card>
          )
        })}
      </View>
    </>
  )
}

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
    <Card className="grow basis-[45%] px-4 py-3">
      <Text className="font-semibold text-2xs uppercase tracking-widest text-muted">
        {label}
      </Text>
      <Text className="font-display text-2xl text-accent">{value}</Text>
      <Text className="font-normal text-2xs text-muted">{hint}</Text>
    </Card>
  )
}
