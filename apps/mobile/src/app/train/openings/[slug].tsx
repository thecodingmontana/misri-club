import {
  lichessOpeningUrl,
  type OpeningCourse,
  opening,
} from '@misri/core/openings'
import { Chess, type Move } from 'chess.js'
import { Stack, useLocalSearchParams } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { Button, Card, Tabs, useThemeColor } from 'heroui-native'
import { useEffect, useMemo, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { Board } from '@/board'
import { Problem, Screen } from '@/components'
import { Icon } from '@/icon'
import { play } from '@/lib/sound'

/** One opening course: Learn the line move by move, or Drill it from memory. */
export default function Course() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const course = opening(slug)
  const moves = useMemo(() => {
    if (!course) return []
    const chess = new Chess()
    chess.loadPgn(course.moves)
    return chess.history({ verbose: true })
  }, [course])
  const [mode, setMode] = useState('learn')

  if (!course) {
    return (
      <Screen>
        <Problem message="No opening by that name." onRetry={() => {}} />
      </Screen>
    )
  }
  const [title, variation] = course.name.split(': ')

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-12">
        <View className="items-center gap-1">
          <Text className="font-display text-center text-3xl uppercase text-foreground">
            {title}
          </Text>
          <Text className="font-normal text-center text-xs text-muted">
            {variation ? `${variation} · ` : ''}
            {course.eco} · you play{' '}
            {course.side === 'white' ? 'White' : 'Black'}
          </Text>
        </View>
        <Tabs value={mode} onValueChange={setMode}>
          <Tabs.List className="w-full">
            <Tabs.Indicator />
            <Tabs.Trigger value="learn" className="flex-1">
              <Tabs.Label>Learn the line</Tabs.Label>
            </Tabs.Trigger>
            <Tabs.Trigger value="drill" className="flex-1">
              <Tabs.Label>Drill it</Tabs.Label>
            </Tabs.Trigger>
          </Tabs.List>
        </Tabs>
        {mode === 'learn' ? (
          <Learn
            course={course}
            moves={moves}
            onDrill={() => setMode('drill')}
          />
        ) : (
          <Drill course={course} moves={moves} />
        )}
        <Button
          variant="ghost"
          size="sm"
          onPress={() =>
            WebBrowser.openBrowserAsync(lichessOpeningUrl(course.name))
          }
        >
          <Button.Label>Statistics and master games on Lichess</Button.Label>
          <Icon name="ExternalLink" size={14} />
        </Button>
      </ScrollView>
    </Screen>
  )
}

function Learn({
  course,
  moves,
  onDrill,
}: {
  course: OpeningCourse
  moves: Array<Move>
  onDrill: () => void
}) {
  const [ply, setPly] = useState(0)
  const done = ply === moves.length
  const fen = ply === 0 ? moves[0].before : moves[ply - 1].after
  const last = ply > 0 ? moves[ply - 1] : null
  const go = (next: number) => {
    setPly(Math.max(0, Math.min(moves.length, next)))
    play('select')
  }

  return (
    <>
      <Board
        fen={fen}
        orientation={course.side}
        interactive={false}
        onMove={() => {}}
        lastMove={last ? { from: last.from, to: last.to } : null}
        hint={null}
      />
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
        <Text className="flex-1 text-center font-normal text-xs text-muted">
          Move {ply} of {moves.length}
          <CloudEval fen={fen} />
        </Text>
        <Button
          variant="secondary"
          isIconOnly
          accessibilityLabel="Next move"
          isDisabled={done}
          onPress={() => go(ply + 1)}
        >
          <Icon name="ChevronRight" size={18} />
        </Button>
      </View>
      <Card>
        <Card.Body className="gap-1">
          {last ? (
            <>
              <Text className="font-semibold text-sm text-foreground">
                {Math.ceil(ply / 2)}
                {ply % 2 ? '.' : '...'} {last.san}
              </Text>
              <Text className="font-normal text-sm text-foreground">
                {course.why[ply - 1]}
              </Text>
            </>
          ) : (
            <Text className="font-normal text-sm text-foreground">
              {course.summary}
            </Text>
          )}
        </Card.Body>
      </Card>
      {done && (
        <Card>
          <Card.Body className="gap-2">
            <Text className="font-semibold text-sm text-foreground">
              Plans from here
            </Text>
            {course.plans.map((plan) => (
              <Text key={plan} className="font-normal text-sm text-foreground">
                • {plan}
              </Text>
            ))}
            <Button className="mt-1" onPress={onDrill}>
              Drill this line
            </Button>
          </Card.Body>
        </Card>
      )}
    </>
  )
}

