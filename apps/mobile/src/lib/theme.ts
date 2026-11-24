import { useColorScheme } from 'react-native'

// The website's palette (apps/web/src/styles.css), light and dark.
const light = {
  background: '#fbf8e6',
  card: '#f0f2e1',
  text: '#1f4d3a',
  muted: '#587463',
  primary: '#2b7350',
  primaryText: '#ffffff',
  secondary: '#e6ebd5',
  border: '#dfe3cc',
  danger: '#c2412f',
}
const dark: typeof light = {
  background: '#0e100e',
  card: '#191c19',
  text: '#eceeea',
  muted: '#9ba59b',
  primary: '#5fbf6a',
  primaryText: '#0e100e',
  secondary: '#232823',
  border: '#2a2f2a',
  danger: '#f0705e',
}

export type Colors = typeof light

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light
}
