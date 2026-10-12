/**
 * The chess.com avatar when the player has one, otherwise a DiceBear portrait
 * seeded by username: unique per player, and the same face on every visit.
 */
export function avatarUrl(username: string, avatar?: string | null): string {
  if (avatar) return avatar
  const seed = encodeURIComponent(username.toLowerCase())
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${seed}&backgroundColor=b9e4c9,ffdfbf,d6ecd2,ffd5c2,c6e6e0`
}
