import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight, Lightbulb } from '#/components/icons'
import { TrainHeader } from '#/components/train-header'
import { Card } from '#/components/ui/card'
import { MASTER_GAMES, plyOf } from '#/lib/masters'
import type { Theme } from '#/lib/puzzle'
import { THEMES } from '#/lib/puzzle'
import { seo } from '#/lib/seo'

export const Route = createFileRoute('/train/brilliant')({
  head: () =>
    seo({
      title: 'How to find brilliant moves',
      description:
        'What makes a chess move brilliant, a checklist for finding sacrifices and quiet killer moves, the greatest brilliancies from master games, and puzzles to practise.',
      path: '/train/brilliant',
    }),
  component: BrilliantScreen,
})

const CHECKLIST = [
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

const PRACTICE: Array<Theme> = [
  'sacrifice',
  'deflection',
  'attraction',
  'quietMove',
  'doubleCheck',
  'mateIn2',
]

/** Every brilliant move in the master library, linked to its moment. */
const BRILLIANCIES = MASTER_GAMES.flatMap((game) =>
  game.notes
    .filter((note) => note.brilliant)
    .map((note) => ({ game, note, ply: plyOf(note.move).ply })),
)

function BrilliantScreen() {
  return (
    <div className="space-y-5 pt-2">
      <TrainHeader title="How to find brilliant moves" />

      <Card className="gap-2 px-4 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Lightbulb className="size-5 text-primary" />
          What makes a move brilliant
        </p>
        <p className="text-sm leading-relaxed">
          A brilliant move, marked <strong>!!</strong>, is the best move in the
          position and a hard one to find. Usually it gives up material, a
          piece, a rook or the queen, for an attack or a mate that wins more
          back. Sometimes it is a quiet move nobody expects. Analysis tools only
          call a move brilliant when it really is best: a sacrifice that does
          not work is just a blunder.
        </p>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">How to find them</h2>
        <ol className="space-y-2">
          {CHECKLIST.map((step, index) => (
            <li
              key={step.title}
              className="flex gap-3 rounded-2xl bg-card px-4 py-3 shadow-card"
            >
              <span className="numeric grid size-7 shrink-0 place-items-center rounded-full bg-primary/12 text-sm font-semibold text-foreground">
                {index + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold">
                  {step.title}
                </span>
                <span className="block text-sm leading-relaxed text-muted-foreground">
                  {step.text}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Brilliancies from the masters</h2>
        <ul className="space-y-2">
          {BRILLIANCIES.map(({ game, note, ply }) => (
            <li key={`${game.slug}-${ply}`}>
              <Link
                to="/train/masters/$slug"
                params={{ slug: game.slug }}
                search={{ ply }}
                className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-card transition-colors duration-150 hover:bg-secondary"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {note.move}!! · {game.title}, {game.year}
                  </span>
                  <span className="block text-xs leading-relaxed text-muted-foreground">
                    {note.text}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Practise the ideas</h2>
        <div className="grid grid-cols-2 gap-2">
          {PRACTICE.map((theme) => (
            <Link
              key={theme}
              to="/train/puzzles"
              search={{ theme }}
              className="rounded-xl bg-secondary px-3 py-2.5 text-center text-sm font-semibold transition-colors duration-150 hover:bg-primary hover:text-primary-foreground"
            >
              {THEMES[theme]}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
