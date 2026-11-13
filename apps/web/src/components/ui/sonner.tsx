import { play, type SoundName } from 'cuelume'
import { useTheme } from 'next-themes'
import { useEffect, useRef } from 'react'
import { Toaster as Sonner, type ToasterProps, useSonner } from 'sonner'
import {
  AlertTriangle,
  CheckCircle,
  Info,
  Loader,
  XCircle,
} from '#/components/icons'

const CUES: Partial<Record<string, SoundName>> = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'ready',
  default: 'ready',
  normal: 'ready',
}

/** Every toast sounds like what it reports, quietly; each one once. */
function useToastSounds() {
  const { toasts } = useSonner()
  const heard = useRef(new Set<string | number>())

  useEffect(() => {
    for (const toast of toasts) {
      if (heard.current.has(toast.id)) continue
      heard.current.add(toast.id)
      const cue = CUES[toast.type ?? 'default']
      if (cue) play(cue, { emphasis: 'subtle' })
    }
  }, [toasts])
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()
  useToastSounds()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      icons={{
        success: <CheckCircle className="size-4" />,
        info: <Info className="size-4" />,
        warning: <AlertTriangle className="size-4" />,
        error: <XCircle className="size-4" />,
        loading: <Loader className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
