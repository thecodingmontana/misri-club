import type { Square } from 'chess.js'
import { Chess } from 'chess.js'
import { useMemo, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { SQUARES } from '#/components/chess-board'

const LAST_MOVE = { backgroundColor: 'rgb(255 214 64 / 0.45)' }
const SELECTED = { backgroundColor: 'rgb(43 115 80 / 0.45)' }
const HINT = { boxShadow: 'inset 0 0 0 4px rgb(43 115 80 / 0.9)' }
const DOT = {
  backgroundImage:
    'radial-gradient(circle, rgb(0 0 0 / 0.22) 22%, transparent 24%)',
}
const CAPTURE = {
  backgroundImage:
    'radial-gradient(circle, transparent 62%, rgb(0 0 0 / 0.22) 64%)',
}

/**
 * A board the visitor plays on: drag a piece, or tap it and then its square,
 * which is the reliable way on a phone. `onMove` decides whether the move
 * stands; return false and the piece goes back.
 */
export function PlayBoard({
  id,
  fen,
  orientation,
  interactive,
  onMove,
  lastMove,
  hint,
}: {
  id: string
  fen: string
  orientation: 'white' | 'black'
  interactive: boolean
  onMove: (from: string, to: string) => boolean
  lastMove?: { from: string; to: string } | null
  /** A square to ring, e.g. the piece a hint points at. */
  hint?: string | null
}) {
  const chess = useMemo(() => new Chess(fen), [fen])
  // Keyed by position, so a selection never outlives the move it was for.
  const [picked, setPicked] = useState<{ fen: string; square: string } | null>(
    null,
  )
  const selected = picked?.fen === fen ? picked.square : null

  const targets = selected
    ? chess.moves({ square: selected as Square, verbose: true })
    : []
  const isOwn = (square: string) =>
    chess.get(square as Square)?.color === chess.turn()

  const move = (from: string, to: string) => {
    setPicked(null)
    return onMove(from, to)
  }

  const styles: Record<string, React.CSSProperties> = {}
  if (lastMove) {
    styles[lastMove.from] = LAST_MOVE
    styles[lastMove.to] = LAST_MOVE
  }
  if (hint) styles[hint] = { ...styles[hint], ...HINT }
  if (selected) styles[selected] = SELECTED
  for (const target of targets) {
    styles[target.to] = {
      ...styles[target.to],
      ...(target.captured ? CAPTURE : DOT),
    }
  }

  return (
    <div className="overflow-hidden rounded-xl shadow-card">
      <Chessboard
        options={{
          id,
          position: fen,
          boardOrientation: orientation,
          allowDragging: interactive,
          allowDrawingArrows: false,
          animationDurationInMs: 200,
          ...SQUARES,
          squareStyles: styles,
          canDragPiece: ({ square }) =>
            interactive && square !== null && isOwn(square),
          onPieceDrop: ({ sourceSquare, targetSquare }) =>
            targetSquare !== null && move(sourceSquare, targetSquare),
          onSquareClick: ({ square }) => {
            if (!interactive) return
            if (selected && targets.some((t) => t.to === square)) {
              move(selected, square)
            } else {
              setPicked(
                isOwn(square) && square !== selected ? { fen, square } : null,
              )
            }
          },
        }}
      />
    </div>
  )
}
