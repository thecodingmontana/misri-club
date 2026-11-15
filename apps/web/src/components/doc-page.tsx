import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ThemeToggle } from '#/components/theme-toggle'

/** A plain reading page (terms, privacy): the wordmark, the text, the way back. */
export function DocPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
        <Link to="/welcome" className="display rounded-md text-2xl">
          Misri
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16">
        <h1 className="display text-3xl">{title}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Last updated {updated}
        </p>
        <div className="prose prose-sm mt-6 max-w-none text-foreground prose-headings:font-semibold prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground dark:prose-invert">
          {children}
        </div>
        <p className="mt-10 text-sm">
          <Link
            to="/welcome"
            className="text-primary underline-offset-4 hover:underline"
          >
            Back to Misri
          </Link>
        </p>
      </main>
    </div>
  )
}
