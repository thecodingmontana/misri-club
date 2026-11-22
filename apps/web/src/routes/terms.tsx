import { createFileRoute, Link } from '@tanstack/react-router'
import { DocPage } from '#/components/doc-page'
import { seo } from '#/lib/seo'

export const Route = createFileRoute('/terms')({
  head: () =>
    seo({
      title: 'Terms',
      description: 'The rules for using Misri.',
      path: '/terms',
    }),
  component: Terms,
})

const CONTACT = 'thecodingmontana@gmail.com'

function Terms() {
  return (
    <DocPage title="Terms" updated="22 November 2026">
      <p>By using Misri you agree to these terms. They're short on purpose.</p>

      <h2>The service</h2>
      <p>
        Misri lets you create and join chess leagues and tournaments, played on
        chess.com or anywhere else, and train with puzzles and practice games.
        It's free. Misri is not made by or connected to chess.com.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>If you link a chess.com account, link only one that is yours.</li>
        <li>Keep your sign-in details to yourself.</li>
        <li>You can delete your account at any time from Account.</li>
      </ul>

      <h2>Competitions</h2>
      <ul>
        <li>
          The organiser runs their competition: who joins, the scoring, and
          decisions on unplayed or disputed matches.
        </li>
        <li>
          Results are read from chess.com, or reported by a player and confirmed
          by their opponent, depending on how the organiser set the competition
          up. Report only results that really happened. If something looks
          wrong, talk to your organiser; they can correct it.
        </li>
        <li>
          Play fair. No cheating, no fake accounts, no abuse of other players.
        </li>
      </ul>

      <h2>When we step in</h2>
      <p>
        We may remove competitions or accounts that break these rules, and we
        can change or stop the service. We'll update this page when the terms
        change.
      </p>

      <h2>No guarantees</h2>
      <p>
        Misri is provided as it is. We work to keep it running and correct, but
        we can't promise it's always available or error free, including results
        read from chess.com or reported by players.
      </p>

      <p>
        See also the <Link to="/privacy">privacy page</Link>. Questions:{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </DocPage>
  )
}
