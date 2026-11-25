import { router, Tabs, useFocusEffect } from 'expo-router'
import { Button, useThemeColor } from 'heroui-native'
import { useCallback, useState } from 'react'
import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUniwind } from 'uniwind'
import { Icon, type IconName } from '@/icon'
import { useSession } from '@/lib/session'
import { play, saveSoundOn, soundOn } from '@/lib/sound'
import { saveTheme } from '@/lib/theme'
import { UpdateButton } from '@/update-prompt'

// The website's MAIN_NAV (apps/web/src/components/nav.ts), same order and icons.
const TABS: Array<{
  name: string
  label: string
  icon: IconName
  active: IconName
}> = [
  { name: 'index', label: 'Home', icon: 'HomeOutline', active: 'HomeFilled' },
  { name: 'create', label: 'Create', icon: 'PlusOutline', active: 'Plus' },
  { name: 'join', label: 'Join', icon: 'UserPlusOutline', active: 'UserPlus' },
  {
    name: 'train',
    label: 'Train',
    icon: 'TrainOutline',
    active: 'TrainFilled',
  },
]

export default function TabsLayout() {
  const [background, border, accent, muted] = useThemeColor([
    'background',
    'border',
    'accent',
    'muted',
  ])
  // the icon sits in a pill and Android's own buttons or gesture bar sit
  // under the tabs: size the bar for both, or the labels get cut off
  const { bottom } = useSafeAreaInsets()
  return (
    <Tabs
      screenOptions={{
        header: () => <TopBar />,
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: muted,
        tabBarStyle: {
          backgroundColor: background,
          borderTopColor: border,
          height: 64 + bottom,
          paddingTop: 6,
          paddingBottom: bottom + 6,
        },
        tabBarLabelStyle: { fontFamily: 'Bricolage-SemiBold', fontSize: 11 },
        sceneStyle: { backgroundColor: background },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          listeners={{ tabPress: () => play('navigate') }}
          options={{
            title: tab.label,
            tabBarIcon: ({ focused, color }) => (
              <View
                className={`h-7 w-14 items-center justify-center rounded-full ${focused ? 'bg-accent/15' : ''}`}
              >
                <Icon
                  name={focused ? tab.active : tab.icon}
                  color={String(color)}
                  size={20}
                />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  )
}

/** The website's top bar: theme and sound on the left, Misri, then the inbox and you. */
function TopBar() {
  const insets = useSafeAreaInsets()
  const { api } = useSession()
  const [unread, setUnread] = useState(0)
  useFocusEffect(
    useCallback(() => {
      api
        ?.unreadCount()
        .then(setUnread)
        .catch(() => {})
    }, [api]),
  )
  const label = unread > 0 ? `Inbox, ${unread} unread` : 'Inbox'
  const { theme } = useUniwind()
  const [sound, setSound] = useState(soundOn())
  return (
    <View
      className="flex-row items-center bg-background px-3 pb-2"
      style={{ paddingTop: insets.top + 8 }}
    >
      <View className="flex-1 flex-row items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          accessibilityLabel="Toggle light and dark theme"
          onPress={() => {
            play('tap')
            void saveTheme(theme === 'dark' ? 'light' : 'dark')
          }}
        >
          <Icon name={theme === 'dark' ? 'Moon' : 'Sun'} size={19} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          accessibilityLabel="Interface sounds"
          accessibilityState={{ checked: sound }}
          onPress={() => {
            void saveSoundOn(!sound)
            setSound(!sound)
            if (!sound) play('tap')
          }}
        >
          <Icon name={sound ? 'Volume' : 'VolumeOff'} size={19} />
        </Button>
        <UpdateButton />
      </View>
      <Text className="font-display text-2xl uppercase text-foreground">
        Misri
      </Text>
      <View className="flex-1 flex-row items-center justify-end gap-1">
        {/* the badge sits beside the button, which clips what overflows it */}
        <View>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            accessibilityLabel={label}
            onPress={() => router.push('/inbox')}
          >
            <Icon name="Bell" size={19} />
          </Button>
          {unread > 0 && (
            <View
              pointerEvents="none"
              className="absolute top-0 right-0 h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1"
            >
              <Text className="font-semibold text-[10px] text-accent-foreground">
                {unread > 9 ? '9+' : unread}
              </Text>
            </View>
          )}
        </View>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          accessibilityLabel="Your account"
          onPress={() => router.push('/account')}
        >
          <Icon name="UserRound" size={19} />
        </Button>
      </View>
    </View>
  )
}
