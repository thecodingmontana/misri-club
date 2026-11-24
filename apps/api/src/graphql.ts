import {
  chessAccount,
  competitionNameCheck,
  competitionNameIdeas,
  inbox,
  MAX_ANALYSES,
  matchGame,
  myGames,
  savedAnalyses,
  unreadCount,
} from '@misri/core/account'
import { type ActionName, actions, runAction } from '@misri/core/actions'
import {
  getCompetition,
  getInvite,
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
    "finished onboarding: linked chess.com or chose to skip it"
    onboarded: Boolean!
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
    "Your chess.com link: verified, a pending code, or none (signed in)."
    chessAccount: JSON
    "Your latest notifications, newest first (signed in)."
    inbox: JSON
    "How many notifications are unread (signed in)."
    unreadCount: Int!
    "What an invite code points at, and where you stand; null if unknown."
    invite(code: String!): JSON
    "Is this competition name free? If not, free ones close to it (signed in)."
    competitionNameCheck(name: String!): JSON
    "Three free competition names (signed in)."
    competitionNameIdeas: JSON
    "Your latest chess.com games (signed in, chess.com linked)."
    myGames: JSON
    "One competition game you played, by its chess.com link (signed in)."
    matchGame(url: String!): JSON
    "Your saved engine analysis for these games, by game link (signed in, up to 50)."
    savedAnalyses(urls: [String!]!): JSON
  }
`

/** A message for the player passes; anything else stays masked. */
async function passMessages<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof UserError) throw new GraphQLError(error.message)
    throw error
  }
}

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
            onboardedAt: user.onboardedAt,
          })
          .from(user)
          .leftJoin(chessAccounts, eq(chessAccounts.userId, user.id))
          .where(eq(user.id, context.viewer.id))
          .limit(1)
        if (!row) return null
        // the web app's rule (apps/web/src/server/auth.functions.ts)
        const { onboardedAt, ...me } = row
        return { ...me, onboarded: Boolean(me.chessUsername || onboardedAt) }
      },
      myCompetitions: (_, __, context) =>
        listMyCompetitions(signedIn(context).id),
      openCompetitions: (_, __, context) =>
        listOpenCompetitions(context.viewer?.id ?? null),
      chessAccount: (_, __, context) =>
        passMessages(() => chessAccount(signedIn(context).id)),
      inbox: (_, __, context) =>
        passMessages(() => inbox(signedIn(context).id)),
      unreadCount: (_, __, context) =>
        passMessages(() => unreadCount(signedIn(context).id)),
      invite: (_, { code }: { code: string }, context) =>
        getInvite(
          code.trim().toUpperCase().slice(0, 16),
          context.viewer?.id ?? null,
        ),
      competitionNameCheck: (_, { name }: { name: string }, context) => {
        const viewer = signedIn(context)
        const clean = name.trim()
        if (clean.length < 3 || clean.length > 60) {
          throw new GraphQLError('Names are 3 to 60 characters.')
        }
        return passMessages(() => competitionNameCheck(viewer.id, clean))
      },
      competitionNameIdeas: (_, __, context) =>
        passMessages(() => competitionNameIdeas(signedIn(context).id)),
      myGames: (_, __, context) =>
        passMessages(() => myGames(signedIn(context).id)),
      savedAnalyses: (_, { urls }: { urls: string[] }, context) => {
        const viewer = signedIn(context)
        if (urls.length > MAX_ANALYSES) {
          throw new GraphQLError(`At most ${MAX_ANALYSES} games at once.`)
        }
        return savedAnalyses(viewer.id, urls)
      },
      matchGame: (_, { url }: { url: string }, context) => {
        const viewer = signedIn(context)
        if (url.length > 200 || !URL.canParse(url)) {
          throw new GraphQLError('That is not a game link.')
        }
        return passMessages(() => matchGame(viewer.id, url))
      },
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
