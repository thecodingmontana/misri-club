import { type MasterGame, masterGame, plyOf } from '@misri/core/masters'
import { Chess } from 'chess.js'
import { Stack, useLocalSearchParams } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { Button, Card, Chip } from 'heroui-native'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Board } from '@/board'
import { Problem, Screen } from '@/components'
import { Icon } from '@/icon'
import { play } from '@/lib/sound'

const AUTOPLAY_MS = 1200

interface Guessing {
  side: 'w' | 'b'
  right: number
  tried: number
  /** what happened on the last guessed move */
  last: { right: boolean; san: string } | null
}

export default function MasterGameScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const game = masterGame(slug)
  if (!game) {
    return (
      <Screen>
        <Problem message="No game by that name." onRetry={() => {}} />
      </Screen>
    )
  }
  // a fresh replay per game, so moving between games never mixes state
  return <Replay key={game.slug} game={game} />
}

/** Replay a famous game with its notes, or guess each move the master played. */
function Replay({ game }: { game: MasterGame }) {
  const moves = useMemo(() => {
    const chess = new Chess()
    chess.loadPgn(game.moves)
    return chess.history({ verbose: true })
  }, [game])
  const notes = useMemo(
    () => new Map(game.notes.map((note) => [plyOf(note.move).ply, note])),
    [game],
  )
  const [ply, setPly] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [guess, setGuess] = useState<Guessing | null>(null)
  const last = ply === moves.length
  const fen = ply === 0 ? moves[0].before : moves[ply - 1].after
  const lastMove = ply > 0 ? moves[ply - 1] : null
  const note = notes.get(ply)
  const go = (next: number) => {
    setPly(Math.max(0, Math.min(moves.length, next)))
    play('select')
  }

  // auto-play steps on until the end, then stops
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-armed each step
  useEffect(() => {
    if (!playing || guess) return
    if (last) {
      setPlaying(false)
      return
    }
    const timer = setTimeout(() => go(ply + 1), AUTOPLAY_MS)
    return () => clearTimeout(timer)
  }, [playing, guess, last, ply])

  // guessing: the other side's moves play themselves
  const yourTurn = guess !== null && !last && moves[ply].color === guess.side
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-armed each step
  useEffect(() => {
    if (!guess || last || yourTurn) return
    const timer = setTimeout(() => go(ply + 1), 700)
    return () => clearTimeout(timer)
  }, [guess, last, yourTurn, ply])

  const onGuess = (from: string, to: string) => {
    if (!guess || !yourTurn) return
    const master = moves[ply]
    const right = master.from === from && master.to === to
    play(right ? 'success' : 'error')
    setGuess({
      ...guess,
      right: guess.right + (right ? 1 : 0),
      tried: guess.tried + 1,
      last: { right, san: master.san },
    })
    setPly(ply + 1)
  }

  const startGuessing = (side: 'w' | 'b') => {
    setPlaying(false)
    setPly(0)
    setGuess({ side, right: 0, tried: 0, last: null })
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-12">
        <View className="items-center gap-1">
          <Text className="font-display text-center text-3xl uppercase text-foreground">
            {game.title}
          </Text>
          <Text className="font-normal text-center text-xs text-muted">
            {game.white} vs {game.black} · {game.event}, {game.year} ·{' '}
            {game.opening} · {game.result}
          </Text>
        </View>

        <Board
          fen={fen}
          orientation={guess?.side === 'b' ? 'black' : 'white'}
          interactive={yourTurn}
          onMove={onGuess}
          lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
          hint={null}
        />

        {guess ? (
          <GuessPanel
            guess={guess}
            done={last}
            yourTurn={yourTurn}
            onStop={() => setGuess(null)}
            onRestart={() => startGuessing(guess.side)}
          />
        ) : (
          <>
            <View className="flex-row items-center gap-2">
              <Button
                variant="secondary"
                isIconOnly
                accessibilityLabel="Previous move"
                isDisabled={ply === 0}
                onPress={() => go(ply - 1)}
              >
                <Icon name="ChevronLeft" size={18} />
              </Button>
              <Button
                className="flex-1"
                variant={playing ? 'secondary' : 'primary'}
                onPress={() => {
                  if (last) setPly(0)
                  setPlaying(!playing)
                }}
              >
                {playing && <Icon name="Pause" size={16} />}
                <Button.Label>
                  {playing ? 'Pause' : last ? 'Replay' : 'Auto-play'}
                </Button.Label>
              </Button>
              <Button
                variant="secondary"
                isIconOnly
                accessibilityLabel="Next move"
                isDisabled={last}
                onPress={() => go(ply + 1)}
              >
                <Icon name="ChevronRight" size={18} />
              </Button>
            </View>
            <Text className="text-center font-normal text-xs text-muted">
              Move {ply} of {moves.length}
            </Text>
          </>
        )}

        <Card>
          <Card.Body className="gap-1">
            {note ? (
              <>
                <View className="flex-row items-center gap-2">
                  <Text className="font-semibold text-sm text-foreground">
                    {note.move}
                  </Text>
                  {note.brilliant && (
                    <Chip size="sm" color="accent" variant="primary">
                      !! Brilliant
                    </Chip>
                  )}
                </View>
                <Text className="font-normal text-sm text-foreground">
                  {note.text}
                </Text>
              </>
            ) : (
              <Text className="font-normal text-sm text-muted">
                {ply === 0
                  ? game.description
                  : `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '...'} ${moves[ply - 1].san}`}
              </Text>
            )}
          </Card.Body>
        </Card>

        <View className="flex-row flex-wrap gap-y-1.5">
          {moves.map((move, index) => {
            const at = index + 1
            const marked = notes.get(at)
            return (
              <View key={at} className="flex-row items-center">
                {index % 2 === 0 && (
                  <Text className="ml-1 font-normal text-xs text-muted">
                    {index / 2 + 1}.
                  </Text>
                )}
                <Pressable
                  disabled={guess !== null}
                  onPress={() => go(at)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: at === ply }}
                  className={`rounded-md px-1.5 py-0.5 ${at === ply ? 'bg-accent' : ''}`}
                >
                  <Text
                    className={`font-medium text-sm ${at === ply ? 'text-accent-foreground' : 'text-foreground'} ${marked && at !== ply ? 'underline' : ''}`}
                  >
                    {move.san}
                    {marked?.brilliant ? '!!' : ''}
                  </Text>
                </Pressable>
              </View>
            )
          })}
        </View>

        {!guess && (
          <View className="flex-row gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onPress={() => startGuessing('w')}
            >
              <Icon name="Target" size={16} />
              <Button.Label>Guess as White</Button.Label>
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onPress={() => startGuessing('b')}
            >
              <Icon name="Target" size={16} />
              <Button.Label>Guess as Black</Button.Label>
            </Button>
          </View>
        )}

        <Button
          variant="ghost"
          size="sm"
          onPress={() =>
            WebBrowser.openBrowserAsync(
              `https://lichess.org/analysis/pgn/${moves.map((m) => m.san).join('_')}`,
            )
          }
        >
          <Button.Label>
            Study this game on the Lichess analysis board
          </Button.Label>
          <Icon name="ExternalLink" size={14} />
        </Button>
      </ScrollView>
    </Screen>
  )
}

