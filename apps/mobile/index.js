// The web preview's shim must run before any route chunk loads heroui-native;
// on Android web-preview.ts is empty.
import './src/web-preview'
import { registerWidgets } from './src/widgets/register'
import 'expo-router/entry'

// before the app renders: Android may start the app just to draw a widget
registerWidgets()
