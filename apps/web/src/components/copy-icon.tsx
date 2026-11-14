import { Check, Copy } from '#/components/icons'
import { cn } from '#/lib/utils'

const LAYER =
  'col-start-1 row-start-1 transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-opacity'
const HIDDEN = 'opacity-0 motion-safe:scale-25 motion-safe:blur-[4px]'

/**
 * Copy ↔ tick, cross-faded: both stay in the DOM so the swap can reverse
 * mid-flight. Scale and blur only run when motion is allowed.
 */
export function CopyIcon({ copied }: { copied: boolean }) {
  return (
    <span className="grid place-items-center" aria-hidden>
      <Copy className={cn(LAYER, copied && HIDDEN)} />
      <Check className={cn(LAYER, 'text-primary', !copied && HIDDEN)} />
    </span>
  )
}