function GuessPanel({
  guess,
  done,
  yourTurn,
  onStop,
  onRestart,
}: {
  guess: Guessing
  done: boolean
  yourTurn: boolean
  onStop: () => void
  onRestart: () => void
}) {
  const side = guess.side === 'w' ? 'White' : 'Black'
  const message = done
    ? `Finished: you found ${guess.right} of ${guess.tried} master moves.`
    : guess.last
      ? guess.last.right
        ? `Right! The master played ${guess.last.san}.`
        : `The master played ${guess.last.san}.`
      : `You are ${side}. Find each move the master played.`
  return (
    <Card>
      <Card.Body className="gap-2">
        <View className="flex-row justify-between">
          <Text className="font-semibold text-sm text-foreground">
            Guess the move
          </Text>
          <Text className="font-normal text-sm text-muted">
            {guess.right}/{guess.tried}
          </Text>
        </View>
        <Text
          className="font-normal text-sm text-foreground"
          accessibilityLiveRegion="polite"
        >
          {message}
          {!done && yourTurn && guess.last ? ' Your move.' : ''}
        </Text>
        <View className="flex-row gap-2">
          {done && (
            <Button size="sm" onPress={onRestart}>
              Try again
            </Button>
          )}
          <Button size="sm" variant="secondary" onPress={onStop}>
            Stop guessing
          </Button>
        </View>
      </Card.Body>
    </Card>
  )
}
