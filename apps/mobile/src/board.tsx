import { Chess, type Square } from 'chess.js'
import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { PIECES, type PieceCode } from '@/pieces.generated'

// chess.com's colours, as on the website's boards
const DARK = '#769656'
const LIGHT = '#eeeed2'
const LAST = 'rgba(255, 255, 51, 0.45)'
const PICKED = 'rgba(20, 85, 30, 0.5)'
const HINT = 'rgba(43, 115, 80, 0.55)'

const FILES = 'abcdefgh'

/**
 * A board you play by tapping: your piece, then where it goes. Legal moves
 * show as dots; the last move and a hint are tinted. `onMove` says whether
 * the move stood (a wrong puzzle move is undone by not changing `fen`).
 */
export function Board({
  fen,
  orientation,
  interactive,
  onMove,
  lastMove,
  hint,
}: {
  fen: string
  orientation: 'white' | 'black'
  interactive: boolean
  onMove: (from: string, to: string) => unknown
  lastMove: { from: string; to: string } | null
  hint: string | null
}) {
  const [size, setSize] = useState(0)
  const [picked, setPicked] = useState<Square | null>(null)
  const chess = useMemo(() => new Chess(fen), [fen])
  const targets = useMemo(
    () =>
      picked
        ? new Set(
            chess.moves({ square: picked, verbose: true }).map((m) => m.to),
          )
        : new Set<string>(),
    [chess, picked],
  )

  const press = (square: Square) => {
    if (!interactive) return
    const piece = chess.get(square)
    if (picked && targets.has(square)) {
      setPicked(null)
      onMove(picked, square)
      return
    }
    // your own piece: pick it (again to put it down)
    setPicked(
      piece && piece.color === chess.turn() && square !== picked
        ? square
        : null,
    )
  }

  const ranks =
    orientation === 'white'
      ? [8, 7, 6, 5, 4, 3, 2, 1]
      : [1, 2, 3, 4, 5, 6, 7, 8]
  const files = orientation === 'white' ? [...FILES] : [...FILES].reverse()
  const cell = size / 8

  return (
    <View
      className="aspect-square w-full overflow-hidden rounded-xl"
      onLayout={(e) => setSize(e.nativeEvent.layout.width)}
      accessibilityLabel="Chessboard"
    >
      {size > 0 &&
        ranks.map((rank, row) => (
          <View key={rank} className="flex-row">
            {files.map((file, col) => {
              const square = `${file}${rank}` as Square
              const piece = chess.get(square)
              const dark = (FILES.indexOf(file) + rank) % 2 === 0
              const tint =
                square === picked
                  ? PICKED
                  : square === hint
                    ? HINT
                    : lastMove &&
                        (square === lastMove.from || square === lastMove.to)
                      ? LAST
                      : null
              const label = (dark: boolean) => ({
                color: dark ? LIGHT : DARK,
                fontSize: cell * 0.2,
              })
              return (
                <Pressable
                  key={square}
                  onPress={() => press(square)}
                  accessibilityLabel={
                    piece
                      ? `${square}, ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}`
                      : square
                  }
                  style={{
                    width: cell,
                    height: cell,
                    backgroundColor: dark ? DARK : LIGHT,
                  }}
                >
                  {tint && (
                    <View
                      style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundColor: tint,
                      }}
                    />
                  )}
                  {col === 0 && (
                    <Text
                      className="absolute top-0.5 left-0.5 font-semibold"
                      style={label(dark)}
                    >
                      {rank}
                    </Text>
                  )}
                  {row === 7 && (
                    <Text
                      className="absolute right-1 bottom-0 font-semibold"
                      style={label(dark)}
                    >
                      {file}
                    </Text>
                  )}
                  {piece && (
                    <SvgXml
                      xml={
                        PIECES[
                          `${piece.color}${piece.type.toUpperCase()}` as PieceCode
                        ]
                      }
                      width={cell}
                      height={cell}
                    />
                  )}
                  {targets.has(square) && (
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        left: cell * (piece ? 0.04 : 0.35),
                        top: cell * (piece ? 0.04 : 0.35),
                        width: cell * (piece ? 0.92 : 0.3),
                        height: cell * (piece ? 0.92 : 0.3),
                        borderRadius: cell,
                        backgroundColor: piece
                          ? 'transparent'
                          : 'rgba(0,0,0,0.18)',
                        borderWidth: piece ? cell * 0.07 : 0,
                        borderColor: 'rgba(0,0,0,0.18)',
                      }}
                    />
                  )}
                </Pressable>
              )
            })}
          </View>
        ))}
    </View>
  )
}
