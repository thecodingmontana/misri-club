import { PIECES, type PieceCode } from '../pieces.generated.ts'

const LIGHT = '#eeeed2'
const DARK = '#769656'

/** A whole board as one SVG, for places a live board can't go (widgets). */
export function boardSvg(fen: string, orientation: 'white' | 'black'): string {
  const rows = fen.split(' ')[0].split('/')
  const parts: Array<string> = []
  rows.forEach((row, rank) => {
    let file = 0
    for (const char of row) {
      if (/\d/.test(char)) {
        file += Number(char)
        continue
      }
      const code = `${char === char.toUpperCase() ? 'w' : 'b'}${char.toUpperCase()}`
      const x = (orientation === 'white' ? file : 7 - file) * 45
      const y = (orientation === 'white' ? rank : 7 - rank) * 45
      parts.push(
        PIECES[code as PieceCode].replace(
          'width="100%" height="100%"',
          `x="${x}" y="${y}" width="45" height="45"`,
        ),
      )
      file++
    }
  })
  const squares: Array<string> = []
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++)
      squares.push(
        `<rect x="${f * 45}" y="${r * 45}" width="45" height="45" fill="${(r + f) % 2 ? DARK : LIGHT}"/>`,
      )
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360">${squares.join('')}${parts.join('')}</svg>`
}
