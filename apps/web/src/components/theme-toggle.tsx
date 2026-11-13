import { useTheme } from 'next-themes'
import { Moon, Sun } from '#/components/icons'
import { Button } from '#/components/ui/button'

/**
 * Both icons render and CSS picks one, so the server and the first client
 * render agree before `next-themes` knows the stored theme.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full"
      aria-label="Toggle light and dark theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="size-[1.15rem] dark:hidden" />
      <Moon className="hidden size-[1.15rem] dark:block" />
    </Button>
  )
}
