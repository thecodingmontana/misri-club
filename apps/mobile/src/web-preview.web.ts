// The web preview only (see README): heroui-native reads
// Platform.constants.reactNativeVersion at import, which react-native-web lacks.
import { Platform } from 'react-native'

const platform = Platform as unknown as { constants?: object }
platform.constants ??= { reactNativeVersion: { major: 0, minor: 88, patch: 0 } }
