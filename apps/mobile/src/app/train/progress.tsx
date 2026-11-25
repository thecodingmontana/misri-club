import { MASTER_GAMES } from '@misri/core/masters'
import { OPENINGS } from '@misri/core/openings'
import { LEVELS, type SavedGame, savedGame } from '@misri/core/play'
import { THEMES, type Theme } from '@misri/core/puzzle'
import { router, Stack, useFocusEffect } from 'expo-router'
import {
  Button,
  Card,
  PressableFeedback,
  Skeleton,
  useThemeColor,
} from 'heroui-native'
import { type ReactNode, useCallback, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { PageTitle } from '@/competitions'
import { Screen } from '@/components'
import { Icon } from '@/icon'
import {
  PHONE_PLAY_KEY,
  type Progress,
  readProgress,
  streak,
  weakestThemes,
} from '@/lib/progress'
import * as Store from '@/lib/storage'

/** What you've practised on this phone, as the website's progress page. */
export default function ProgressScreen() {
  const [stored, setStored] = useState<{
    progress: Progress
    record: SavedGame['record']
  } | null>(null)
  // re-read on every visit: a puzzle solved a moment ago should count
  useFocusEffect(
    useCallback(() => {
      Promise.all([
        readProgress(),
        Store.getItemAsync(PHONE_PLAY_KEY)
          .then((text) => savedGame.safeParse(JSON.parse(text ?? 'null')))
          .then((game) => (game.success ? game.data.record : {}))
          .catch(() => ({})),
      ]).then(([progress, record]) => setStored({ progress, record }))
    }, []),
  )

  const progress = stored?.progress
  const record = stored?.record ?? {}
  const drills = Object.values(progress?.openings ?? {}).reduce(
    (sum, tally) => sum + tally.done,
    0,
  )
  const guesses = Object.values(progress?.masters ?? {})
  const found = guesses.reduce((sum, g) => sum + g.found, 0)
  const tried = guesses.reduce((sum, g) => sum + g.tried, 0)
  const empty =
    progress !== undefined &&
    Object.keys(progress.puzzles).length === 0 &&
    drills === 0 &&
    tried === 0 &&
    Object.keys(record).length === 0

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-12">
        <PageTitle
          title="Your progress"
          lead="Streak, puzzle themes and records, saved on this phone."
        />
        <View className="flex-row flex-wrap gap-2">
          <Tile label="Day streak" icon="Fire">
            {progress && streak(progress.days)}
          </Tile>
          <Tile label="Puzzles solved">{progress?.solved.done}</Tile>
          <Tile label="Opening runs">{progress && drills}</Tile>
          <Tile label="Master moves found">
            {progress &&
              (tried ? `${Math.round((found / tried) * 100)}%` : 'None yet')}
          </Tile>
        </View>
        {empty ? (
          <Card>
            <Card.Body className="items-center gap-2 py-4">
              <Text className="font-semibold text-sm text-foreground">
                Nothing to show yet
              </Text>
              <Text className="text-center font-normal text-xs text-muted">
                Solve a puzzle, drill an opening or guess a master game, and
                your progress appears here. It is saved on this phone.
              </Text>
              <Button size="sm" onPress={() => router.push('/train/puzzles')}>
                Start training
              </Button>
            </Card.Body>
          </Card>
        ) : (
          progress && (
            <>
              <Calendar days={progress.days} />
              <ThemeBars puzzles={progress.puzzles} />
              <PractiseNext puzzles={progress.puzzles} />
              <Openings openings={progress.openings} />
              <Stockfish record={record} />
              <Masters masters={progress.masters} />
            </>
          )
        )}
      </ScrollView>
    </Screen>
  )
}

function Tile({
  label,
  icon,
  children,
}: {
  label: string
  icon?: 'Fire'
  /** undefined while the phone's storage is read */
  children: ReactNode
}) {
  const accent = useThemeColor('accent')
  return (
    <Card className="grow basis-[45%] px-4 py-3">
      <View className="flex-row items-center gap-1">
        {icon && <Icon name={icon} size={14} color={accent} />}
        <Text className="font-normal text-xs text-muted">{label}</Text>
      </View>
      {children === undefined ? (
        <Skeleton className="mt-1 h-7 w-12 rounded-md" />
      ) : (
        <Text className="font-display text-2xl text-foreground">
          {children}
        </Text>
      )}
    </Card>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <Card.Body className="gap-2">
        <Text className="font-semibold text-sm text-foreground">{title}</Text>
        {children}
      </Card.Body>
    </Card>
  )
}

/** The last four weeks, one square per day, oldest first. */
function Calendar({ days }: { days: Array<string> }) {
  const trained = new Set(days)
  const today = new Date()
  const squares = Array.from({ length: 28 }, (_, i) => {
    const day = new Date(today)
    day.setDate(today.getDate() - (27 - i))
    const key = day.toLocaleDateString('en-CA')
    return { key, on: trained.has(key) }
  })
  const count = squares.filter((square) => square.on).length
  return (
    <Section title="Training days">
      {[squares.slice(0, 14), squares.slice(14)].map((week) => (
        <View key={week[0].key} className="flex-row gap-1">
          {week.map((square) => (
            <View
              key={square.key}
              className={`aspect-square flex-1 rounded ${square.on ? 'bg-accent' : 'bg-default'}`}
            />
          ))}
        </View>
      ))}
      <Text
        className="font-normal text-xs text-muted"
        accessibilityLabel={`You trained on ${count} of the last 28 days.`}
      >
        You trained on {count} of the last 28 days.
      </Text>
    </Section>
  )
}

