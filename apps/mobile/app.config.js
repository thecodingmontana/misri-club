// app.json plus Firebase: the Android app's google-services.json (written by
// the APK workflow from the GOOGLE_SERVICES_JSON secret) turns on push
// notifications and Firebase Analytics; builds without it simply have neither.
const fs = require('node:fs')
const path = require('node:path')

module.exports = ({ config }) => {
  const file = path.join(__dirname, 'google-services.json')
  if (!fs.existsSync(file)) return config
  return {
    ...config,
    android: { ...config.android, googleServicesFile: './google-services.json' },
    plugins: [...config.plugins, '@react-native-firebase/app'],
  }
}
