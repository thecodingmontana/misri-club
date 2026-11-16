import { useQuery } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useTheme } from 'next-themes'
import { Dialog, VisuallyHidden } from 'radix-ui'
import { useEffect, useSyncExternalStore } from 'react'
import {
  Bell,
  Compass,
  HomeOutline,
  LogOut,
  Moon,
  PlusOutline,
  RefreshCw,
  Sun,
  TrainOutline,
  Trophy,
  UserPlusOutline,
  UserRound,
} from '#/components/icons'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '#/components/ui/command'
import { authClient } from '#/lib/auth-client'
import { forgetSession } from '#/lib/session-cache'
import { toast } from '#/lib/toast'
import {
  getMyCompetitionsFn,
  syncMineFn,
} from '#/server/competitions.functions'

// Jump anywhere from the keyboard: ⌘K / Ctrl+K, or the search button in the top bar.

let open = false
/** What had focus when the menu opened: it gets focus back on close. */
let returnTo: HTMLElement | null = null
const listeners = new Set<() => void>()
function setOpen(next: boolean) {
  if (next && !open) returnTo = document.activeElement as HTMLElement | null
  open = next
  for (const listener of listeners) listener()
}

/** Opens the menu (the top bar's search button). */
export const openCommandMenu = () => setOpen(true)

const PAGES = [
  { to: '/', label: 'Home', icon: HomeOutline },
  { to: '/discover', label: 'Discover competitions', icon: Compass },
  { to: '/start', label: 'Create a competition', icon: PlusOutline },
  { to: '/join', label: 'Join with a code', icon: UserPlusOutline },
  { to: '/inbox', label: 'Inbox', icon: Bell },
  { to: '/train', label: 'Train', icon: TrainOutline },
  { to: '/train/puzzles', label: 'Puzzles', icon: TrainOutline },
  { to: '/train/openings', label: 'Openings', icon: TrainOutline },
  { to: '/account', label: 'Account and notifications', icon: UserRound },
] as const

export function CommandMenu() {
  const isOpen = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => open,
    () => false,
  )
  const navigate = useNavigate()
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const getMine = useServerFn(getMyCompetitionsFn)
  const syncMine = useServerFn(syncMineFn)
  const mine = useQuery({
    queryKey: ['command-menu', 'mine'],
    queryFn: () => getMine(),
    enabled: isOpen,
    staleTime: 60_000,
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen(!open)
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  /** Closes first, so focus is back on the page before anything moves. */
  const run = (action: () => unknown) => () => {
    setOpen(false)
    void action()
  }

  const go = (to: string) => run(() => navigate({ to }))

  async function checkResults() {
    try {
      const { changed } = (await syncMine()) as { changed: number }
      await router.invalidate()
      toast.success(
        changed
          ? `${changed} new result${changed === 1 ? '' : 's'}`
          : 'Up to date',
      )
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  async function signOut() {
    const { error } = await authClient.signOut()
    if (error) {
      toast.error("Couldn't sign out", { desc: error.message })
      return
    }
    forgetSession()
    await router.invalidate()
    await navigate({ to: '/auth/signin' })
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed inset-x-3 top-[12dvh] z-50 mx-auto max-w-lg overflow-hidden rounded-2xl shadow-2xl outline-none"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnTo?.focus()
          }}
        >
          <VisuallyHidden.Root>
            <Dialog.Title>Jump to</Dialog.Title>
          </VisuallyHidden.Root>
          <Command loop>
            <CommandInput
              aria-label="Search pages, competitions and actions"
              placeholder="Search pages, competitions, actions…"
            />
            <CommandList>
              <CommandEmpty>Nothing matches.</CommandEmpty>
              {(mine.data?.length ?? 0) > 0 && (
                <CommandGroup heading="Your competitions">
                  {mine.data?.map((c) => (
                    <CommandItem
                      key={c.slug}
                      value={`competition ${c.name}`}
                      onSelect={run(() =>
                        navigate({ to: '/c/$slug', params: { slug: c.slug } }),
                      )}
                    >
                      <Trophy aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {c.status}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandGroup heading="Pages">
                {PAGES.map((page) => (
                  <CommandItem
                    key={page.to}
                    value={page.label}
                    onSelect={go(page.to)}
                  >
                    <page.icon aria-hidden />
                    {page.label}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Actions">
                <CommandItem
                  value="Check chess.com for results"
                  onSelect={run(checkResults)}
                >
                  <RefreshCw aria-hidden />
                  Check chess.com for results
                </CommandItem>
                <CommandItem
                  value="Toggle theme dark light"
                  onSelect={run(() =>
                    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
                  )}
                >
                  {resolvedTheme === 'dark' ? (
                    <Sun aria-hidden />
                  ) : (
                    <Moon aria-hidden />
                  )}
                  {resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'}
                </CommandItem>
                <CommandItem value="Sign out" onSelect={run(signOut)}>
                  <LogOut aria-hidden />
                  Sign out
                </CommandItem>
              </CommandGroup>
            </CommandList>
            <div className="flex justify-end gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
              <span>
                <CommandShortcut className="ml-0">↑↓</CommandShortcut> move
              </span>
              <span>
                <CommandShortcut className="ml-0">↵</CommandShortcut> open
              </span>
              <span>
                <CommandShortcut className="ml-0">esc</CommandShortcut> close
              </span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
