import type { CSSProperties } from 'react'

/**
 * Text that arrives word by word; `**phrases**` get the looping highlighter.
 * Screen readers get the sentence once, not the pieces.
 */
export function Lede({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  let w = 0
  const parts = text.split(/(\*\*[^*]+\*\*)/).filter(Boolean)
  return (
    <p className={className}>
      <span className="sr-only">{text.replaceAll('**', '')}</span>
      <span aria-hidden>
        {parts.map((part, p) => {
          const marked = part.startsWith('**')
          const words = part.replaceAll('**', '').split(/(\s+)/)
          const spans = words.map((word, i) =>
            /^\s+$/.test(word) ? (
              word
            ) : (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: static text
                key={i}
                className="l-word"
                style={{ '--w': w++ } as CSSProperties}
              >
                {word}
              </span>
            ),
          )
          return marked ? (
            <mark
              // biome-ignore lint/suspicious/noArrayIndexKey: static text
              key={p}
              className="l-mark bg-transparent text-inherit"
              style={{ '--w': w } as CSSProperties}
            >
              {spans}
            </mark>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: static text
            <span key={p}>{spans}</span>
          )
        })}
      </span>
    </p>
  )
}
