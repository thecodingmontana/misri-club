import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

// TanStack's own CSRF guard for server functions: only this site may call
// them. /api/auth carries its own guard (src/server/csrf.ts), since Google's
// sign-in redirect comes back as a cross-site GET.
const csrf = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrf],
}))
