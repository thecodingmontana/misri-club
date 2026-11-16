import { useEffect } from 'react'
import { Trophy } from '#/components/icons'
import { displayName } from '#/components/match-card'
import { PlayerAvatar } from '#/components/player-chip'
import { confetti } from '#/lib/confetti'
import type { PlayerView } from '#/server/competition-view.server'

/** Confetti once per visitor per competition, not on every visit. */
function celebrateOnce(slug: string) {
  const key = `misri-celebrated-${slug}`
  try {
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
  } catch {
    // storage blocked: celebrating on each visit is the lesser evil
  }
  confetti()
}

/** The finished competition's champion, at the top of its page. */
export function ChampionBanner({
  slug,
  champion,
  isYou,
}: {
  slug: string
  champion: PlayerView
  isYou: boolean
}) {
  useEffect(() => celebrateOnce(slug), [slug])
  const name = displayName(champion)
  return (
    <section
      aria-label="Champion"
      className="flex flex-col items-center gap-3 rounded-2xl bg-card px-4 py-6 text-center shadow-card"
    >
      <div className="relative">
        <PlayerAvatar
          username={name}
          image={champion.image}
          className="size-20"
        />
        <span className="absolute -right-1 -bottom-1 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-card">
          <Trophy className="size-4" aria-hidden />
        </span>
      </div>
      <div>
        <p className="kicker">Champion</p>
        <p className="display text-2xl">{isYou ? 'You won it!' : name}</p>
        {isYou && <p className="text-sm text-muted-foreground">{name}</p>}
      </div>
    </section>
  )
}
