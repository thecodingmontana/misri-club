import { type Phase, positionsOf, type Score } from '@misri/core/analysis'
import {
  buildLesson,
  type LessonMoment,
  type QuizQuestion,
} from '@misri/core/lesson'
import { type GameReport, gameReport } from '@misri/core/report'
import { Stack, useLocalSearchParams } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import {
  Button,
  Card,
  Chip,
  PressableFeedback,
  Skeleton,
  useThemeColor,
} from 'heroui-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { Board } from '@/board'
import { Screen } from '@/components'
import { useEngine } from '@/engine-host'
import { Icon } from '@/icon'
import { useSession } from '@/lib/session'
import { play } from '@/lib/sound'
import { playedGame, saveReview } from '@/lib/stockfish-games'
import * as Store from '@/lib/storage'
import { useLoad } from '@/lib/use-load'
import { SpeakButton } from '@/speak'

// long enough per position to see a few moves deep, not just the next one
const MOVETIME_MS = 250

/**
 * A lesson from one of your games, built from Stockfish's verdict on every
 * move, as on the website: the mental model, the key moments, a quiz. The
 * game is a chess.com one (`url`), or one played here against Stockfish
 * (`played`, its id in the phone's history), whose review stays with it.
 */
export default function Lesson() {
  const params = useLocalSearchParams<{ url?: string; played?: string }>()
  const url = params.url ?? ''
  const playedId = params.played ?? ''
  const { api } = useSession()
  const accent = useThemeColor('accent')
  const { engine, host, restart } = useEngine()
  const { data: game, error } = useLoad(
    async () => {
      if (playedId) {
        const played = await playedGame(playedId)
        return played
          ? {
              pgn: played.pgn,
              colour: played.colour,
              outcome: played.outcome,
              opponent: `Stockfish (${played.level})`,
              chessComUrl: '',
              kept: played.scores ?? null,
            }
          : null
      }
      if (!api) return null
      const listed = (await api.myGames()).games.find(
        (g) => g.chessComUrl === url,
      )
      // an older competition game: fetched on its own, by its match
      return listed ?? (await api.matchGame(url))
    },
    `${Boolean(api)}:${url}:${playedId}`,
    // kept on the phone, so a game opened before reopens offline
    url ? `lesson-game-${url}` : undefined,
  )
  const { data: saved } = useLoad(
    () => (api && url ? api.savedAnalyses([url]) : Promise.resolve({})),
    `${Boolean(api)}:${url}`,
    url ? `analysis-${url}` : undefined,
  )
  const [fresh, setFresh] = useState<Score[] | null>(null)
  const kept = game && 'kept' in game ? game.kept : null
  const scores =
    fresh ?? kept ?? (saved as Record<string, Score[]> | null)?.[url] ?? null
  const [progress, setProgress] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  // the lesson works without it, but the website and other phones need it
  const [unsaved, setUnsaved] = useState<Score[] | null>(null)
  const save = async (scores: Score[]) =>
    // a game played here has no chess.com link to keep it under
    url &&
    api
      ?.act('saveAnalysis', { url, scores })
      .then(() => setUnsaved(null))
      .catch(() => setUnsaved(scores))

  const report = useMemo(
    () => (game && scores ? gameReport(game.pgn, game.colour, scores) : null),
    [game, scores],
  )
  const lesson = useMemo(
    () =>
      game && scores
        ? buildLesson({
            pgn: game.pgn,
            colour: game.colour,
            scores,
            opponent: game.opponent,
            outcome: game.outcome,
          })
        : null,
    [game, scores],
  )

  const analyse = async () => {
    if (!game) return
    setFailure(null)
    try {
      const fens = positionsOf(game.pgn).fens
      const out: Score[] = []
      for (const fen of fens) {
        setProgress(`Position ${out.length + 1}/${fens.length}…`)
        out.push(await engine.evaluate(fen, MOVETIME_MS))
      }
      setFresh(out)
      if (playedId)
        void saveReview(
          playedId,
          out,
          gameReport(game.pgn, game.colour, out).accuracy,
        )
      else void save(out)
    } catch (e) {
      setFailure((e as Error).message)
      // the next try gets a fresh engine
      restart()
    } finally {
      setProgress(null)
    }
  }

  // a game just played here: straight into the lesson, no button to find
  const autoStarted = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when the game is there
  useEffect(() => {
    if (!playedId || !game || scores || autoStarted.current) return
    autoStarted.current = true
    void analyse()
  }, [game])

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      {host}
      <ScrollView contentContainerClassName="gap-6 p-4 pb-12">
        {error && !game ? (
          <Card>
            <Card.Body>
              <Text className="text-center font-normal text-sm text-muted">
                {error}
              </Text>
            </Card.Body>
          </Card>
        ) : game === null || game === undefined ? (
          game === null ? (
            <Card>
              <Card.Body>
                <Text className="text-center font-normal text-sm text-muted">
                  {playedId
                    ? "This game isn't on this phone any more."
                    : "This game isn't one of yours: it's not among your latest 50 games or your competition games."}
                </Text>
              </Card.Body>
            </Card>
          ) : (
            <View className="gap-3">
              <Skeleton className="aspect-square w-full rounded-xl" />
              <Text className="text-center font-normal text-xs text-muted">
                Fetching your game from chess.com
              </Text>
            </View>
          )
        ) : !lesson ? (
          <Card>
            <Card.Body className="items-center gap-3 py-4">
              <View className="size-12 items-center justify-center rounded-2xl bg-accent/15">
                <Icon name="Cpu" size={24} color={accent} />
              </View>
              <Text className="font-display text-center text-xl uppercase text-foreground">
                Analyse this game first
              </Text>
              <Text className="text-center font-normal text-xs text-muted">
                The lesson is built from Stockfish's verdict on every move vs{' '}
                {game.opponent}. It takes about half a minute.
              </Text>
              {progress ? (
                <Text className="font-normal text-xs text-muted">
                  {progress}
                </Text>
              ) : (
                <Button onPress={analyse}>Analyse and build the lesson</Button>
              )}
              {failure && (
                <Text className="font-normal text-xs text-danger">
                  {failure}
                </Text>
              )}
            </Card.Body>
          </Card>
        ) : (
          <>
            <View className="gap-2">
              <Chip size="sm" variant="soft" color="accent">
                Stockfish coach
              </Chip>
              <Text className="font-display text-3xl uppercase text-foreground">
                {lesson.title}
              </Text>
            </View>
            <Card className="border-l-4 border-accent">
              <Card.Body className="flex-row items-start gap-3">
                <Text className="flex-1 font-normal text-sm text-foreground">
                  <Text className="font-bold text-accent">
                    The mental model:{' '}
                  </Text>
                  {lesson.mentalModel}
                </Text>
                <SpeakButton text={`The mental model. ${lesson.mentalModel}`} />
              </Card.Body>
            </Card>
            <Text className="font-normal text-sm italic text-muted">
              {lesson.summary}
            </Text>
            <View className="gap-1.5">
              <View className="flex-row items-center justify-between gap-2">
                <Text className="flex-1 font-display text-xl uppercase text-foreground">
                  {lesson.principle.heading}
                </Text>
                <SpeakButton
                  text={`${lesson.principle.heading}. ${lesson.principle.body}`}
                />
              </View>
              <Text className="font-normal text-sm text-foreground">
                {lesson.principle.body}
              </Text>
            </View>
            {report && <Report report={report} />}
            {lesson.moments.map((moment) => (
              <Moment
                key={moment.ply}
                moment={moment}
                orientation={game.colour}
                url={game.chessComUrl}
              />
            ))}
            {lesson.quiz.length > 0 && (
              <View className="gap-3">
                <Text className="font-display text-xl uppercase text-foreground">
                  Check your understanding
                </Text>
                {lesson.quiz.map((question) => (
                  <Quiz key={question.question} question={question} />
                ))}
              </View>
            )}
            {unsaved && (
              <View className="flex-row items-center gap-2">
                <Text className="flex-1 font-normal text-xs text-danger">
                  This analysis wasn't saved to your account.
                </Text>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => void save(unsaved)}
                >
                  Save again
                </Button>
              </View>
            )}
            {game.chessComUrl ? <Completed url={game.chessComUrl} /> : null}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

/** The moment as steps: the position, your move, their reply, the better one. */
function Moment({
  moment,
  orientation,
  url,
}: {
  moment: LessonMoment
  orientation: 'white' | 'black'
  url: string
}) {
  const accent = useThemeColor('accent')
  const steps = [
    {
      label: 'Position',
      fen: moment.fen,
      move: null,
      caption: moment.hanging.length
        ? `Pieces attacked with no defender: ${moment.hanging.join(', ')}.`
        : 'Your move. What would you play?',
    },
    {
      label: 'You played',
      fen: moment.played.after,
      move: moment.played,
      caption: `You played ${moment.played.san}.`,
    },
    ...(moment.reply
      ? [
          {
            label: 'Their reply',
            fen: moment.reply.after,
            move: moment.reply,
            caption: `Their best answer is ${moment.reply.san}.`,
          },
        ]
      : []),
    ...(moment.best
      ? [
          {
            label: 'Best',
            fen: moment.best.after,
            move: moment.best,
            caption: `Stockfish preferred ${moment.best.san}.`,
          },
        ]
      : []),
  ]
  const [index, setIndex] = useState(0)
  const step = steps[index]
  return (
    <View className="gap-3">
      <Text className="font-display text-xl uppercase text-foreground">
        {moment.heading}
      </Text>
      <Card>
        <Card.Body className="flex-row gap-2">
          <Icon name="Lightbulb" size={16} color={accent} />
          <Text className="flex-1 font-normal text-sm text-foreground">
            <Text className="font-bold text-accent">Theory: </Text>
            {moment.theory}
          </Text>
          <SpeakButton text={moment.theory} />
        </Card.Body>
      </Card>
      <Text className="font-normal text-xs text-muted">{moment.prompt}</Text>
      <Board
        fen={step.fen}
        orientation={orientation}
        interactive={false}
        onMove={() => {}}
        lastMove={step.move ? { from: step.move.from, to: step.move.to } : null}
        hint={null}
      />
      <View className="flex-row gap-1 rounded-full bg-surface p-1">
        {steps.map((s, i) => (
          <PressableFeedback
            key={s.label}
            onPress={() => {
              setIndex(i)
              play('select')
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === index }}
            className={`flex-1 items-center rounded-full px-2 py-1.5 ${i === index ? 'bg-background' : ''}`}
          >
            <Text
              className={`font-semibold text-2xs ${i === index ? 'text-foreground' : 'text-muted'}`}
            >
              {s.label}
            </Text>
          </PressableFeedback>
        ))}
      </View>
      <Text className="font-normal text-xs text-muted">{step.caption}</Text>
      {url ? (
        <Button
          variant="ghost"
          size="sm"
          onPress={() => WebBrowser.openBrowserAsync(url)}
        >
          <Button.Label>From your game, move {moment.moveNumber}</Button.Label>
          <Icon name="ExternalLink" size={12} />
        </Button>
      ) : (
        <Text className="text-center font-normal text-xs text-muted">
          From your game, move {moment.moveNumber}
        </Text>
      )}
    </View>
  )
}

function Quiz({ question }: { question: QuizQuestion }) {
  const [accent, danger] = useThemeColor(['accent', 'danger'])
  const [picked, setPicked] = useState<number | null>(null)
  return (
    <Card>
      <Card.Body className="gap-2">
        <Text className="font-semibold text-sm text-foreground">
          {question.question}
        </Text>
        {question.options.map((option, index) => {
          const answered = picked !== null
          const correct = index === question.answer
          return (
            <PressableFeedback
              key={option}
              isDisabled={answered}
              onPress={() => {
                setPicked(index)
                play(correct ? 'success' : 'error')
              }}
              className={`flex-row items-center gap-2 rounded-xl border px-3 py-2.5 ${
                answered && correct
                  ? 'border-accent bg-accent/15'
                  : answered && index === picked
                    ? 'border-danger bg-danger/10'
                    : 'border-border'
              } ${answered && !correct && index !== picked ? 'opacity-60' : ''}`}
            >
              <Text className="flex-1 font-normal text-sm text-foreground">
                {option}
              </Text>
              {answered && correct && (
                <Icon name="CheckCircle" size={16} color={accent} />
              )}
              {answered && !correct && index === picked && (
                <Icon name="XCircle" size={16} color={danger} />
              )}
            </PressableFeedback>
          )
        })}
        {picked !== null && (
          <Text className="font-normal text-xs text-muted">
            {question.explanation}
          </Text>
        )}
      </Card.Body>
    </Card>
  )
}

/** A per-phone checkmark, as the website keeps one per browser. */
function Completed({ url }: { url: string }) {
  // secure-store keys allow letters, digits, ".", "-" and "_" only
  const key = `misri.lesson-done.${url.replace(/[^\w.-]/g, '_').slice(-120)}`
  const [done, setDone] = useState(false)
  useEffect(() => {
    Store.getItemAsync(key)
      .then((v) => setDone(v === '1'))
      .catch(() => {})
  }, [key])
  return (
    <Button
      variant={done ? 'secondary' : 'primary'}
      onPress={() => {
        const next = !done
        setDone(next)
        ;(next
          ? Store.setItemAsync(key, '1')
          : Store.deleteItemAsync(key)
        ).catch(() => {})
      }}
    >
      {done && <Icon name="CheckCircle" size={16} />}
      <Button.Label>{done ? 'Completed' : 'Mark as completed'}</Button.Label>
    </Button>
  )
}

const PHASE_NAME: Record<Phase, string> = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
}
const KIND: Record<
  GameReport['improvements'][number]['kind'],
  { mark: string; label: string; tone: string }
> = {
  blunder: { mark: '??', label: 'Blunder', tone: 'text-danger' },
  mistake: { mark: '?', label: 'Mistake', tone: 'text-warning' },
  inaccuracy: { mark: '?!', label: 'Inaccuracy', tone: 'text-muted' },
}

/** The move-by-move detail: accuracy by phase, and every move that cost something. */
function Report({ report }: { report: GameReport }) {
  const { counts, phases, improvements } = report
  return (
    <View className="gap-3">
      <Text className="font-display text-xl uppercase text-foreground">
        Your game, move by move
      </Text>
      <Card>
        <Card.Body className="gap-3">
          <View className="flex-row items-baseline justify-between">
            <Text className="font-normal text-sm text-muted">Accuracy</Text>
            <Text className="font-display text-3xl text-accent">
              {report.accuracy.toFixed(1)}%
            </Text>
          </View>
          <View className="flex-row gap-2">
            {(['blunder', 'mistake', 'inaccuracy'] as const).map((kind) => (
              <View
                key={kind}
                className="flex-1 items-center rounded-xl bg-background py-2"
              >
                <Text className={`font-bold text-lg ${KIND[kind].tone}`}>
                  {counts[kind]}
                </Text>
                <Text className="font-normal text-2xs text-muted">
                  {KIND[kind].label}
                  {counts[kind] === 1 ? '' : 's'}
                </Text>
              </View>
            ))}
          </View>
          {phases.map((phase) => (
            <View key={phase.phase} className="gap-1">
              <View className="flex-row justify-between">
                <Text className="font-medium text-xs text-foreground">
                  {PHASE_NAME[phase.phase]}
                </Text>
                <Text className="font-normal text-xs text-muted">
                  {phase.accuracy.toFixed(0)}% over {phase.moves} moves
                </Text>
              </View>
              <View className="h-1.5 overflow-hidden rounded-full bg-background">
                <View
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.round(phase.accuracy)}%` }}
                />
              </View>
            </View>
          ))}
        </Card.Body>
      </Card>
      {improvements.length > 0 ? (
        <Card>
          <Card.Body className="gap-2">
            <Text className="font-semibold text-sm text-foreground">
              Every move to play better
            </Text>
            {improvements.map((move) => (
              <View
                key={move.ply}
                className="flex-row items-center gap-2"
                accessible
                accessibilityLabel={`Move ${move.moveNumber}, ${move.played}, a ${KIND[move.kind].label.toLowerCase()}${move.best ? `; better was ${move.best}` : ''}`}
              >
                <Text className="w-8 font-normal text-xs text-muted">
                  {move.moveNumber}.
                </Text>
                <Text
                  className={`w-20 font-semibold text-sm ${KIND[move.kind].tone}`}
                >
                  {move.played}
                  {KIND[move.kind].mark}
                </Text>
                <Text className="flex-1 font-normal text-xs text-muted">
                  {move.best ? (
                    <>
                      better{' '}
                      <Text className="font-semibold text-foreground">
                        {move.best}
                      </Text>
                    </>
                  ) : null}
                </Text>
                <Text className="font-normal text-2xs text-muted">
                  -{Math.round(move.dropped)}%
                </Text>
              </View>
            ))}
            <Text className="font-normal text-2xs text-muted">
              The percentage is the winning chance each move gave away.
            </Text>
          </Card.Body>
        </Card>
      ) : (
        <Text className="font-normal text-sm text-muted">
          No move here cost you anything that matters. Clean game.
        </Text>
      )}
    </View>
  )
}
