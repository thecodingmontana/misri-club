import {
  type Phase,
  positionsOf,
  reviewFor,
  weakPoints,
} from '@misri/core/analysis'
import { router, useFocusEffect } from 'expo-router'
import { Card, PressableFeedback } from 'heroui-native'
import { useCallback, useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { relativeTime } from '@/lib/format'
import { type PlayedGame, playedGames } from '@/lib/stockfish-games'

const PHASE_LABEL: Record<Phase, string> = {
  opening: 'the opening',
  middlegame: 'the middlegame',
  endgame: 'the endgame',
}

const average = (list: number[]) =>
  list.reduce((sum, n) => sum + n, 0) / list.length

/** Where the player stands over their reviewed games, once there are two. */
function trend(games: PlayedGame[]) {
  const reviewed = games.filter((g) => g.scores && g.accuracy !== undefined)
  if (reviewed.length < 2) return null
  const recent = reviewed.slice(0, 5).map((g) => g.accuracy as number)
  const before = reviewed.slice(5, 10).map((g) => g.accuracy as number)
  const weak = weakPoints(
    reviewed
      .slice(0, 10)
      .map((g) =>
        reviewFor(
          g.colour,
          positionsOf(g.pgn),
          g.scores as NonNullable<PlayedGame['scores']>,
        ),
      ),
  )
  const games10 = Math.min(reviewed.length, 10)
  return {
    reviewed: reviewed.length,
    accuracy: average(recent),
    change: before.length ? average(recent) - average(before) : null,
    blundersPerGame: weak.blunders / games10,
    weakest: weak.weakestPhase?.phase ?? null,
  }
}

/** The player's games against Stockfish: each one to review, and the trend. */
export function StockfishHistory() {
  const [games, setGames] = useState<PlayedGame[]>([])
  // back from a review: its accuracy is in now
  useFocusEffect(
    useCallback(() => {
      void playedGames().then(setGames)
    }, []),
  )
  const progress = useMemo(() => trend(games), [games])
  if (games.length === 0) return null

  return (
    <View className="gap-2">
      <Text className="font-display text-xl uppercase text-foreground">
        Your games vs Stockfish
      </Text>
      {progress && (
        <Card>
          <Card.Body className="gap-1">
            <Text className="font-normal text-sm text-foreground">
              Accuracy over your last {Math.min(progress.reviewed, 5)} reviewed
              games:{' '}
              <Text className="font-bold text-accent">
                {progress.accuracy.toFixed(1)}%
              </Text>
              {progress.change !== null && (
                <Text
                  className={
                    progress.change >= 0 ? 'text-success' : 'text-danger'
                  }
                >
                  {' '}
                  ({progress.change >= 0 ? 'up' : 'down'}{' '}
                  {Math.abs(progress.change).toFixed(1)} from the 5 before)
                </Text>
              )}
            </Text>
            <Text className="font-normal text-xs text-muted">
              {progress.blundersPerGame.toFixed(1)} blunders a game
              {progress.weakest
                ? `; most of your mistakes come in ${PHASE_LABEL[progress.weakest]}, so that's the part to work on.`
                : '.'}
            </Text>
          </Card.Body>
        </Card>
      )}
      {games.slice(0, 10).map((game) => (
        <Card key={game.id} className="p-0">
          <PressableFeedback
            className="flex-row items-center gap-3 px-3 py-2.5"
            accessibilityLabel={`Review your ${game.outcome} as ${game.colour} against ${game.level}`}
            onPress={() =>
              router.push({
                pathname: '/train/analysis/game',
                params: { played: game.id },
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
            <View className="min-w-0 flex-1">
              <Text
                numberOfLines={1}
                className="font-semibold text-sm text-foreground"
              >
                Stockfish ({game.level})
              </Text>
              <Text
                numberOfLines={1}
                className="font-normal text-xs text-muted"
              >
                As {game.colour}
                {game.resigned ? ', resigned' : ''} ·{' '}
                {Math.ceil(positionsOf(game.pgn).sans.length / 2)} moves
              </Text>
            </View>
            <View className="items-end">
              <Text
                className={`font-semibold text-xs ${game.accuracy !== undefined ? 'text-accent' : 'text-muted'}`}
              >
                {game.accuracy !== undefined
                  ? `${game.accuracy.toFixed(1)}%`
                  : 'Review'}
              </Text>
              <Text className="font-normal text-2xs text-muted">
                {relativeTime(game.at)}
              </Text>
            </View>
          </PressableFeedback>
        </Card>
      ))}
    </View>
  )
}
