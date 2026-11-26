import type { NextGame, Standing } from '@misri/core/widgets'
import { ordinal, timeLeft } from '@misri/core/widgets'
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget'

/**
 * The home-screen widgets, drawn by Android from this JSX (not React Native
 * views: only the library's widget elements work here). Colours are the
 * app's theme (global.css), light and dark.
 */

export const LIGHT = {
  background: '#fbf8e6',
  foreground: '#1f4d3a',
  muted: '#587463',
  surface: '#e6ebd5',
  accent: '#2b7350',
} as const
export const DARK = {
  background: '#191c19',
  foreground: '#eceeea',
  muted: '#9ba59b',
  surface: '#2a2f2a',
  accent: '#5fbf6a',
} as const
export type Palette = typeof LIGHT | typeof DARK

type Hex = `#${string}`

/** The widget's card: rounded, padded, opens `uri` when tapped. */
function Shell({
  palette,
  uri,
  children,
  gap = 4,
}: {
  palette: Palette
  uri: string
  children: React.ReactNode
  gap?: number
}) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: palette.background as Hex,
        borderRadius: 24,
        padding: 16,
        flexDirection: 'column',
        justifyContent: 'center',
        flexGap: gap,
      }}
    >
      {children}
    </FlexWidget>
  )
}

function Kicker({ palette, text }: { palette: Palette; text: string }) {
  return (
    <TextWidget
      text={text.toUpperCase()}
      style={{
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.12,
        color: palette.accent as Hex,
      }}
    />
  )
}

function Line({
  palette,
  text,
  size = 13,
  muted = false,
  bold = false,
}: {
  palette: Palette
  text: string
  size?: number
  muted?: boolean
  bold?: boolean
}) {
  return (
    <TextWidget
      text={text}
      maxLines={1}
      truncate="END"
      style={{
        fontSize: size,
        fontWeight: bold ? '700' : '400',
        color: (muted ? palette.muted : palette.foreground) as Hex,
      }}
    />
  )
}

/** The widget's size on the home screen, in dp (from Android). */
export type Size = { width: number; height: number }

/** For anything that needs you signed in first. */
export function SignedOut({ palette }: { palette: Palette }) {
  return (
    <Shell palette={palette} uri="misri://">
      <Kicker palette={palette} text="Misri" />
      <Line palette={palette} text="Sign in to see your games" muted />
    </Shell>
  )
}

function Big({ palette, text }: { palette: Palette; text: string }) {
  return (
    <TextWidget
      text={text}
      maxLines={1}
      style={{
        fontSize: 36,
        fontWeight: '800',
        color: palette.foreground as Hex,
      }}
    />
  )
}

export function NextGameWidget({
  palette,
  game,
}: {
  palette: Palette
  game: NextGame | null
}) {
  if (!game) {
    return (
      <Shell palette={palette} uri="misri://" gap={6}>
        <Kicker palette={palette} text="Your next game" />
        <Line palette={palette} text="No games due" size={20} bold />
        <Line palette={palette} text="You're all caught up." muted />
      </Shell>
    )
  }
  return (
    <Shell palette={palette} uri={`misri://c/${game.slug}`} gap={6}>
      <Kicker palette={palette} text="Your next game" />
      <Line palette={palette} text={`vs ${game.opponent}`} size={20} bold />
      <Line palette={palette} text={game.competition} muted />
      <FlexWidget
        style={{
          backgroundColor: palette.surface as Hex,
          borderRadius: 12,
          paddingHorizontal: 10,
          paddingVertical: 4,
          marginTop: 4,
        }}
      >
        <TextWidget
          text={timeLeft(game.dueAt)}
          style={{
            fontSize: 13,
            fontWeight: '700',
            color: palette.accent as Hex,
          }}
        />
      </FlexWidget>
    </Shell>
  )
}

export function StandingWidget({
  palette,
  standing,
}: {
  palette: Palette
  standing: Standing | null
}) {
  if (!standing) {
    return (
      <Shell palette={palette} uri="misri://" gap={6}>
        <Kicker palette={palette} text="My standing" />
        <Line palette={palette} text="No competition running" muted />
      </Shell>
    )
  }
  return (
    <Shell palette={palette} uri={`misri://c/${standing.slug}`} gap={4}>
      <Kicker palette={palette} text="My standing" />
      <Big palette={palette} text={ordinal(standing.place)} />
      <Line
        palette={palette}
        text={`of ${standing.of} · ${standing.points} pts`}
        bold
      />
      <TextWidget
        text={standing.competition}
        maxLines={2}
        truncate="END"
        style={{ fontSize: 13, color: palette.muted as Hex }}
      />
    </Shell>
  )
}

/** The last four weeks as two rows of squares, sized to fill `width`. */
function daysSvg(days: Array<string>, palette: Palette, width: number) {
  const trained = new Set(days)
  const today = new Date()
  const gap = 4
  const cell = (width - gap * 13) / 14
  const squares: Array<string> = []
  for (let i = 0; i < 28; i++) {
    const day = new Date(today)
    day.setDate(today.getDate() - (27 - i))
    const on = trained.has(day.toLocaleDateString('en-CA'))
    squares.push(
      `<rect x="${(i % 14) * (cell + gap)}" y="${Math.floor(i / 14) * (cell + gap)}" width="${cell}" height="${cell}" rx="${cell / 4}" fill="${on ? palette.accent : palette.surface}"/>`,
    )
  }
  const height = cell * 2 + gap
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${squares.join('')}</svg>`,
    height,
    count: squares.filter((sq) => sq.includes(palette.accent)).length,
  }
}

export function StreakWidget({
  palette,
  streak,
  days,
  size,
}: {
  palette: Palette
  streak: number
  days: Array<string>
  size: Size
}) {
  // the squares fill the card's width; the shell pads 16 each side
  const grid = daysSvg(days, palette, Math.max(size.width - 32, 120))
  return (
    <Shell palette={palette} uri="misri://train/progress" gap={8}>
      <Kicker palette={palette} text="Training streak" />
      <FlexWidget
        style={{ flexDirection: 'row', alignItems: 'center', flexGap: 8 }}
      >
        <Big palette={palette} text={String(streak)} />
        <Line palette={palette} text={streak === 1 ? 'day' : 'days'} muted />
      </FlexWidget>
      <SvgWidget
        svg={grid.svg}
        style={{ width: Math.max(size.width - 32, 120), height: grid.height }}
      />
      {size.height >= 160 && (
        <Line
          palette={palette}
          text={`Trained on ${grid.count} of the last 28 days`}
          muted
        />
      )}
    </Shell>
  )
}

export function PuzzleWidget({
  palette,
  board,
  colour,
  size,
}: {
  palette: Palette
  /** the board as SVG, or null when Lichess couldn't be reached */
  board: string | null
  colour: 'white' | 'black'
  size: Size
}) {
  // square, as big as the card allows under its one header line
  const side = Math.max(Math.min(size.width - 32, size.height - 64), 80)
  return (
    <Shell palette={palette} uri="misri://train/puzzles?daily=1" gap={8}>
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          width: 'match_parent',
        }}
      >
        <Kicker palette={palette} text="Daily puzzle" />
        <Line
          palette={palette}
          text={`${colour === 'white' ? 'White' : 'Black'} to play`}
          muted
        />
      </FlexWidget>
      {board ? (
        <FlexWidget style={{ width: 'match_parent', alignItems: 'center' }}>
          <SvgWidget svg={board} style={{ width: side, height: side }} />
        </FlexWidget>
      ) : (
        <Line palette={palette} text="Tap to open today's puzzle" muted />
      )}
    </Shell>
  )
}
