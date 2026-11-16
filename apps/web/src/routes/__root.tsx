import { TanStackDevtools } from '@tanstack/react-devtools'
import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { ThemeProvider } from 'next-themes'
import { useEffect } from 'react'
import { AppSidebar } from '#/components/app-sidebar'
import { BottomNav } from '#/components/bottom-nav'
import { Toaster } from '#/components/toast/toaster'
import { TopBar } from '#/components/top-bar'
import { ScrollArea } from '#/components/ui/scroll-area'
import { DataTips, TooltipProvider } from '#/components/ui/tooltip'
import { startPwa } from '#/lib/pwa'
import { CLUB_URL, HOME_DESCRIPTION, SITE_NAME, SITE_URL, seo } from '#/lib/seo'
import { useInterfaceSounds } from '#/lib/sound'
import { useAutoSync } from '#/lib/use-auto-sync'
import { getSessionFn } from '#/server/auth.functions'
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import appCss from '../styles.css?url'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => {
    // Defaults every page inherits; each route sets its own title and path.
    const page = seo({
      title: SITE_NAME,
      description: HOME_DESCRIPTION,
      jsonLd: {
        '@graph': [
          { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL || undefined },
          {
            '@type': 'SportsOrganization',
            name: SITE_NAME,
            sport: 'Chess',
            url: SITE_URL || undefined,
            sameAs: [CLUB_URL],
          },
        ],
      },
    })

    return {
      meta: [
        { charSet: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
        ...page.meta,
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
    }
  },
  loader: async () => {
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
  useInterfaceSounds()
  const { sidebarOpen, user } = Route.useLoaderData().auth
  // fresh chess.com results on every page, for players in a competition
  useAutoSync(Boolean(user?.chessUsername))
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // Sign-in screens and onboarding stand alone, like Zadaci's: no app chrome.
  if (
    pathname.startsWith('/auth/') ||
    ['/onboarding', '/welcome', '/terms', '/privacy'].includes(pathname)
  ) {
    // the window itself never scrolls (styles.css), so these pages scroll here
    return (
      <div className="h-dvh overflow-y-auto overscroll-contain">
        <Outlet />
      </div>
    )
  }

  return (
    // Pinned to the window (fixed, inset 0), which every browser sizes the
    // same, so the tab bar is always on screen. The scroll area spans the full
    // width so the wheel works anywhere; only its content is column-width.
    // From `md` up the sidebar replaces the tab bar, as in Zadaci.
    <div className="fixed inset-0 flex bg-background">
      {/* Signed-in players get the sidebar; visitors keep the tab bar. */}
      {user && <AppSidebar open={sidebarOpen} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <ScrollArea
          className="min-h-0 flex-1"
          viewportProps={{
            id: 'app-main',
            'data-scroll-restoration-id': 'app-main',
            className: 'overscroll-contain',
          }}
        >
          <main className="mx-auto w-full max-w-[27rem] px-4 pb-6 pt-2 md:max-w-2xl md:pt-4">
            <Outlet />
          </main>
        </ScrollArea>
        <BottomNav />
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="kicker">404</p>
      <h1 className="display mt-3 text-2xl font-semibold">Nothing here</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        That page doesn&apos;t exist.
      </p>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  useEffect(startPwa, [])
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Here, not in head(): the router keeps one meta per name. */}
        <meta
          name="theme-color"
          content="#fbf8e6"
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content="#0e100e"
          media="(prefers-color-scheme: dark)"
        />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={200}>
            {children}
            <DataTips />
          </TooltipProvider>
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
