import { createStart } from '@tanstack/react-start'
import { sameOriginWrites } from '#/server/csrf'

// CSRF guard on every request that reaches server functions and pages.
export const startInstance = createStart(() => ({
  requestMiddleware: [sameOriginWrites],
}))
