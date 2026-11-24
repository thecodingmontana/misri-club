// The web preview's shim must run before any route chunk loads heroui-native;
// on Android web-preview.ts is empty.
import './src/web-preview'
import 'expo-router/entry'
