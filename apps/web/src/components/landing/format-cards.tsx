import { Link, type LinkProps } from '@tanstack/react-router'
import { ArrowUp } from '#/components/icons'
import { cn } from '#/lib/utils'
import { PHOTOS, UNSPLASH } from './photos'

/** Photographer and Unsplash, linked, as Unsplash asks. */
export function Credit({ photos }: { photos: Array<keyof typeof PHOTOS> }) {
  return (
    <p className="text-[11px] text-muted-foreground">
      {photos.length > 1 ? 'Photos' : 'Photo'}:{' '}
      {photos.map((key, i) => (
        <span key={key}>
          {i > 0 && ', '}
          <a
            href={PHOTOS[key].profile}
            className="underline-offset-2 hover:underline"
          >
            {PHOTOS[key].by}
          </a>
        </span>
      ))}{' '}
      on{' '}
      <a href={UNSPLASH} className="underline-offset-2 hover:underline">
        Unsplash
      </a>
    </p>
  )
}

const CARDS: Array<{
  photo: keyof typeof PHOTOS
  chip: string
  kicker: string
  title: string
  body: string
  link: LinkProps
  label: string
}> = [
  {
    photo: 'league',
    chip: 'Everyone plays everyone',
    kicker: 'Once or home & away',
    title: 'League',
    body: 'Points for every result and a table that settles itself.',
    link: {
      to: '/auth/signin',
      search: { redirect: '/competitions/new?format=league' },
    },
    label: 'Start a league',
  },
  {
    photo: 'tournament',
    chip: 'Knockout',
    kicker: 'Lose once and you’re out',
    title: 'Tournament',
    body: 'A bracket that fills itself in, round by round, to the final.',
    link: {
      to: '/auth/signin',
      search: { redirect: '/competitions/new?format=knockout' },
    },
    label: 'Start a tournament',
  },
  {
    photo: 'training',
    chip: 'Free · no sign-in',
    kicker: 'Between rounds',
    title: 'Training',
    body: 'Puzzles, openings, master games and practice against Stockfish.',
    link: { to: '/train' },
    label: 'Go to training',
  },
]

/** The three ways in, each with a real photo, like a club's noticeboard. */
export function FormatCards() {
  return (
    <section aria-labelledby="formats-heading" className="l-reveal space-y-10">
      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-end">
        <div>
          <p className="kicker text-primary">Competitions</p>
          <h2 id="formats-heading" className="mt-2 text-5xl md:text-7xl">
            <span className="l-condensed block">Pick your format.</span>
            <span className="l-condensed block text-primary">
              Play your game.
            </span>
          </h2>
        </div>
        <p className="text-pretty text-muted-foreground">
          Run a season with your club, a quick knockout with friends, or just
          train. Every format reads results from chess.com, or takes them from
          the players.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-3 md:items-start">
        {CARDS.map((card, i) => (
          <article
            key={card.title}
            className={cn(
              'overflow-hidden rounded-[1.75rem] bg-card shadow-card',
              i === 1 && 'md:mt-12',
            )}
          >
            <div className="relative aspect-[4/5] overflow-hidden">
              <img
                src={`/landing/${card.photo}.webp`}
                alt={PHOTOS[card.photo].alt}
                width={1100}
                height={1375}
                loading="lazy"
                className="size-full object-cover outline-1 -outline-offset-1 outline-black/10 transition-[scale] duration-500 ease-out hover:scale-105"
              />
              <span className="absolute right-3 bottom-3 rounded-md bg-background px-2.5 py-1 text-[11px] font-semibold tracking-wider uppercase">
                {card.chip}
              </span>
            </div>
            <div className="flex items-end justify-between gap-4 p-5">
              <div>
                <p className="kicker text-primary">{card.kicker}</p>
                <h3 className="l-condensed mt-1 text-4xl">{card.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {card.body}
                </p>
              </div>
              <Link
                {...card.link}
                aria-label={card.label}
                data-tip={card.label}
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary text-primary transition-colors duration-150 hover:bg-primary hover:text-primary-foreground"
              >
                <ArrowUp className="size-4 rotate-45" aria-hidden />
              </Link>
            </div>
          </article>
        ))}
      </div>
      <Credit photos={['league', 'tournament', 'training']} />
    </section>
  )
}
