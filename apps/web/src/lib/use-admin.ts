import { getRouteApi } from '@tanstack/react-router'

const rootRoute = getRouteApi('__root__')

/**
 * Admin state resolved once in the root loader and read from anywhere, so admin
 * controls render correctly on the server and never flash in after hydration.
 *
 * This governs presentation only. Authorization is enforced by `lib/access.ts`
 * on the server functions themselves.
 */
export function useAdmin() {
  return rootRoute.useLoaderData().auth
}
