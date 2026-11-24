import { ScrollView } from 'react-native'
import { PageTitle, StartChoices } from '@/competitions'
import { Screen } from '@/components'

/** The website's /start: start your own competition or join one. */
export default function Create() {
  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-5 p-4">
        <PageTitle
          title="What's next?"
          lead="Start your own competition or join one."
        />
        <StartChoices />
      </ScrollView>
    </Screen>
  )
}
