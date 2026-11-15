import { createFileRoute } from '@tanstack/react-router'
import { DocPage } from '#/components/doc-page'
import { seo } from '#/lib/seo'

export const Route = createFileRoute('/privacy')({
  head: () =>
    seo({
      title: 'Privacy',
      description: 'What Misri stores about you, why, and how to delete it.',
      path: '/privacy',
    }),
  component: Privacy,
})

const CONTACT = 'thecodingmontana@gmail.com'

function Privacy() {
  return (
    <DocPage title="Privacy" updated="15 November 2026">
      <p>
        Misri runs chess leagues and tournaments for players on chess.com. This
        page says what we keep about you, why, and how to remove it. We don't
        sell your data and there are no ads.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your name, email address and, if you
          sign in with Google, your Google profile picture.
        </li>
        <li>
          <strong>Your chess.com account:</strong> the username you verified and
          its public profile picture.
        </li>
        <li>
          <strong>Signing in:</strong> your sessions (with the device's IP
          address and browser name, so you can sign other devices out), passkeys
          (only their public half) and two-step verification settings.
        </li>
        <li>
          <strong>Competitions:</strong> the competitions you create or join,
          their fixtures and results, and the organiser's decisions.
        </li>
        <li>
          <strong>Notifications:</strong> if you turn push on, the address your
          browser gives us to deliver notifications to that device.
        </li>
        <li>
          <strong>Training:</strong> your puzzle and practice progress stays in
          your own browser; we don't store it.
        </li>
      </ul>

      <h2>Why</h2>
      <p>
        Only to run the service: to sign you in, to show who plays whom, to read
        results from chess.com, and to send the notifications you turned on.
        Results come from chess.com's public data for the games you play.
      </p>

      <h2>Who else handles it</h2>
      <ul>
        <li>Vercel hosts the site.</li>
        <li>Supabase hosts the database.</li>
        <li>Resend sends sign-in links by email.</li>
        <li>Google handles "Continue with Google", if you use it.</li>
        <li>
          Your browser's push service (Google, Apple or Mozilla) delivers push
          notifications.
        </li>
        <li>We read public game data from chess.com's public API.</li>
      </ul>

      <h2>Deleting your data</h2>
      <p>
        Go to Account and choose <strong>Delete my account</strong>. That
        removes your account, sessions, passkeys, chess.com link, notification
        devices and memberships. Competitions you organise are deleted with it;
        hand them over first if you want them to carry on.
      </p>

      <h2>Questions</h2>
      <p>
        Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </DocPage>
  )
}
