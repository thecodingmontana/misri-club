import { db } from '@misri/db/client'
import {
  chessAccounts,
  competitionMembers,
  competitions,
  user,
} from '@misri/db/schema'
import { and, count, eq, inArray, or, sql } from 'drizzle-orm'
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
  }

  type Query {
    "The signed-in player, or null."
    me: Me
    "Competitions you own or joined (signed in)."
    myCompetitions: [CompetitionSummary!]!
    "Public competitions taking players, minus ones you're in."
    openCompetitions: [CompetitionSummary!]!
  }
`

const memberCount = db
  .select({
    competitionId: competitionMembers.competitionId,
    members: count().as('members'),
  })
  .from(competitionMembers)
  .groupBy(competitionMembers.competitionId)
  .as('member_count')

const summary = {
  slug: competitions.slug,
  name: competitions.name,
  format: competitions.format,
  status: competitions.status,
  timeControl: competitions.timeControl,
  members: sql<number>`coalesce(${memberCount.members}, 0)`.mapWith(Number),
}

const signedIn = (context: Context) => {
  if (!context.viewer) throw new GraphQLError('Sign in first.')
  return context.viewer
}

export const schema = createSchema<Context>({
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
      myCompetitions: (_, __, context) => {
        const { id } = signedIn(context)
        const mine = db
          .select({ id: competitionMembers.competitionId })
          .from(competitionMembers)
          .where(eq(competitionMembers.userId, id))
        return db
          .select(summary)
          .from(competitions)
          .leftJoin(memberCount, eq(memberCount.competitionId, competitions.id))
          .where(
            or(eq(competitions.ownerId, id), inArray(competitions.id, mine)),
          )
          .orderBy(sql`${competitions.createdAt} desc`)
          .limit(100)
      },
      openCompetitions: (_, __, context) => {
        const viewerId = context.viewer?.id
        return db
          .select(summary)
          .from(competitions)
          .leftJoin(memberCount, eq(memberCount.competitionId, competitions.id))
          .where(
            and(
              eq(competitions.visibility, 'public'),
              or(
                eq(competitions.status, 'open'),
                and(
                  eq(competitions.status, 'running'),
                  eq(competitions.format, 'league'),
                  eq(competitions.allowLateEntry, true),
                ),
              ),
              viewerId
                ? sql`not exists (select 1 from ${competitionMembers} where ${competitionMembers.competitionId} = ${competitions.id} and ${competitionMembers.userId} = ${viewerId})`
                : undefined,
            ),
          )
          .orderBy(sql`${competitions.createdAt} desc`)
          .limit(30)
      },
    },
  },
})

export const yoga = createYoga<{ request: Request }, Context>({
  schema,
  graphqlEndpoint: '/graphql',
  // bearer tokens, no cookies: any origin may call it; Hono's cors() answers
  cors: false,
  graphiql: true,
  landingPage: false,
  context: async ({ request }) => ({
    viewer: await viewerFrom(request.headers),
  }),
})
