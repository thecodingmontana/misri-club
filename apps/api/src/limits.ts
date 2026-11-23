import { takeAllowance } from '@misri/core/rate-limit'
import {
  type FieldNode,
  type FragmentSpreadNode,
  GraphQLError,
  type InlineFragmentNode,
  type SelectionSetNode,
  type ValidationRule,
} from 'graphql'
import type { MiddlewareHandler } from 'hono'

/** Requests per client per minute; a page in the web app makes one or two. */
export const REQUESTS_PER_MINUTE = 120
/** Top-level fields in one request, aliases included: one read is one field. */
export const MAX_ROOT_FIELDS = 5
/** Bytes in a request body; real queries here are a few hundred. */
export const MAX_BODY_BYTES = 16 * 1024

/** Vercel sets these itself (a client can't forge them); locally they're absent. */
export const clientIp = (headers: Headers) =>
  headers.get('x-real-ip') ??
  headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
  'unknown'

/** 429 once a client goes over its minute; counted in the database, so every instance agrees. */
export const rateLimit: MiddlewareHandler = async (c, next) => {
  const key = `api:${clientIp(c.req.raw.headers)}`
  const allowed = await takeAllowance(
    key,
    1,
    REQUESTS_PER_MINUTE,
    60_000,
  ).catch((error: Error) => {
    // the limiter guards the database; if it's down, the query fails anyway
    console.error('[rate-limit] check failed', error.message)
    return true
  })
  if (!allowed) {
    return c.json({ error: 'Too many requests. Try again in a minute.' }, 429, {
      'Retry-After': '60',
    })
  }
  await next()
}

/**
 * Caps the top-level fields of each operation, counting aliases and fields
 * reached through fragments, so one request can't fan out into hundreds of
 * database reads.
 */
export const maxRootFields: ValidationRule = (context) => {
  const count = (set: SelectionSetNode, seen: Set<string>): number =>
    set.selections.reduce((total, selection) => {
      if (selection.kind === 'Field') return total + countField(selection)
      if (selection.kind === 'InlineFragment') {
        return (
          total + count((selection as InlineFragmentNode).selectionSet, seen)
        )
      }
      const name = (selection as FragmentSpreadNode).name.value
      const fragment = context.getFragment(name)
      if (!fragment || seen.has(name)) return total
      return total + count(fragment.selectionSet, new Set([...seen, name]))
    }, 0)
  const countField = (field: FieldNode) =>
    field.name.value.startsWith('__') ? 0 : 1
  return {
    OperationDefinition(node) {
      if (count(node.selectionSet, new Set()) > MAX_ROOT_FIELDS) {
        context.reportError(
          new GraphQLError(
            `At most ${MAX_ROOT_FIELDS} fields per request; split the query.`,
            { nodes: [node] },
          ),
        )
      }
    },
  }
}