/** Lichess's cloud evaluation, from White's side, when it has one. */
function CloudEval({ fen }: { fen: string }) {
  const [value, setValue] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setValue(null)
    fetch(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { pvs?: Array<{ cp?: number; mate?: number }> } | null) => {
        const pv = body?.pvs?.[0]
        if (!live || !pv) return
        const cp = pv.cp ?? 0
        setValue(
          pv.mate !== undefined
            ? `#${pv.mate}`
            : `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)}`,
        )
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [fen])
  return value ? <Text> · Eval {value}</Text> : null
}

function Drill({
  course,
  moves,
}: {
  course: OpeningCourse
  moves: Array<Move>
}) {
  const accent = useThemeColor('accent')
  const [ply, setPly] = useState(0)
  const [slipped, setSlipped] = useState(false)
  const [wrong, setWrong] = useState(false)
  const [shown, setShown] = useState(false)
  const done = ply === moves.length
  const fen = ply === 0 ? moves[0].before : moves[ply - 1].after
  const last = ply > 0 ? moves[ply - 1] : null
  const yourTurn = !done && moves[ply].color === course.side[0]

  // the book replies for the other side play themselves
  useEffect(() => {
    if (done || yourTurn) return
    const timer = setTimeout(() => {
      setPly(ply + 1)
      play('select')
    }, 500)
    return () => clearTimeout(timer)
  }, [done, yourTurn, ply])

  useEffect(() => {
    if (done) play('success')
  }, [done])

  const onMove = (from: string, to: string) => {
    const book = moves[ply]
    if (book.from !== from || book.to !== to) {
      play('error')
      setSlipped(true)
      setWrong(true)
      return
    }
    play('tap')
    setWrong(false)
    setShown(false)
    setPly(ply + 1)
  }

  const message = done
    ? slipped
      ? 'Line complete. Run it again without a slip to make it stick.'
      : 'Perfect run! You played every move from memory.'
    : wrong
      ? 'That is not the book move. Try again.'
      : yourTurn
        ? `Your move as ${course.side === 'white' ? 'White' : 'Black'}.`
        : 'The book reply…'

  return (
    <>
      <Board
        fen={fen}
        orientation={course.side}
        interactive={yourTurn}
        onMove={onMove}
        lastMove={last ? { from: last.from, to: last.to } : null}
        hint={shown && yourTurn ? moves[ply].from : null}
      />
      <View className="min-h-6 flex-row items-center justify-center gap-1.5">
        {done && !slipped && (
          <Icon name="CheckCircle" size={16} color={accent} />
        )}
        <Text className="font-semibold text-center text-sm text-foreground">
          {shown && yourTurn
            ? `Move the piece on ${moves[ply].from}.`
            : message}
        </Text>
      </View>
      <View className="flex-row gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          isDisabled={!yourTurn || shown}
          onPress={() => {
            setShown(true)
            setSlipped(true)
          }}
        >
          <Icon name="Lightbulb" size={16} />
          <Button.Label>Show me</Button.Label>
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          onPress={() => {
            setPly(0)
            setSlipped(false)
            setWrong(false)
            setShown(false)
          }}
        >
          Start over
        </Button>
      </View>
    </>
  )
}
