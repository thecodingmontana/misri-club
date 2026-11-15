import { createFileRoute, Link } from '@tanstack/react-router'
import { FormatCards } from '#/components/landing/format-cards'
import { GroupChat } from '#/components/landing/group-chat'
import { Hero } from '#/components/landing/hero'
import { Faq, FinalCta, Footer } from '#/components/landing/sections'
import { Steps } from '#/components/landing/steps'
import { ThemeToggle } from '#/components/theme-toggle'
import { Button } from '#/components/ui/button'
import { HOME_DESCRIPTION, seo } from '#/lib/seo'
import { useAdmin } from '#/lib/use-admin'

/** What visitors see first: what Misri does, shown working, and a way in. */
export const Route = createFileRoute('/welcome')({
  head: () =>
    seo({
      title: 'Chess leagues and tournaments on chess.com',
      description: HOME_DESCRIPTION,
      path: '/welcome',
    }),
  component: Welcome,
})

function Nav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3"
      >
        <span className="display mr-auto text-2xl">Misri</span>
        <div className="hidden items-center gap-1 text-sm sm:flex">
          {[
            ['#how', 'How it works'],
            ['#formats', 'Formats'],
            ['#faq', 'Questions'],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </div>
        <ThemeToggle />
        {signedIn ? (
          <Button asChild size="sm" className="rounded-full">
            <Link to="/">Open Misri</Link>
          </Button>
        ) : (
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link to="/auth/signin">Sign in</Link>
          </Button>
        )}
      </nav>
    </header>
  )
}

function Welcome() {
  const signedIn = Boolean(useAdmin().user)
  return (
    <div className="min-h-dvh bg-background">
      <Nav signedIn={signedIn} />
      <Hero signedIn={signedIn} />
      <main className="mx-auto max-w-5xl space-y-28 px-4 pt-16 pb-16">
        <div id="formats" className="scroll-mt-20">
          <FormatCards />
        </div>
        <GroupChat />
        <div id="how" className="scroll-mt-20">
          <Steps />
        </div>
        <div id="faq" className="scroll-mt-20">
          <Faq />
        </div>
        <FinalCta signedIn={signedIn} />
      </main>
      <Footer signedIn={signedIn} />
    </div>
  )
}
