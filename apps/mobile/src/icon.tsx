import { useThemeColor } from 'heroui-native'
import { SvgXml } from 'react-native-svg'
import { ICONS, type IconName } from './icons.generated'

/** The website's icons (Iconify Solar and Hugeicons), by the same names. */
export function Icon({
  name,
  size = 20,
  color,
}: {
  name: IconName
  size?: number
  color?: string
}) {
  const foreground = useThemeColor('foreground')
  const { body, viewBox } = ICONS[name]
  return (
    <SvgXml
      xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`}
      width={size}
      height={size}
      color={color ?? foreground}
    />
  )
}
