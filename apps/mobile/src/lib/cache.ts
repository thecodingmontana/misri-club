import { Directory, File, Paths } from 'expo-file-system'

/**
 * The last good answer for a page, kept as a file so it can be shown with no
 * connection. Files (not secure storage): a competition page is too big for
 * a keychain value, and nothing here is secret beyond the account's own view.
 */

const dir = () => new Directory(Paths.document, 'page-cache')
const file = (name: string) =>
  new File(dir(), `${name.replace(/[^\w.-]/g, '_')}.json`)

export async function readCached<T>(
  name: string,
): Promise<{ data: T; at: number } | null> {
  try {
    const f = file(name)
    return f.exists ? JSON.parse(await f.text()) : null
  } catch {
    return null
  }
}

export function writeCached(name: string, data: unknown) {
  try {
    if (!dir().exists) dir().create()
    file(name).writeSync(JSON.stringify({ data, at: Date.now() }))
  } catch {
    // a full disk only costs the offline copy
  }
}

/** Signing out: nobody else on this phone sees this account's pages. */
export function clearCached() {
  try {
    if (dir().exists) dir().delete()
  } catch {
    // nothing kept
  }
}
