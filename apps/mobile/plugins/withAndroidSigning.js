// Points the release build type at a real keystore when the MOORHEN_RELEASE_*
// env vars are set (the release workflow sets them from repo secrets). Without
// them — local builds, the plain CI APK — it falls back to the debug keystore,
// same as stock Expo, so `expo run:android` keeps working with no setup.
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_SIGNING_CONFIG = `
        release {
            if (System.getenv('MOORHEN_RELEASE_STORE_FILE')) {
                storeFile file(System.getenv('MOORHEN_RELEASE_STORE_FILE'))
                storePassword System.getenv('MOORHEN_RELEASE_STORE_PASSWORD')
                keyAlias System.getenv('MOORHEN_RELEASE_KEY_ALIAS')
                keyPassword System.getenv('MOORHEN_RELEASE_KEY_PASSWORD')
            } else {
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }`;

function applyReleaseSigning(gradle) {
  if (gradle.includes('MOORHEN_RELEASE_STORE_FILE')) return gradle;

  const withConfig = gradle.replace(
    /(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\}\s*)\}/,
    `$1${RELEASE_SIGNING_CONFIG}\n    }`
  );
  const withSwap = withConfig.replace(
    /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
    '$1signingConfig signingConfigs.release'
  );
  if (withSwap === gradle || !withSwap.includes('signingConfigs.release')) {
    throw new Error(
      'withAndroidSigning: build.gradle no longer matches the expected template — ' +
        'refusing to prebuild rather than silently ship a debug-signed release'
    );
  }
  return withSwap;
}

module.exports = function withAndroidSigning(config) {
  return withAppBuildGradle(config, (config) => {
    config.modResults.contents = applyReleaseSigning(config.modResults.contents);
    return config;
  });
};
