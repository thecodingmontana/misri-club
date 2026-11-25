import {
  type Colour,
  LEVELS,
  loadGame,
  type Outcome,
  outcomeFor,
  type SavedGame,
  savedGame,
  takeBack,
  withReply,
} from '@misri/core/play'
import { Stack } from 'expo-router'
import { Button, Chip, useThemeColor } from 'heroui-native'
import { useEffect, useMemo, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { Board } from '@/board'
import { Kicker } from '@/competitions'
import { Screen } from '@/components'
import { useEngine } from '@/engine-host'
import { Icon } from '@/icon'
import { PHONE_PLAY_KEY } from '@/lib/progress'
import { play, type Sound } from '@/lib/sound'
import * as Store from '@/lib/storage'

const FRESH: SavedGame = { pgn: '', colour: 'white', level: 1, record: {} }
const RESULT_SOUND: Record<Outcome, Sound> = {
  win: 'success',
  draw: 'warning',
  loss: 'error',
}

/** The game with `pgn` applied, its result tallied if that move ended it. */
function commit(current: SavedGame, pgn: string): SavedGame {
  const result = outcomeFor(loadGame(pgn), current.colour)
  if (!result) return { ...current, pgn }
  const label = LEVELS[current.level].label
  const tally = current.record[label] ?? { win: 0, draw: 0, loss: 0 }
  return {
    ...current,
    pgn,
    record: {
      ...current.record,
      [label]: { ...tally, [result]: tally[result] + 1 },
    },
  }
}

function moveSound(pgn: string, colour: Colour, mine: boolean) {
  const result = outcomeFor(loadGame(pgn), colour)
  play(result ? RESULT_SOUND[result] : mine ? 'tap' : 'select')
}

/** A game against Stockfish on this phone, kept between visits, as on the website. */
export default function Play() {
  const accent = useThemeColor('accent')
  const { engine, host, restart } = useEngine()
  const [game, setGame] = useState<SavedGame>(FRESH)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Store.getItemAsync(PHONE_PLAY_KEY)
      .then((text) => {
        const stored = savedGame.safeParse(JSON.parse(text ?? 'null'))
        if (stored.success) setGame(stored.data)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])
  useEffect(() => {
    if (!loaded) return
    // shortcut: SecureStore suits small values; a very long game's PGN may pass its 2 KB comfort size, move to a file if that bites.
    Store.setItemAsync(PHONE_PLAY_KEY, JSON.stringify(game)).catch(() => {})
  }, [game, loaded])

  const level = LEVELS[game.level]
  useEffect(() => engine.setSkill(level.skill), [engine, level])

  const chess = useMemo(() => loadGame(game.pgn), [game.pgn])
  const outcome = outcomeFor(chess, game.colour)
  const yourTurn = chess.turn() === game.colour[0]
  const last = chess.history({ verbose: true }).at(-1)
  const thinking = loaded && !outcome && !yourTurn && !error

  // Stockfish replies whenever it's its turn, a resumed game included
  useEffect(() => {
    if (!loaded || outcome || yourTurn) return
    const fen = chess.fen()
    let live = true
    engine
      .evaluate(fen, level.ms)
      .then(({ best }) => {
        if (!live || !best) return
        const next = withReply(chess.pgn(), fen, best)
        if (!next) return
        moveSound(next, game.colour, false)
        setGame((current) => {
          const pgn = withReply(current.pgn, fen, best)
          return pgn ? commit(current, pgn) : current
        })
      })
      .catch((failure: Error) => live && setError(failure.message))
    return () => {
      live = false
    }
  }, [engine, loaded, chess, outcome, yourTurn, level, game.colour])

  // a new game also recovers from an engine that failed to load
  const newGame = (colour: 'white' | 'black') => {
    if (error) {
      setError(null)
      restart()
    }
    setGame({ ...game, pgn: '', colour })
  }

  const onMove = (from: string, to: string) => {
    const next = loadGame(game.pgn)
    try {
      // shortcut: always promotes to a queen, as on the website; add a picker if underpromotion matters.
      next.move({ from, to, promotion: 'q' })
    } catch {
      return
    }
    moveSound(next.pgn(), game.colour, true)
    setGame(commit(game, next.pgn()))
  }

  const tally = game.record[level.label]
  const status = outcome
    ? {
        win: 'Checkmate. You win!',
        loss: 'Checkmate. Stockfish wins.',
        draw: 'Draw.',
      }[outcome]
    : thinking
      ? 'Stockfish is thinking…'
      : yourTurn
        ? chess.inCheck()
          ? 'Your move. You are in check.'
          : 'Your move.'
        : ''

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      {host}
      <ScrollView contentContainerClassName="gap-3 p-4 pb-12">
        <View className="items-center gap-1">
          <Kicker>Train</Kicker>
          <Text className="font-display text-4xl uppercase text-foreground">
            Play Stockfish
          </Text>
        </View>
        <Text className="font-medium text-sm text-foreground">
          Stockfish strength
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {LEVELS.map((option, index) => (
            <Chip
              key={option.label}
              variant={game.level === index ? 'soft' : 'tertiary'}
              color={game.level === index ? 'accent' : 'default'}
              onPress={() => setGame({ ...game, level: index })}
            >
              {option.label}
            </Chip>
          ))}
        </View>

        <Board
          fen={chess.fen()}
          orientation={game.colour}
          interactive={loaded && !outcome && yourTurn && !error}
          onMove={onMove}
          lastMove={last ? { from: last.from, to: last.to } : null}
          hint={null}
        />

        <View
          className="min-h-6 flex-row items-center justify-center gap-1.5"
          accessibilityLiveRegion="polite"
        >
          {thinking && <Icon name="Cpu" size={16} color={accent} />}
          <Text
            className={`font-semibold text-center text-sm ${error ? 'text-danger' : 'text-foreground'}`}
          >
            {error ?? status}
          </Text>
        </View>
        {error && (
          // a fresh engine; it picks the game up where it stopped
          <Button
            variant="secondary"
            onPress={() => {
              setError(null)
              restart()
            }}
          >
            Try again
          </Button>
        )}

        <View className="flex-row gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            isDisabled={chess.history().length === 0}
            onPress={() =>
              setGame({ ...game, pgn: takeBack(game.pgn, game.colour) })
            }
          >
            Take back
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onPress={() => newGame('white')}
          >
            Play White
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onPress={() => newGame('black')}
          >
            Play Black
          </Button>
        </View>
        <Text className="text-center font-normal text-xs text-muted">
          Your record vs {level.label}:{' '}
          <Text className="font-semibold text-foreground">
            {tally?.win ?? 0}W · {tally?.draw ?? 0}D · {tally?.loss ?? 0}L
          </Text>
        </Text>
      </ScrollView>
    </Screen>
  )
}
