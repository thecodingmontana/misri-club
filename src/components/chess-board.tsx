import type { Square } from 'chess.js'
import { useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { useReducedMotion } from '#/lib/use-reduced-motion'
import { cn } from '#/lib/utils'

export interface BoardStep {
  label: string
  fen: string
  /** What this step shows, in a sentence. */
  caption: string
  arrow?: { from: Square; to: Square; tone: 'played' | 'best' | 'reply' }
  /** Undefended pieces under attack, ringed in red. */
  hanging?: Array<Square>
}

/** chess.com's board colours, shared by every board in the app. */
export const SQUARES = {
  darkSquareStyle: { backgroundColor: '#769656' },
  lightSquareStyle: { backgroundColor: '#eeeed2' },
}

const ARROW = {
  played: '#2f6f9f',
  best: '#2b7350',
  reply: '#c2412f',
} as const

const DOT = {
  played: 'bg-played',
  best: 'bg-primary',
  reply: 'bg-destructive',
} as const

const RING =
  'radial-gradient(circle, transparent 56%, rgb(194 65 47 / 0.9) 58%, rgb(194 65 47 / 0.9) 66%, transparent 68%)'

/**
 * A lesson board you step through: the position, then the move that was
 * played, the move Stockfish wanted, and how the opponent could punish it.
 * Pieces animate between steps, so the difference is something you watch
 * rather than read.
 */
export function ChessBoard({
  id,
  orientation,
  steps,
}: {
  id: string
  orientation: 'white' | 'black'
  steps: Array<BoardStep>
}) {
  const [index, setIndex] = useState(0)
  const reducedMotion = useReducedMotion()
  const current = steps[index]

  return (
    <div>
      <div className="overflow-hidden rounded-xl shadow-card">
        <Chessboard
          options={{
            id,
            position: current.fen,
            boardOrientation: orientation,
            allowDragging: false,
            allowDrawingArrows: false,
            animationDurationInMs: reducedMotion ? 0 : 350,
            ...SQUARES,
            arrows: current.arrow
              ? [
                  {
                    startSquare: current.arrow.from,
                    endSquare: current.arrow.to,
                    color: ARROW[current.arrow.tone],
                  },
                ]
              : [],
            squareStyles: Object.fromEntries(
              (current.hanging ?? []).map((square) => [
                square,
                { backgroundImage: RING },
              ]),
            ),
          }}
        />
      </div>

      <div
        className="mt-2 flex gap-1 rounded-full bg-secondary p-1"
        role="tablist"
        aria-label="Step through the position"
      >
        {steps.map((s, i) => (
          <button
            data-cuelume-select=""
            key={s.label}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => setIndex(i)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-[0.68rem] font-semibold transition-colors',
              i === index
                ? 'bg-background text-foreground shadow-card'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {s.arrow && (
              <span className={cn('size-2 rounded-full', DOT[s.arrow.tone])} />
            )}
            {s.label}
          </button>
        ))}
      </div>

      <p className="mt-2 min-h-[2.5em] text-xs leading-relaxed text-muted-foreground">
        {current.caption}
      </p>
    </div>
  )
}
