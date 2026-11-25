import { Card, SkeletonGroup } from 'heroui-native'
import { View } from 'react-native'

// Placeholders shaped like the real pages, so nothing jumps when data lands.

const Bar = ({ className }: { className: string }) => (
  <SkeletonGroup.Item className={`rounded-full ${className}`} />
)

const times = (n: number) => Array.from({ length: n }, (_, i) => i)

/** Like CompetitionCard: badge, name, facts, and a Join pill on Discover. */
export function CompetitionCardSkeleton({ action }: { action?: boolean }) {
  return (
    <Card className="px-4 py-3.5">
      <SkeletonGroup className="flex-row items-center gap-3">
        <SkeletonGroup.Item className="size-11 rounded-2xl" />
        <View className="flex-1 gap-2">
          <Bar className="h-4 w-3/5" />
          <Bar className="h-3 w-4/5" />
        </View>
        {action ? (
          <SkeletonGroup.Item className="h-8 w-16 rounded-full" />
        ) : (
          <Bar className="size-4" />
        )}
      </SkeletonGroup>
    </Card>
  )
}

export function CompetitionListSkeleton({
  count = 3,
  action,
}: {
  count?: number
  action?: boolean
}) {
  return (
    <View className="gap-3">
      {times(count).map((i) => (
        <CompetitionCardSkeleton key={i} action={action} />
      ))}
    </View>
  )
}

/** Like an inbox notice: unread dot, title, body, time. */
export function InboxSkeleton() {
  return (
    <View className="gap-3">
      {times(5).map((i) => (
        <Card key={i} className="px-4 py-3">
          <SkeletonGroup className="flex-row gap-3">
            <SkeletonGroup.Item className="mt-1.5 size-2 rounded-full" />
            <View className="flex-1 gap-2">
              <Bar className={`h-3.5 ${i % 2 ? 'w-2/3' : 'w-4/5'}`} />
              <Bar className="h-3 w-full" />
              <Bar className="h-2.5 w-1/4" />
            </View>
          </SkeletonGroup>
        </Card>
      ))}
    </View>
  )
}

/** Like a competition page: centred header, tabs, then the table. */
export function CompetitionSkeleton() {
  return (
    <SkeletonGroup className="gap-5 p-4">
      <View className="items-center gap-2.5">
        <Bar className="h-3 w-3/5" />
        <SkeletonGroup.Item className="mt-1 h-10 w-4/5 rounded-xl" />
        <Bar className="h-3 w-1/2" />
        <Bar className="h-3 w-2/3" />
      </View>
      <View className="flex-row gap-2">
        {times(3).map((i) => (
          <SkeletonGroup.Item key={i} className="h-9 flex-1 rounded-full" />
        ))}
      </View>
      <Card className="gap-4 px-4 py-4">
        {times(6).map((i) => (
          <View key={i} className="flex-row items-center gap-3">
            <Bar className="h-3 w-4" />
            <SkeletonGroup.Item className="size-8 rounded-full" />
            <Bar className={`h-3.5 flex-1 ${i % 2 ? 'mr-10' : 'mr-4'}`} />
            <Bar className="h-3.5 w-8" />
          </View>
        ))}
      </Card>
    </SkeletonGroup>
  )
}

/** Like a player page: avatar, name, three tiles, recent results. */
export function PlayerSkeleton() {
  return (
    <SkeletonGroup className="gap-5 p-4">
      <View className="items-center gap-3">
        <SkeletonGroup.Item className="size-14 rounded-full" />
        <SkeletonGroup.Item className="h-10 w-3/5 rounded-xl" />
      </View>
      <View className="flex-row gap-3">
        {times(3).map((i) => (
          <Card key={i} className="flex-1 items-center gap-2 px-2 py-3">
            <Bar className="h-2.5 w-2/3" />
            <SkeletonGroup.Item className="h-7 w-3/4 rounded-lg" />
            <Bar className="h-2.5 w-4/5" />
          </Card>
        ))}
      </View>
      <SkeletonGroup.Item className="h-6 w-2/5 rounded-lg" />
      {times(4).map((i) => (
        <Card key={i} className="flex-row items-center gap-3 px-3 py-2.5">
          <SkeletonGroup.Item className="size-7 rounded-full" />
          <View className="flex-1 gap-2">
            <Bar className="h-3.5 w-1/2" />
            <Bar className="h-2.5 w-3/4" />
          </View>
          <Bar className="h-2.5 w-10" />
        </Card>
      ))}
    </SkeletonGroup>
  )
}

/** Like an invite: badge, name, summary, the facts table and Join. */
export function InviteSkeleton() {
  return (
    <SkeletonGroup className="p-4">
      <Card className="gap-5 px-4 py-5">
        <View className="items-center gap-3">
          <SkeletonGroup.Item className="size-14 rounded-2xl" />
          <Bar className="h-3 w-1/3" />
          <SkeletonGroup.Item className="h-9 w-3/4 rounded-xl" />
          <Bar className="h-3 w-4/5" />
        </View>
        <View className="gap-4 rounded-2xl bg-background px-3 py-3">
          {times(6).map((i) => (
            <View key={i} className="flex-row justify-between">
              <Bar className="h-3 w-1/4" />
              <Bar className={`h-3 ${i % 2 ? 'w-1/3' : 'w-2/5'}`} />
            </View>
          ))}
        </View>
        <SkeletonGroup.Item className="h-12 w-full rounded-full" />
      </Card>
    </SkeletonGroup>
  )
}

/** Like the account card: name and chess.com line. */
export function AccountSkeleton() {
  return (
    <Card className="px-4 py-4">
      <SkeletonGroup className="gap-2.5">
        <Bar className="h-5 w-1/2" />
        <Bar className="h-3.5 w-2/3" />
      </SkeletonGroup>
    </Card>
  )
}
