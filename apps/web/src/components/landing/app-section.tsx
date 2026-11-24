import { AppButtons } from '#/components/get-the-app'
import { Android, Bell, Cpu, Trophy } from '#/components/icons'

const POINTS = [
  {
    icon: Bell,
    title: 'Reminders before every deadline',
    body: 'A nudge the day before a match is due, and word the moment a result needs your confirmation.',
  },
  {
    icon: Trophy,
    title: 'Your table, even offline',
    body: 'Fixtures, standings and your inbox stay on the phone, and what you do offline is sent once you are back.',
  },
  {
    icon: Cpu,
    title: 'Training on the bus',
    body: 'Puzzles, openings, master games and Stockfish run on the phone itself, no connection needed.',
  },
]

/** The app: why it is worth having, and both ways to get it right here. */
export function AppSection() {
  return (
    <section
      aria-labelledby="app-heading"
      className="l-reveal grid gap-10 md:grid-cols-[1.2fr_1fr] md:items-center"
    >
      <div className="space-y-6">
        <h2 id="app-heading" className="text-5xl md:text-6xl">
          <span className="l-condensed block">Misri in</span>
          <span className="l-condensed block text-primary">your pocket.</span>
        </h2>
        <p className="max-w-prose text-lg text-pretty text-muted-foreground">
          Get the Android app, or install Misri straight from your browser on
          any phone or computer. Same account, same leagues, built for the
          moments between games.
        </p>
        <ul className="space-y-4">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-muted-foreground">
                  {body}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <AppButtons />
      </div>

      {/* a phone, drawn: the reminder as it lands */}
      <div className="mx-auto w-64" aria-hidden>
        <div className="rounded-[2.5rem] border-8 border-foreground bg-background p-3 shadow-card">
          <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-foreground/80" />
          <div className="space-y-2">
            <div className="rounded-2xl bg-card p-3 shadow-card">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Android className="size-3.5 text-primary" />
                Misri · now
              </p>
              <p className="mt-1 text-sm font-semibold">
                Round 3 is due tomorrow
              </p>
              <p className="text-xs text-muted-foreground">
                You vs Amina, Friday League
              </p>
            </div>
            {[
              ['1', 'You', '9'],
              ['2', 'Amina', '7'],
              ['3', 'Brian', '4'],
            ].map(([rank, name, points]) => (
              <div
                key={name}
                className="flex items-center gap-3 rounded-xl bg-card px-3 py-2 text-sm"
              >
                <span className="numeric w-3 text-muted-foreground">
                  {rank}
                </span>
                <span className="flex-1 font-medium">{name}</span>
                <span className="numeric font-bold">{points}</span>
              </div>
            ))}
            <p className="pt-2 pb-1 text-center text-[11px] text-muted-foreground">
              Example
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
