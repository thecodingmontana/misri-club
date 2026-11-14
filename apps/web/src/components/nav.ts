import {
  HomeFilled,
  HomeOutline,
  Plus,
  PlusOutline,
  TrainFilled,
  TrainOutline,
  UserPlus,
  UserPlusOutline,
} from '#/components/icons'

/**
 * One list for the phone tab bar and the desktop sidebar, so the two menus
 * never drift apart (Zadaci's components/shell/nav.ts pattern).
 */
export const MAIN_NAV = [
  {
    to: '/',
    label: 'Home',
    icon: HomeOutline,
    active: HomeFilled,
    exact: true,
  },
  { to: '/start', label: 'Create', icon: PlusOutline, active: Plus },
  { to: '/join', label: 'Join', icon: UserPlusOutline, active: UserPlus },
  { to: '/train', label: 'Train', icon: TrainOutline, active: TrainFilled },
] as const

export type NavItem = (typeof MAIN_NAV)[number]
