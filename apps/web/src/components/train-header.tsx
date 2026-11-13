import { Link } from '@tanstack/react-router'
import { ChevronLeft } from '#/components/icons'

/** Top of a training mode: the way back to the mode picker, then its title. */
export function TrainHeader({ title }: { title: string }) {
  return (
    <header className="space-y-2">
      <Link
        to="/train"
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary"
      >
        <ChevronLeft className="size-4" />
        Train
      </Link>
      <h1 className="display text-2xl">{title}</h1>
    </header>
  )
}
