import {
  CalendarFilled,
  CalendarOutline,
  CrownFilled,
  CrownOutline,
  HomeFilled,
  HomeOutline,
  TrainFilled,
  TrainOutline,
  UsersFilled,
  UsersOutline,
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
  { to: '/table', label: 'Table', icon: CrownOutline, active: CrownFilled },
  {
    to: '/fixtures',
    label: 'Fixtures',
    icon: CalendarOutline,
    active: CalendarFilled,
  },
  { to: '/train', label: 'Train', icon: TrainOutline, active: TrainFilled },
  { to: '/club', label: 'Club', icon: UsersOutline, active: UsersFilled },
] as const

export type NavItem = (typeof MAIN_NAV)[number]
