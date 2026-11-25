// The app's Android notification channels, one per kind of push, so people
// can mute one kind in their phone's settings. No imports: the app uses it too.
export const PUSH_KINDS = {
  games: 'Games and deadlines',
  results: 'Results',
  requests: 'Join requests',
  news: 'Competition news',
  weekly: 'Weekly summary',
  updates: 'App updates',
} as const
export type PushKind = keyof typeof PUSH_KINDS
