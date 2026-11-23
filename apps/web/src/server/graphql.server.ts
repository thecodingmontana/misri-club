import { securityPlugins } from '@misri/graphql'
import { eq } from 'drizzle-orm'
import { createSchema, createYoga } from 'graphql-yoga'
import { db } from '#/db/client.server'
import { chessAccounts, user } from '#/db/schema'
import type { Viewer } from '#/lib/access'
import { auth, isAdminEmail } from './auth.server'
import {
  getCompetition,
  listMyCompetitions,
  listOpenCompetitions,
} from './competition-view.server'
import { getPlayer } from './player.server'

/**
 * A read-only GraphQL API over the same reads the app's pages use, with the
 * same access rules: for other clients (a mobile app, scripts). Nothing here
 * writes; changes go through the app's server functions.
 */

export type GraphQLContext = { viewer: Viewer | null }

const typeDefs = /* GraphQL */ `
  "Any JSON value: the competition and player pages, as the app gets them."
  scalar JSON

  type Me {
    id: ID!
    name: String!
    chessUsername: String
  }

  type CompetitionSummary {
    slug: String!
    name: String!
    "league, knockout, challenge or groups"
    format: String!
    "open, running or finished"
    status: String!
    members: Int!
    timeControl: String!
  }

  type Query {
    "The signed-in player, or null."
    me: Me
    "Competitions you own or joined (signed in)."
    myCompetitions: [CompetitionSummary!]!
    "Public competitions taking players."
    openCompetitions: [CompetitionSummary!]!
    "A competition page, with what you're allowed to see; null if unknown."
    competition(slug: String!): JSON
    "A player page by chess.com username (signed in); null if unknown."
    player(username: String!): JSON
  }
`

const signedIn = (context: GraphQLContext) => {
  if (!context.viewer) throw new Error('Sign in first.')
  return context.viewer
}

export const schema = createSchema<GraphQLContext>({
  typeDefs,
  resolvers: {
    Query: {
      me: async (_, __, context) => {
        if (!context.viewer) return null
        const [row] = await db
          .select({
            id: user.id,
            name: user.name,
            chessUsername: chessAccounts.username,
          })
          .from(user)
          .leftJoin(chessAccounts, eq(chessAccounts.userId, user.id))
          .where(eq(user.id, context.viewer.id))
          .limit(1)
        return row ?? null
      },
      myCompetitions: (_, __, context) =>
        listMyCompetitions(signedIn(context).id),
      openCompetitions: (_, __, context) =>
        listOpenCompetitions(context.viewer?.id ?? null),
      competition: (_, { slug }: { slug: string }, context) =>
        getCompetition(slug.slice(0, 80), context.viewer),
      player: (_, { username }: { username: string }, context) =>
        getPlayer(username.slice(0, 40), signedIn(context)),
    },
  },
})

export const yoga = createYoga<{ request: Request }, GraphQLContext>({
  schema,
  graphqlEndpoint: '/api/graphql',
  // the session cookie makes answers private: no cross-origin reads
  cors: false,
  graphiql: process.env.NODE_ENV !== 'production',
  // the same limits as the API (CSRF, Armor, no introspection in production)
  plugins: securityPlugins({
    production: process.env.NODE_ENV === 'production',
  }),
  context: async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers })
    return {
      viewer: session
        ? { id: session.user.id, isAdmin: isAdminEmail(session.user) }
        : null,
    }
  },
})
