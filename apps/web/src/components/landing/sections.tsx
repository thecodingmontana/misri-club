import { Link, type LinkProps } from '@tanstack/react-router'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '#/components/ui/accordion'
import { Button } from '#/components/ui/button'
import { usePauseSwitch } from '#/lib/landing-motion'
import { Credit } from './format-cards'
import type { PHOTOS } from './photos'

const FAQ = [
  {
    q: 'Do I need a chess.com account?',
    a: "Yes. You link yours and prove it's yours by putting a code in your profile. That's how Misri reads your results.",
  },
  { q: 'Does it cost anything?', a: 'No. Misri is free.' },
  {
    q: 'What if my opponent never plays?',
    a: 'The organiser picks the rule: decide each one (award a walkover, call it off or give more time), both lose it, or no result.',
  },
  {
    q: 'Can we play over the board?',
    a: 'Yes. The organiser enters the result for games chess.com can’t see.',
  },
  {
    q: 'Who can see a private competition?',
    a: 'Its players, fixtures and table are only shown to the people in it. Others see its name and that it’s invite only.',
  },
]

export function Faq() {
  return (
    <section
      aria-labelledby="faq-heading"
      className="l-reveal grid gap-6 md:grid-cols-[1fr_1.4fr]"
    >
      <h2 id="faq-heading" className="text-5xl md:text-6xl">
        <span className="l-condensed block">Questions</span>
        <span className="l-condensed block text-primary">people ask.</span>
      </h2>
      <Accordion
        type="single"
        collapsible
        className="rounded-[1.75rem] bg-card px-5 shadow-card"
      >
        {FAQ.map(({ q, a }) => (
          <AccordionItem key={q} value={q}>
            <AccordionTrigger>{q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              {a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}

export function FinalCta({ signedIn }: { signedIn: boolean }) {
  const fan: Array<{ photo: keyof typeof PHOTOS; className: string }> = [
    { photo: 'park-elders', className: '-rotate-6 left-0 top-8' },
    { photo: 'focus', className: 'rotate-3 left-[30%] top-0 z-10' },
    { photo: 'park-giant', className: 'rotate-[8deg] right-0 top-12' },
  ]
  return (
    <section className="l-reveal space-y-2">
      <div className="l-board grid items-center gap-8 overflow-hidden rounded-[2.5rem] px-6 py-12 text-background md:grid-cols-[1.1fr_1fr] md:px-12">
        <div>
          <h2 className="text-5xl md:text-6xl">
            <span className="l-condensed block">Your club's next league</span>
            <span className="l-condensed block text-[color-mix(in_oklab,var(--primary)_55%,var(--background))]">
              starts with a code.
            </span>
          </h2>
          <p className="mt-4 max-w-md opacity-80">
            Create it in a minute, share the code, and play on chess.com.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-7 rounded-xl bg-background px-6 text-foreground hover:bg-background/90"
          >
            {signedIn ? (
              <Link to="/">Open Misri</Link>
            ) : (
              <Link
                to="/auth/signin"
                search={{ redirect: '/competitions/new?format=league' }}
              >
                Start a league
              </Link>
            )}
          </Button>
        </div>
        <div className="relative h-64 md:h-80" aria-hidden>
          {fan.map(({ photo, className }) => (
            <img
              key={photo}
              src={`/landing/${photo}.webp`}
              alt=""
              width={800}
              height={600}
              loading="lazy"
              className={`absolute aspect-[4/5] w-[44%] rounded-2xl border-4 border-background object-cover shadow-[0_24px_50px_-18px_rgb(0_0_0/0.6)] ${className}`}
            />
          ))}
        </div>
      </div>
      <Credit photos={['park-elders', 'focus', 'park-giant']} />
    </section>
  )
}

const FOOTER_LINKS: Array<{
  heading: string
  links: Array<{ label: string; href?: string; link?: LinkProps }>
}> = [
  {
    heading: 'Play',
    links: [
      {
        label: 'Start a league',
        link: {
          to: '/auth/signin',
          search: { redirect: '/competitions/new?format=league' },
        },
      },
      {
        label: 'Start a tournament',
        link: {
          to: '/auth/signin',
          search: { redirect: '/competitions/new?format=knockout' },
        },
      },
      { label: 'Join with a code', link: { to: '/join' } },
    ],
  },
  {
    heading: 'Learn',
    links: [
      { label: 'How it works', href: '#how' },
      { label: 'Formats', href: '#formats' },
      { label: 'Questions', href: '#faq' },
      { label: 'Training', link: { to: '/train' } },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Terms', link: { to: '/terms' } },
      { label: 'Privacy', link: { to: '/privacy' } },
    ],
  },
]

// The Immortal Game, Anderssen v Kieseritzky, London 1851: a real game, public record.
const IMMORTAL =
  '1.e4 e5 2.f4 exf4 3.Bc4 Qh4+ 4.Kf1 b5 5.Bxb5 Nf6 6.Nf3 Qh6 7.d3 Nh5 8.Nh4 Qg5 9.Nf5 c6 10.g4 Nf6 11.Rg1 cxb5 12.h4 Qg6 13.h5 Qg5 14.Qf3 Ng8 15.Bxf4 Qf6 16.Nc3 Bc5 17.Nd5 Qxb2 18.Bd6 Bxg1 19.e5 Qxa1+ 20.Ke2 Na6 21.Nxg7+ Kd8 22.Qf6+ Nxf6 23.Be7# 1-0'

/** The board closing the page: a famous game drifting under the name. */
function ImmortalBand() {
  const rows = [0.3, 0.16, 0.24, 0.12, 0.22, 0.14]
  return (
    <div className="l-board relative overflow-hidden pt-10 pb-6">
      <div aria-hidden className="space-y-3">
        {rows.map((opacity, i) => (
          <div key={opacity} className="overflow-hidden">
            <p
              className="l-marquee w-max font-mono text-base tracking-widest whitespace-nowrap text-background uppercase md:text-lg"
              style={{
                opacity,
                animationDirection: i % 2 ? 'reverse' : 'normal',
                animationDuration: `${60 + i * 15}s`,
              }}
            >
              {IMMORTAL}&nbsp;&nbsp;·&nbsp;&nbsp;{IMMORTAL}
              &nbsp;&nbsp;·&nbsp;&nbsp;
            </p>
          </div>
        ))}
      </div>
      <p
        aria-hidden
        className="l-condensed pointer-events-none absolute inset-x-0 top-[44%] -translate-y-1/2 text-center text-[34vw] text-transparent [-webkit-text-stroke:2px_var(--background)] md:text-[26vw]"
      >
        Misri
      </p>
      <p className="relative mt-8 px-4 text-center text-[11px] text-background/70">
        The moves are the Immortal Game: Anderssen v Kieseritzky, London 1851.
      </p>
    </div>
  )
}

const linkClass =
  'text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground'

/** Brand, the ways around, and a misty board fading in underneath. */
export function Footer({ signedIn }: { signedIn: boolean }) {
  const [paused, setPaused] = usePauseSwitch()
  return (
    <footer className="mt-10 border-t border-border">
      <div className="mx-auto grid max-w-5xl gap-10 px-4 pt-14 md:grid-cols-[1.3fr_2fr]">
        <div className="space-y-4">
          <p className="l-condensed text-4xl">Misri</p>
          <p className="max-w-xs text-sm text-pretty text-muted-foreground">
            Chess leagues and knockouts for your club, with results read from
            chess.com.
          </p>
          <p className="text-xs text-muted-foreground">
            Misri isn't made by or connected to chess.com.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {FOOTER_LINKS.map(({ heading, links }) => (
            <nav key={heading} aria-label={heading} className="space-y-3">
              <p className="kicker">{heading}</p>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    {link.href ? (
                      <a href={link.href} className={linkClass}>
                        {link.label}
                      </a>
                    ) : (
                      <Link {...link.link} className={linkClass}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 pt-12 pb-8 text-sm">
        <span className="text-muted-foreground">© 2026 Misri</span>
        <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={!paused}
            onChange={(event) => setPaused(!event.target.checked)}
          />
          Animations
        </label>
        <span className="ml-auto flex items-center gap-5">
          {signedIn ? (
            <Link to="/" className="font-medium text-primary">
              Open Misri
            </Link>
          ) : (
            <>
              <Link to="/auth/signin" className={linkClass}>
                Sign in
              </Link>
              <Link
                to="/auth/signin"
                search={{ redirect: '/competitions/new?format=league' }}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Start a league
              </Link>
            </>
          )}
        </span>
      </div>
      <ImmortalBand />
    </footer>
  )
}
