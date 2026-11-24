// Signs release builds with the Misri upload key when CI provides it
// (MISRI_UPLOAD_STORE_FILE and friends, as Gradle properties); without it,
// release builds keep Expo's default debug signing, fine for a test install.
const { withAppBuildGradle } = require('expo/config-plugins')

const SIGNING = `
        release {
            if (project.hasProperty('MISRI_UPLOAD_STORE_FILE')) {
                storeFile file(MISRI_UPLOAD_STORE_FILE)
                storePassword MISRI_UPLOAD_STORE_PASSWORD
                keyAlias MISRI_UPLOAD_KEY_ALIAS
                keyPassword MISRI_UPLOAD_KEY_PASSWORD
            }
        }`

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents
    if (!gradle.includes('MISRI_UPLOAD_STORE_FILE')) {
      gradle = gradle.replace(
        /signingConfigs\s*\{/,
        (open) => `${open}${SIGNING}`,
      )
      // the release build type uses it when the key is there
      gradle = gradle.replace(
        /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
        "$1signingConfig project.hasProperty('MISRI_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
      )
    }
    mod.modResults.contents = gradle
    return mod
  })
}
