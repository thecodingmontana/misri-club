// The web preview only: kept in localStorage.
const key = (name: string) => `misri.page-cache.${name}`

let generation = 0
export const cacheGeneration = () => generation

export async function readCached<T>(
  name: string,
): Promise<{ data: T; at: number } | null> {
  try {
    return JSON.parse(localStorage.getItem(key(name)) ?? 'null')
  } catch {
    return null
  }
}

export function writeCached(
  name: string,
  data: unknown,
  since: number,
  at = Date.now(),
) {
  if (since !== generation) return
  try {
    localStorage.setItem(key(name), JSON.stringify({ data, at }))
  } catch {}
}

export function clearCached() {
  generation++
  try {
    for (const k of Object.keys(localStorage))
      if (k.startsWith('misri.page-cache.')) localStorage.removeItem(k)
  } catch {
    // storage blocked: nothing to clear
  }
}
