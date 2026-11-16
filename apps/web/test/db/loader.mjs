// Lets node run the server modules directly: `#/` and extensionless imports
// resolve to src/*.ts, and Better Auth (which pulls JSX emails) is stood in for.
import { fileURLToPath, pathToFileURL } from 'node:url'

const SRC = fileURLToPath(new URL('../../src/', import.meta.url))

export async function resolve(spec, ctx, next) {
  if (spec.startsWith('#/')) spec = pathToFileURL(SRC + spec.slice(2)).href
  try {
    return await next(spec, ctx)
  } catch (error) {
    if (!spec.startsWith('.') && !spec.startsWith('file:')) throw error
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await next(spec + ext, ctx)
      } catch {}
    }
    throw error
  }
}

export async function load(url, ctx, next) {
  if (url.endsWith('/src/server/auth.server.ts')) {
    return {
      format: 'module',
      shortCircuit: true,
      source:
        'export const auth = {}; export const googleEnabled = false; export const isAdminEmail = () => false',
    }
  }
  return next(url, ctx)
}
