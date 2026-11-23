/**
 * Club admins are the accounts whose verified email is in `ADMIN_EMAILS`
 * (comma-separated). They can manage any competition (see lib/access).
 */
export function isAdminEmail(user: { email: string; emailVerified: boolean }) {
  if (!user.emailVerified) return false
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  return admins.includes(user.email.toLowerCase())
}
