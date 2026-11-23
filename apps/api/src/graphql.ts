import { type ActionName, actions, runAction } from '@misri/core/actions'
import {
  getCompetition,
  listMyCompetitions,
  listOpenCompetitions,
} from '@misri/core/competition-view'
import { UserError } from '@misri/core/errors'
import { getPlayer } from '@misri/core/player'
import { db } from '@misri/db/client'
import { chessAccounts, user } from '@misri/db/schema'
import { securityPlugins } from '@misri/graphql'
import { eq } from 'drizzle-orm'
import { GraphQLError } from 'graphql'
import { createSchema, createYoga } from 'graphql-yoga'
import { type Viewer, viewerFrom } from './viewer.ts'

/**
 * The Misri API. Reads move here from the web app one at a time; the web
 * app's own /api/graphql goes once everything it serves lives here.
 */

export type Context = { viewer: Viewer | null }

const typeDefs = /* GraphQL */ `
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
    legs: Int!
    allowLateEntry: Boolean!
  }

  "Any JSON value: the competition and player pages, as the app gets them."
  scalar JSON

  type Query {
    "The signed-in player, or null."
    me: Me
    "Competitions you own or joined (signed in)."
    myCompetitions: [CompetitionSummary!]!
    "Public competitions taking players, minus ones you're in."
    openCompetitions: [CompetitionSummary!]!
    "A competition page, with what you're allowed to see; null if unknown."
    competition(slug: String!): JSON
    "A player page by chess.com username or user id (signed in); null if unknown."
    player(username: String!): JSON
  }
`

const signedIn = (context: Context) => {
  if (!context.viewer) throw new GraphQLError('Sign in first.')
  return context.viewer
}

// one mutation per shared action; each validates its own input
const mutations = Object.keys(actions) as ActionName[]

export const schema = createSchema<Context>({
  typeDefs: [
    typeDefs,
    /* GraphQL */ `
      "Writes: each takes its input as JSON and needs a signed-in player."
      type Mutation {
        ${mutations.map((name) => `${name}(input: JSON): JSON`).join('\n')}
      }
    `,
  ],
  resolvers: {
    Mutation: Object.fromEntries(
      mutations.map((name) => [
        name,
        async (_: unknown, args: { input?: unknown }, context: Context) => {
          const viewer = signedIn(context)
          try {
            return await runAction(name, viewer, args.input)
          } catch (error) {
            // a message for the player passes; anything else stays masked
            if (error instanceof UserError)
              throw new GraphQLError(error.message)
            throw error
          }
        },
      ]),
    ),
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
      // results as stored: the web app and the nightly sync bring them in
      competition: (_, { slug }: { slug: string }, context) =>
        getCompetition(slug.slice(0, 80), context.viewer),
      player: (_, { username }: { username: string }, context) =>
        getPlayer(username.slice(0, 40), signedIn(context)),
    },
  },
})

const production = process.env.VERCEL_ENV === 'production'

export const yoga = createYoga<{ request: Request }, Context>({
  schema,
  graphqlEndpoint: '/graphql',
  // bearer tokens, no cookies: any origin may call it; Hono's cors() answers
  cors: false,
  // the explorer and introspection stay off in production
  graphiql: !production,
  landingPage: false,
  plugins: securityPlugins({ production }),
  context: async ({ request }) => ({
    viewer: await viewerFrom(request.headers),
  }),
})
