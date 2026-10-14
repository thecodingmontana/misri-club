import { TanStackDevtools } from '@tanstack/react-devtools'
import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { ThemeProvider } from 'next-themes'
import { BottomNav } from '#/components/bottom-nav'
import { TopBar } from '#/components/top-bar'
import { ScrollArea } from '#/components/ui/scroll-area'
import { Toaster } from '#/components/ui/sonner'
import { rosterAvatarsQuery, useAutoSync } from '#/lib/queries'
import { getSessionFn } from '#/server/auth.functions'
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import appCss from '../styles.css?url'

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
  loader: async ({ context }) => {
    // Avatars are looked up by username on every screen; warm them once.
    void context.queryClient.prefetchQuery(rosterAvatarsQuery)
    return { auth: await getSessionFn() }
  },
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: NotFound,
})

/**
 * The whole app lives in a phone-width column, centred on wider screens, so it
 * reads as a mobile app. The window itself never scrolls: the header and tab
 * bar stay put and only `#app-main` scrolls.
 */
function RootLayout() {
  useAutoSync()

  return (
    // Pinned to the window (fixed, inset 0), which every browser sizes the
    // same, so the tab bar is always on screen. The scroll area spans the full
    // width so the wheel works anywhere; only its content is phone-width.
    <div className="fixed inset-0 flex flex-col bg-background">
      <TopBar />
      <ScrollArea
        className="min-h-0 flex-1"
        viewportProps={{
          id: 'app-main',
          'data-scroll-restoration-id': 'app-main',
          className: 'overscroll-contain',
        }}
      >
        <main className="mx-auto w-full max-w-[27rem] px-4 pb-6 pt-2">
          <Outlet />
        </main>
      </ScrollArea>
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
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
