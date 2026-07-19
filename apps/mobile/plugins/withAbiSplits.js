// Adds per-ABI APK splits to the generated Gradle project, gated on the
// MOORHEN_ABI_SPLITS env var so only the release workflow gets them: the
// universal APK bundles four CPU architectures and most of that is dead
// weight on any given phone, so releases also offer per-ABI APKs at roughly
// a third of the download. Local builds and the plain CI APK stay single-APK.
const { withAppBuildGradle } = require('expo/config-plugins');

const SPLITS_BLOCK = `    splits {
        abi {
            enable System.getenv('MOORHEN_ABI_SPLITS') != null
            reset()
            include 'armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'
            universalApk true
        }
    }
`;

function applyAbiSplits(gradle) {
  if (gradle.includes('MOORHEN_ABI_SPLITS')) return gradle;

  const anchor = '    signingConfigs {';
  if (!gradle.includes(anchor)) {
    throw new Error(
      'withAbiSplits: build.gradle no longer matches the expected template — ' +
        'nowhere to anchor the splits block'
    );
  }
  return gradle.replace(anchor, `${SPLITS_BLOCK}${anchor}`);
}

module.exports = function withAbiSplits(config) {
  return withAppBuildGradle(config, (config) => {
    config.modResults.contents = applyAbiSplits(config.modResults.contents);
    return config;
  });
};