/** Puzzles per trainable theme, most practised first: clean, then helped. */
function ThemeBars({ puzzles }: { puzzles: Progress['puzzles'] }) {
  const rows = Object.entries(puzzles)
    .filter(([theme]) => theme in THEMES)
    .map(([theme, tally]) => ({
      theme: THEMES[theme as Theme],
      clean: tally.clean,
      helped: tally.done - tally.clean,
    }))
    .sort((a, b) => b.clean + b.helped - (a.clean + a.helped))
    .slice(0, 8)
  if (rows.length === 0) return null
  const most = Math.max(...rows.map((row) => row.clean + row.helped))
  return (
    <Section title="Puzzles by theme">
      {rows.map((row) => (
        <View
          key={row.theme}
          className="flex-row items-center gap-2"
          accessible
          accessibilityLabel={`${row.theme}: ${row.clean} clean, ${row.helped} with help`}
        >
          <Text
            className="w-28 font-normal text-xs text-foreground"
            numberOfLines={1}
          >
            {row.theme}
          </Text>
          <View className="h-4 flex-1">
            {/* the bar is rounded at both ends, however long it is */}
            <View
              className="h-full flex-row overflow-hidden rounded-full"
              style={{ width: `${((row.clean + row.helped) / most) * 100}%` }}
            >
              <View className="bg-accent" style={{ flex: row.clean }} />
              <View className="bg-muted" style={{ flex: row.helped }} />
            </View>
          </View>
          <Text className="w-6 text-right font-normal text-xs text-muted">
            {row.clean + row.helped}
          </Text>
        </View>
      ))}
      <View className="flex-row gap-4">
        <Legend className="bg-accent" label="Solved cleanly" />
        <Legend className="bg-muted" label="With a slip or hint" />
      </View>
    </Section>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={`size-2.5 rounded-sm ${className}`} />
      <Text className="font-normal text-[11px] text-muted">{label}</Text>
    </View>
  )
}

function PractiseNext({ puzzles }: { puzzles: Progress['puzzles'] }) {
  const weak = weakestThemes(
    Object.fromEntries(Object.entries(puzzles).filter(([t]) => t in THEMES)),
  )
  if (weak.length === 0) return null
  return (
    <Section title="Practise next">
      <Text className="font-normal text-xs text-muted">
        Your lowest clean-solve rates. A few more puzzles here will help most.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {weak.map(({ theme, rate }) => (
          <PressableFeedback
            key={theme}
            onPress={() =>
              router.push({ pathname: '/train/puzzles', params: { theme } })
            }
            className="rounded-full bg-default px-3 py-1.5"
          >
            <Text className="font-semibold text-xs text-foreground">
              {THEMES[theme as Theme]} · {Math.round(rate * 100)}%
            </Text>
          </PressableFeedback>
        ))}
      </View>
    </Section>
  )
}

/** A small table: a header row, then one row per entry. */
function Table({
  head,
  rows,
}: {
  head: Array<string>
  rows: Array<{ key: string; cells: Array<string | number>; href?: string }>
}) {
  const line = (cells: Array<string | number>, header: boolean) =>
    cells.map((cell, i) => (
      <Text
        key={`${i}`}
        numberOfLines={1}
        className={`font-normal text-xs ${i === 0 ? 'flex-1' : 'w-14 text-right'} ${header ? 'text-muted' : 'text-foreground'}`}
      >
        {cell}
      </Text>
    ))
  return (
    <View>
      <View className="flex-row pb-1">{line(head, true)}</View>
      {rows.map((row) => (
        <PressableFeedback
          key={row.key}
          isDisabled={!row.href}
          onPress={() => row.href && router.push(row.href as never)}
          className="flex-row items-center border-t border-border py-2"
        >
          {line(row.cells, false)}
        </PressableFeedback>
      ))}
    </View>
  )
}

function Openings({ openings }: { openings: Progress['openings'] }) {
  const rows = OPENINGS.filter((course) => openings[course.slug])
  if (rows.length === 0) return null
  return (
    <Section title="Openings drilled">
      <Table
        head={['Course', 'Runs', 'Perfect']}
        rows={rows.map((course) => ({
          key: course.slug,
          href: `/train/openings/${course.slug}`,
          cells: [
            course.name.split(':')[0],
            openings[course.slug].done,
            openings[course.slug].clean,
          ],
        }))}
      />
    </Section>
  )
}

function Stockfish({ record }: { record: SavedGame['record'] }) {
  const rows = LEVELS.filter((level) => record[level.label])
  if (rows.length === 0) return null
  return (
    <Section title="Against Stockfish">
      <Table
        head={['Level', 'Won', 'Drawn', 'Lost']}
        rows={rows.map((level) => ({
          key: level.label,
          cells: [
            level.label,
            record[level.label].win,
            record[level.label].draw,
            record[level.label].loss,
          ],
        }))}
      />
    </Section>
  )
}

function Masters({ masters }: { masters: Progress['masters'] }) {
  const rows = MASTER_GAMES.filter((game) => masters[game.slug])
  if (rows.length === 0) return null
  return (
    <Section title="Best guess-the-move scores">
      <Table
        head={['Game', 'Found']}
        rows={rows.map((game) => ({
          key: game.slug,
          href: `/train/masters/${game.slug}`,
          cells: [
            game.title,
            `${masters[game.slug].found}/${masters[game.slug].tried}`,
          ],
        }))}
      />
    </Section>
  )
}
