import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import { SiteHeader } from '#/components/site-header'
import { Toaster } from '#/components/ui/sonner'
import { getSessionFn } from '#/server/auth.functions'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Misri Chess Club League' },
      {
        name: 'description',
        content:
          'Season standings, fixtures and all-time records for the Misri chess.com club.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'icon',
        href: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">♞</text></svg>',
      },
    ],
  }),
  loader: async () => ({ auth: await getSessionFn() }),
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: NotFound,
})

function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <Outlet />
      </main>
      <footer className="border-t border-border/60 py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 text-xs text-muted-foreground sm:px-6">
          <span>
            Results sync automatically from the chess.com public API every 20
            minutes.
          </span>
          <span className="numeric">3 · 1 · 0 scoring</span>
        </div>
      </footer>
    </div>
  )
}

function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="kicker">404</p>
      <h1 className="display mt-3 text-3xl font-semibold">Nothing here</h1>
      <p className="mt-2 text-muted-foreground">
        That page isn&apos;t part of the league.
      </p>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster position="bottom-center" />
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[
            { name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
