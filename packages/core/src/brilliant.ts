import { MASTER_GAMES, plyOf } from './masters.ts'
import type { Theme } from './puzzle.ts'

// The "How to find brilliant moves" lesson, shared by the website and the app.

export const CHECKLIST = [
  {
    title: 'Checks, captures, threats',
    text: 'Before any other move, look at every check, every capture and every threat, for both sides. Brilliant moves are almost always one of these.',
  },
  {
    title: 'Find the weak spot',
    text: 'An exposed king, a piece nobody defends, a back rank with no escape square. A sacrifice needs a target.',
  },
  {
    title: 'Ask what each defender does',
    text: 'If one piece guards two things, it is overloaded: attack one, and the other falls. Deflection and attraction drag defenders away.',
  },
  {
    title: 'Count attackers and defenders',
    text: 'A sacrifice works when, after it, you have more pieces attacking the key square than they have defending it.',
  },
  {
    title: 'Try the quiet move',
    text: 'The hardest brilliancies are not captures at all, like Anderssen’s 18.Bd6 or 19.Rad1: a calm move that cuts off the defence while the threats stay.',
  },
  {
    title: 'Calculate to the end',
    text: 'Follow the forcing line until the position is quiet. If you are still winning, or mating, it is brilliant. If not, it was just a gamble.',
  },
]

export const PRACTICE: Array<Theme> = [
  'sacrifice',
  'deflection',
  'attraction',
  'quietMove',
  'doubleCheck',
  'mateIn2',
]

/** Every brilliant move in the master library, linked to its moment. */
export const BRILLIANCIES = MASTER_GAMES.flatMap((game) =>
  game.notes
    .filter((note) => note.brilliant)
    .map((note) => ({ game, note, ply: plyOf(note.move).ply })),
)
