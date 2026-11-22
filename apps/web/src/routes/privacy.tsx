import { createFileRoute, Link } from '@tanstack/react-router'
import { DocPage } from '#/components/doc-page'
import { seo } from '#/lib/seo'

export const Route = createFileRoute('/privacy')({
  head: () =>
    seo({
      title: 'Privacy',
      description: 'What Misri keeps about you, why, and how to remove it.',
      path: '/privacy',
    }),
  component: Privacy,
})

const CONTACT = 'thecodingmontana@gmail.com'

function Privacy() {
  return (
    <DocPage title="Privacy" updated="22 November 2026">
      <p>
        Misri keeps only what it needs to run your competitions and training. No
        ads, no tracking scripts, and nothing is sold.
      </p>

      <h2>What we keep</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your name, email address and profile
          picture (from Google, if you sign in with it), and how you sign in:
          passkeys and two-step settings.
        </li>
        <li>
          <strong>Sessions:</strong> while you're signed in, the device and
          network address (IP) of each session, so you can see and end them from
          Account.
        </li>
        <li>
          <strong>Your chess.com link:</strong> your chess.com username and
          avatar, if you link them.
        </li>
        <li>
          <strong>Competitions:</strong> the ones you create or join, your
          fixtures, results, reports and any decisions on them.
        </li>
        <li>
          <strong>Notifications:</strong> your inbox, and the address your
          browser gives us for push notifications if you turn them on.
        </li>
        <li>
          <strong>Abuse protection:</strong> short-lived counters, keyed to your
          account or IP address, that limit things like sign-in emails.
        </li>
      </ul>

      <h2>What stays on your device</h2>
      <p>
        Training progress, a practice game in progress, engine analysis you've
        run, and preferences such as sound and the sidebar are kept in your
        browser only. Clearing your browser's site data removes them.
      </p>

      <h2>Who sees what</h2>
      <ul>
        <li>
          Players in your competitions see your name, picture and results there.
          Public competitions can be seen by anyone signed in.
        </li>
        <li>
          Your player page shows your record from competitions the viewer is
          allowed to see. Your email address is never shown to other players.
        </li>
      </ul>

      <h2>Services we use</h2>
      <ul>
        <li>Vercel hosts the app; Supabase holds the database.</li>
        <li>Resend delivers sign-in emails.</li>
        <li>Google, only if you choose "Continue with Google".</li>
        <li>
          Your browser's push service (Apple, Google, Mozilla or Microsoft)
          delivers push notifications you turned on.
        </li>
        <li>
          chess.com's public API, to read the games and ratings of linked
          accounts. Puzzles and some analysis come from lichess.org, called
          straight from your browser.
        </li>
      </ul>

      <h2>Removing your data</h2>
      <p>
        Delete your account at any time from <Link to="/account">Account</Link>.
        That removes your account, sign-in methods, sessions, chess.com link,
        notifications and push devices. Games you already played stay in their
        competitions' results, shown as "A former player", so other players'
        standings don't change. If you run a competition others are in, hand it
        over first. To ask what we hold about you or to have something
        corrected, email us.
      </p>

      <p>
        See also the <Link to="/terms">terms</Link>. Questions:{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </DocPage>
  )
}
