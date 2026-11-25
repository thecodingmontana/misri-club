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

/** For anything that needs you signed in first. */
export function SignedOut({ palette }: { palette: Palette }) {
  return (
    <Shell palette={palette} uri="misri://">
      <Kicker palette={palette} text="Misri" />
      <Line palette={palette} text="Sign in to see your games" muted />
    </Shell>
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
      <Shell palette={palette} uri="misri://">
        <Kicker palette={palette} text="Your next game" />
        <Line palette={palette} text="No games due" size={18} bold />
        <Line palette={palette} text="You're all caught up." muted />
      </Shell>
    )
  }
  return (
    <Shell palette={palette} uri={`misri://c/${game.slug}`}>
      <Kicker palette={palette} text="Your next game" />
      <Line palette={palette} text={`vs ${game.opponent}`} size={18} bold />
      <Line palette={palette} text={game.competition} muted />
      <TextWidget
        text={timeLeft(game.dueAt)}
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: palette.accent as Hex,
        }}
      />
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
      <Shell palette={palette} uri="misri://">
        <Kicker palette={palette} text="My standing" />
        <Line palette={palette} text="No competition running" muted />
      </Shell>
    )
  }
  return (
    <Shell palette={palette} uri={`misri://c/${standing.slug}`}>
      <Kicker palette={palette} text="My standing" />
      <FlexWidget style={{ flexDirection: 'row', flexGap: 8 }}>
        <TextWidget
          text={ordinal(standing.place)}
          style={{
            fontSize: 32,
            fontWeight: '800',
            color: palette.foreground as Hex,
          }}
        />
        <FlexWidget
          style={{ flexDirection: 'column', justifyContent: 'center' }}
        >
          <Line palette={palette} text={`of ${standing.of}`} muted />
          <Line palette={palette} text={`${standing.points} pts`} bold />
        </FlexWidget>
      </FlexWidget>
      <Line palette={palette} text={standing.competition} muted />
    </Shell>
  )
}

/** The last four weeks as squares, as on the Progress screen. */
function daysSvg(days: Array<string>, palette: Palette) {
  const trained = new Set(days)
  const today = new Date()
  const squares: Array<string> = []
  for (let i = 0; i < 28; i++) {
    const day = new Date(today)
    day.setDate(today.getDate() - (27 - i))
    const on = trained.has(day.toLocaleDateString('en-CA'))
    squares.push(
      `<rect x="${(i % 14) * 20}" y="${Math.floor(i / 14) * 20}" width="17" height="17" rx="4" fill="${on ? palette.accent : palette.surface}"/>`,
    )
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 277 37">${squares.join('')}</svg>`
}

export function StreakWidget({
  palette,
  streak,
  days,
}: {
  palette: Palette
  streak: number
  days: Array<string>
}) {
  return (
    <Shell palette={palette} uri="misri://train/progress" gap={8}>
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
        }}
      >
        <Kicker palette={palette} text="Training streak" />
        <Line
          palette={palette}
          text={streak === 1 ? '1 day' : `${streak} days`}
          bold
        />
      </FlexWidget>
      <SvgWidget
        svg={daysSvg(days, palette)}
        style={{ width: 'match_parent', height: 40 }}
      />
    </Shell>
  )
}

export function PuzzleWidget({
  palette,
  board,
  colour,
}: {
  palette: Palette
  /** the board as SVG, or null when Lichess couldn't be reached */
  board: string | null
  colour: 'white' | 'black'
}) {
  return (
    <Shell palette={palette} uri="misri://train/puzzles?daily=1" gap={6}>
      <Kicker palette={palette} text="Daily puzzle" />
      {board ? (
        // the board takes the space the two lines leave
        <FlexWidget style={{ flex: 1, width: 'match_parent' }}>
          <SvgWidget
            svg={board}
            style={{ width: 'match_parent', height: 'match_parent' }}
          />
        </FlexWidget>
      ) : (
        <Line palette={palette} text="Tap to open today's puzzle" muted />
      )}
      <Line
        palette={palette}
        text={`${colour === 'white' ? 'White' : 'Black'} to play`}
        muted
      />
    </Shell>
  )
}
