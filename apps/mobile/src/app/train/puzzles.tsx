import type { Score } from '@misri/core/analysis'
import { mistakePuzzles } from '@misri/core/lesson'
import {
  DIFFICULTIES,
  type Difficulty,
  fetchDailyPuzzle,
  fromUci,
  judgeMove,
  puzzleStart,
  THEME_GROUPS,
  THEMES,
  type Theme,
} from '@misri/core/puzzle'
import { Chess } from 'chess.js'
import {
  router,
  Stack,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router'
import { Button, Card, Skeleton, useThemeColor } from 'heroui-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { Board } from '@/board'
import { Kicker } from '@/competitions'
import { Problem, Screen } from '@/components'
import { SelectField } from '@/form'
import { Icon } from '@/icon'
import { recordPuzzle } from '@/lib/progress'
import { nextPuzzle } from '@/lib/puzzle-stash'
import { useSession } from '@/lib/session'
import { play } from '@/lib/sound'
import { useLoad } from '@/lib/use-load'

type Status = 'solving' | 'wrong' | 'solved' | 'revealed'

const NEXT_AFTER_MS = 1500

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easiest: 'Easiest',
  easier: 'Easier',
  normal: 'Normal',
  harder: 'Harder',
  hardest: 'Hardest',
}

/** Lichess puzzles by theme and difficulty, as on the website's Train page. */
export default function Puzzles() {
  // Brilliant moves links here with a theme to practise; the widget with daily=1
  const params = useLocalSearchParams<{ theme?: string; daily?: string }>()
  const [theme, setTheme] = useState<Theme | undefined>(
    params.theme && params.theme in THEMES
      ? (params.theme as Theme)
      : undefined,
  )
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [source, setSource] = useState<'lichess' | 'mine'>('lichess')
  const [round, setRound] = useState(0)
  const [solved, setSolved] = useState(0)
  const { data, error, loading, reload } = useLoad(async () => {
    // the daily puzzle first when asked for, random ones after it; with no
    // connection, one kept on the phone
    const { puzzle, offline } =
      params.daily === '1' && round === 0 && !theme
        ? await nextPuzzle(theme, difficulty, fetchDailyPuzzle)
        : await nextPuzzle(theme, difficulty)
    return { ...puzzle, start: puzzleStart(puzzle), offline }
  }, `${theme}:${difficulty}:${round}`)

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-12">
        <View className="items-center gap-1">
          <Kicker>Train</Kicker>
          <Text className="font-display text-4xl uppercase text-foreground">
            Puzzles
          </Text>
          <Text className="font-normal text-center text-sm text-muted">
            {source === 'mine'
              ? 'The positions you got wrong in your own games.'
              : 'Endless tactics from Lichess. Find the best move.'}
          </Text>
        </View>

        <SelectField
          label="Puzzles"
          value={source}
          options={[
            { value: 'lichess', label: 'From Lichess' },
            { value: 'mine', label: 'Your mistakes' },
          ]}
          onChange={setSource}
        />
        {source === 'mine' ? (
          <MyPuzzles />
        ) : (
          <>
            <View className="flex-row gap-3">
              <SelectField
                label="Theme"
                value={theme ?? 'any'}
                options={[
                  { value: 'any', label: 'Any theme' },
                  ...THEME_GROUPS.flatMap((group) => group.themes).map(
                    (value) => ({
                      value,
                      label: THEMES[value],
                    }),
                  ),
                ]}
                onChange={(value) =>
                  setTheme(value === 'any' ? undefined : (value as Theme))
                }
              />
              <SelectField
                label="Difficulty"
                value={difficulty}
                options={DIFFICULTIES.map((value) => ({
                  value,
                  label: DIFFICULTY_LABEL[value],
                }))}
                onChange={setDifficulty}
              />
            </View>

            {error && !data ? (
              <Problem message={error} onRetry={reload} />
            ) : !data || loading ? (
              // the board's shape while the next puzzle comes from Lichess
              <Skeleton className="aspect-square w-full rounded-xl" />
            ) : (
              <Puzzle
                key={data.puzzle.id}
                data={data}
                solvedCount={solved}
                onSolved={() => setSolved((n) => n + 1)}
                onNext={() => setRound((n) => n + 1)}
                footer={
                  data.offline
                    ? "You're offline: a puzzle saved on your phone"
                    : undefined
                }
              />
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

function Puzzle({
  data,
  solvedCount,
  onSolved,
  onNext,
  footer,
}: {
  data: {
    puzzle: {
      id: string
      solution: string[]
      themes: string[]
      rating?: number
    }
    start: ReturnType<typeof puzzleStart>
  }
  solvedCount: number
  onSolved: () => void
  onNext: () => void
  /** under the buttons; Lichess's themes when not given */
  footer?: string
}) {
  const [accent, danger] = useThemeColor(['accent', 'danger'])
  const { solution } = data.puzzle
  const { start } = data
  const [fen, setFen] = useState(start.fen)
  const [lastMove, setLastMove] = useState<{
    from: string
    to: string
  } | null>(start.lastMove)
  const [step, setStep] = useState(0)
  const [status, setStatus] = useState<Status>('solving')
  const [hint, setHint] = useState(false)
  // a wrong move or a hint: the puzzle still counts, just not as clean
  const [helped, setHelped] = useState(false)

  // replies and the solution play out on timers; none may outlive the puzzle
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (run: () => void, ms: number) => {
    timers.current.push(setTimeout(run, ms))
  }

  const playersTurn = new Chess(fen).turn() === start.colour[0]
  const finished = status === 'solved' || status === 'revealed'

  const applyUci = (from: string, uci: string) => {
    const chess = new Chess(from)
    const move = chess.move(fromUci(uci))
    setFen(chess.fen())
    setLastMove({ from: move.from, to: move.to })
    return chess.fen()
  }

  const onMove = (from: string, to: string) => {
    const verdict = judgeMove(fen, solution, step, from, to)
    if (verdict.kind === 'wrong') {
      play('error')
      setStatus('wrong')
      setHelped(true)
      return
    }
    play('tap')
    setFen(verdict.fen)
    setLastMove({ from, to })
    setHint(false)
    if (verdict.reply === null) {
      play('success')
      setStatus('solved')
      onSolved()
      recordPuzzle(data.puzzle.themes, !helped)
      // a moment to see it, then on to the next
      later(onNext, NEXT_AFTER_MS)
      return
    }
    const reply = verdict.reply
    setStatus('solving')
    // a beat before the opponent answers, so both moves are seen
    later(() => {
      applyUci(verdict.fen, reply)
      setStep(step + 2)
      play('select')
    }, 450)
  }

  const reveal = () => {
    setStatus('revealed')
    recordPuzzle(data.puzzle.themes, false)
    setHint(false)
    let position = fen
    solution.slice(step).forEach((uci, index) => {
      later(
        () => {
          position = applyUci(position, uci)
          play('select')
        },
        500 * (index + 1),
      )
    })
  }

  const side = start.colour === 'white' ? 'White' : 'Black'
  const message =
    hint && status === 'solving'
      ? `Hint: move the piece on ${solution[step].slice(0, 2)}.`
      : {
          solving: `${side} to move. Find the best move.`,
          wrong: 'Not that one. Try again.',
          solved: 'Solved! Next one coming…',
          revealed: 'Here is the solution.',
        }[status]

  return (
    <View className="gap-3">
      <View className="flex-row justify-between">
        <Text className="font-normal text-xs text-muted">
          {data.puzzle.rating !== undefined && (
            <>
              Rating{' '}
              <Text className="font-semibold text-foreground">
                {data.puzzle.rating}
              </Text>
            </>
          )}
        </Text>
        <Text className="font-normal text-xs text-muted">
          Solved this visit{' '}
          <Text className="font-semibold text-foreground">{solvedCount}</Text>
        </Text>
      </View>

      <Board
        fen={fen}
        orientation={start.colour}
        interactive={!finished && playersTurn}
        onMove={onMove}
        lastMove={lastMove}
        hint={hint ? solution[step].slice(0, 2) : null}
      />

      <View
        className="min-h-6 flex-row items-center justify-center gap-1.5"
        accessibilityLiveRegion="polite"
      >
        {status === 'solved' && (
          <Icon name="CheckCircle" size={16} color={accent} />
        )}
        {status === 'wrong' && <Icon name="XCircle" size={16} color={danger} />}
        <Text className="font-semibold text-sm text-foreground">{message}</Text>
      </View>

      <View className="flex-row gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          isDisabled={finished || !playersTurn || hint}
          onPress={() => {
            setHint(true)
            setHelped(true)
            setStatus('solving')
          }}
        >
          <Icon name="Lightbulb" size={16} />
          <Button.Label>Hint</Button.Label>
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          isDisabled={finished || !playersTurn}
          onPress={reveal}
        >
          Show solution
        </Button>
      </View>
      <Button onPress={onNext}>Next puzzle</Button>
      <Text className="font-normal text-center text-xs text-muted">
        {footer ??
          `Puzzles from Lichess · themes: ${data.puzzle.themes
            .map((t) => t.replace(/([A-Z])/g, ' $1').toLowerCase())
            .join(', ')}`}
      </Text>
    </View>
  )
}

/**
 * Every blunder and mistake from your analysed games (here or on the website:
 * the engine results are kept with your account), one at a time.
 */
function MyPuzzles() {
  const { api } = useSession()
  const [index, setIndex] = useState(0)
  const [solved, setSolved] = useState(0)
  const { data, error, reload } = useLoad(
    async () => {
      if (!api) return null
      const { games } = await api.myGames()
      const saved = (await api.savedAnalyses(
        games.map((g) => g.chessComUrl),
      )) as Record<string, Score[]>
      return games.flatMap((game) => {
        const scores = saved[game.chessComUrl]
        if (!scores) return []
        try {
          return mistakePuzzles(game, scores)
        } catch {
          return [] // an unreadable game simply gives no puzzles
        }
      })
    },
    String(Boolean(api)),
  )

  // back from analysing a game: its mistakes are puzzles now
  const shown = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (shown.current) void reload()
      shown.current = true
    }, [reload]),
  )

  if (error && !data) return <Problem message={error} onRetry={reload} />
  if (!data) return <Skeleton className="aspect-square w-full rounded-xl" />
  if (data.length === 0) {
    return (
      <Card>
        <Card.Body className="items-center gap-3 py-6">
          <Text className="font-semibold text-sm text-foreground">
            No mistakes to practise yet
          </Text>
          <Text className="text-center font-normal text-xs text-muted">
            Run Stockfish on your games first. Every blunder and mistake it
            finds becomes a puzzle here.
          </Text>
          <Button onPress={() => router.push('/train/analysis')}>
            Analyse your games
          </Button>
        </Card.Body>
      </Card>
    )
  }
  const at = index % data.length
  const puzzle = data[at]
  return (
    <View className="gap-2">
      <Text className="text-center font-normal text-xs text-muted">
        Position {at + 1} of {data.length}
      </Text>
      <Puzzle
        key={`${puzzle.id}-${index}`}
        data={{
          puzzle: { id: puzzle.id, solution: [puzzle.solution], themes: [] },
          start: {
            fen: puzzle.fen,
            colour: puzzle.colour,
            // squares from the game's own moves
            lastMove: puzzle.lastMove as ReturnType<
              typeof puzzleStart
            >['lastMove'],
          },
        }}
        solvedCount={solved}
        onSolved={() => setSolved((n) => n + 1)}
        onNext={() => setIndex((n) => n + 1)}
        footer={`Your game vs ${puzzle.opponent}, move ${puzzle.moveNumber}`}
      />
    </View>
  )
}
