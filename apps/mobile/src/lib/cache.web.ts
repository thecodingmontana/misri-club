// The web preview only: kept in localStorage.
const key = (name: string) => `misri.page-cache.${name}`

export async function readCached<T>(
  name: string,
): Promise<{ data: T; at: number } | null> {
  try {
    return JSON.parse(localStorage.getItem(key(name)) ?? 'null')
  } catch {
    return null
  }
}

export function writeCached(name: string, data: unknown) {
  try {
    localStorage.setItem(key(name), JSON.stringify({ data, at: Date.now() }))
  } catch {}
}

export function clearCached() {
  for (const k of Object.keys(localStorage))
    if (k.startsWith('misri.page-cache.')) localStorage.removeItem(k)
}
