import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { Skeleton } from './components/ui/skeleton'
import { getContext } from './integrations/tanstack-query/root-provider'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    // The page never scrolls; the app's content area does, so reset that.
    scrollToTopSelectors: ['#app-main'],
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // Shown only when a page takes over a second to load (the router's default
    // pendingMs), so fast navigations never flicker.
    defaultPendingComponent: PageSkeleton,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

function PageSkeleton() {
  return (
    <div className="space-y-4 pt-2" role="status" aria-label="Loading">
      <Skeleton className="mx-auto h-8 w-48 rounded-lg" />
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-24 rounded-2xl" />
    </div>
  )
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
