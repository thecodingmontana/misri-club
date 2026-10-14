/**
 * A burst of confetti for a rare win: a solved puzzle, a finished drill, a
 * brilliant move found, a game won. Plain DOM pieces moved with the Web
 * Animations API, so there is no library and nothing left behind afterwards.
 *
 * Under reduced motion it does nothing: the confetti is pure decoration, and
 * every win it marks already shows its own message and plays its own sound.
 */

const COLOURS = ['var(--primary)', '#f2b632', '#ef6f5e', '#4fa3e0', '#9b7be8']

/** Strong ease-out for the burst; the fall afterwards is linear. */
const BURST = 'cubic-bezier(0.23, 1, 0.32, 1)'

export function confetti(pieces = 90) {
  if (typeof window === 'undefined') return
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const layer = document.createElement('div')
  layer.setAttribute('aria-hidden', 'true')
  layer.style.cssText =
    'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:100'
  document.body.append(layer)

  const flights = Array.from({ length: pieces }, (_, i) => {
    const piece = document.createElement('i')
    const size = 6 + Math.random() * 6
    piece.style.cssText = `position:absolute;left:50%;top:38%;width:${size}px;height:${size * 0.45}px;border-radius:1px;background:${COLOURS[i % COLOURS.length]}`
    layer.append(piece)

    // Upwards, fanned 60° either side of straight up.
    const angle = -Math.PI / 2 + ((Math.random() - 0.5) * (Math.PI * 2)) / 3
    const speed = 160 + Math.random() * 300
    const x = Math.cos(angle) * speed
    const y = Math.sin(angle) * speed
    const spin = (Math.random() - 0.5) * 1440

    return piece.animate(
      [
        {
          transform: 'translate(-50%, -50%) rotate(0deg)',
          opacity: 1,
          easing: BURST,
        },
        {
          transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${spin / 2}deg)`,
          opacity: 1,
          offset: 0.35,
          easing: 'linear',
        },
        {
          transform: `translate(calc(-50% + ${x * 1.25}px), calc(-50% + ${y + 420 + Math.random() * 260}px)) rotate(${spin}deg)`,
          opacity: 0,
        },
      ],
      { duration: 1500 + Math.random() * 900, fill: 'forwards' },
    )
  })

  void Promise.allSettled(flights.map((flight) => flight.finished)).then(() =>
    layer.remove(),
  )
}
