// The web preview only: no device notifications.
export function appRoute(url: string): string | null {
  const m = /^\/(c|join|p)\/([^/?#]+)/.exec(url)
  return m ? `/${m[1]}/${m[2]}` : url === '/inbox' ? '/inbox' : null
}
export async function registerForPush() {}
export function openTappedNotifications() {
  return () => {}
}
export async function pushStatus(): Promise<'on' | 'off' | 'blocked'> {
  return 'on'
}
