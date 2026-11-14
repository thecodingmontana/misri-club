import {
  createRouter as createTanStackRouter,
  type ErrorComponentProps,
  useRouter,
} from '@tanstack/react-router'
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
    defaultErrorComponent: PageError,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

/** A page that failed to load: say so plainly and offer another try. */
function PageError({ reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <div className="py-20 text-center" role="alert">
      <p className="kicker">Something went wrong</p>
      <h1 className="display mt-2 text-2xl">This page didn&apos;t load</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        It may be a slow connection. Try again in a moment.
      </p>
      <button
        type="button"
        className="mt-5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
        onClick={() => {
          reset()
          void router.invalidate()
        }}
      >
        Try again
      </button>
    </div>
  )
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
