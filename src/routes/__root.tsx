import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ThemeProvider } from 'next-themes'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import { BottomNav } from '#/components/bottom-nav'
import { TopBar } from '#/components/top-bar'
import { Toaster } from '#/components/ui/sonner'
import { getSessionFn } from '#/server/auth.functions'
import { useAutoSync } from '#/lib/queries'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { title: 'Misri Chess Club League' },
      {
        name: 'description',
        content:
          'Season standings, fixtures and all-time records for the Misri chess.com club.',
      },
      { name: 'theme-color', content: '#fbf8e6' },
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

/**
 * The whole app lives in a phone-width column, centred on wider screens, so it
 * reads as a mobile app rather than stretching across a desktop monitor.
 */
function RootLayout() {
  useAutoSync()

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[27rem] flex-col bg-background shadow-card sm:my-6 sm:min-h-[calc(100vh-3rem)] sm:rounded-[2rem]">
      <TopBar />
      <main className="flex-1 px-4 pb-28 pt-2">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}

function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="kicker">404</p>
      <h1 className="display mt-3 text-2xl font-semibold">Nothing here</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        That page isn&apos;t part of the league.
      </p>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-center" />
        </ThemeProvider>
        <TanStackDevtools
          config={{ position: 'bottom-left' }}
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
