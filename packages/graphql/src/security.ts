import { EnvelopArmorPlugin } from '@escape.tech/graphql-armor'
import { useCSRFPrevention } from '@graphql-yoga/plugin-csrf-prevention'
import { useDisableIntrospection } from '@graphql-yoga/plugin-disable-introspection'
import {
  type FragmentSpreadNode,
  GraphQLError,
  type InlineFragmentNode,
  type SelectionSetNode,
  type ValidationRule,
} from 'graphql'
import type { Plugin } from 'graphql-yoga'

/**
 * The protections every Misri GraphQL endpoint runs (the API and the web
 * app's), so a query is judged the same way wherever it's sent.
 */

/** Top-level fields in one request, aliases included: one read is one field. */
export const MAX_ROOT_FIELDS = 5

/**
 * Caps the top-level fields of each operation, counting aliases and fields
 * reached through fragments, so one request can't fan out into hundreds of
 * database reads.
 */
export const maxRootFields: ValidationRule = (context) => {
  // each fragment counted once (memoised; a cycle counts nothing), and the
  // sum capped past the limit, so doubling fragments can't blow up the work
  const memo = new Map<string, number>()
  const count = (set: SelectionSetNode): number =>
    Math.min(
      MAX_ROOT_FIELDS + 1,
      set.selections.reduce((total, selection) => {
        if (selection.kind === 'Field') {
          return total + (selection.name.value.startsWith('__') ? 0 : 1)
        }
        if (selection.kind === 'InlineFragment') {
          return total + count((selection as InlineFragmentNode).selectionSet)
        }
        const name = (selection as FragmentSpreadNode).name.value
        const known = memo.get(name)
        if (known !== undefined) return total + known
        const fragment = context.getFragment(name)
        if (!fragment) return total
        memo.set(name, 0)
        const own = count(fragment.selectionSet)
        memo.set(name, own)
        return total + own
      }, 0),
    )
  return {
    OperationDefinition(node) {
      if (count(node.selectionSet) > MAX_ROOT_FIELDS) {
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

/**
 * - CSRF: a "simple" request (a GET, or a form-encoded or plain-text POST)
 *   that a browser would send cross-site without asking must carry a custom
 *   header; JSON POSTs are preflighted, so they pass.
 * - GraphQL Armor: limits on depth, aliases, directives, tokens and cost, and
 *   no "did you mean" field suggestions that map the schema for a stranger.
 * - Introspection only outside production.
 * - The top-level field cap above.
 */
export function securityPlugins({
  production,
}: {
  production: boolean
}): Plugin[] {
  return [
    useCSRFPrevention({
      requestHeaders: ['x-graphql-yoga-csrf', 'apollo-require-preflight'],
    }) as Plugin,
    EnvelopArmorPlugin({
      maxDepth: { n: 6 },
      maxAliases: { n: 5 },
      maxDirectives: { n: 5 },
      maxTokens: { n: 500 },
      costLimit: { maxCost: 1000 },
      blockFieldSuggestion: { enabled: true },
    }) as Plugin,
    ...(production ? [useDisableIntrospection() as Plugin] : []),
    { onValidate: ({ addValidationRule }) => addValidationRule(maxRootFields) },
  ]
}
