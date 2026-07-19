// Raises the Gradle daemon's memory in the generated gradle.properties.
// Expo's template caps Metaspace at 512m, and Firebase's
// lintVitalAnalyzeRelease blows through that on CI ("OutOfMemoryError:
// Metaspace" on the GitHub runner). GitHub's ubuntu runners have 16 GB.
const { withGradleProperties } = require('expo/config-plugins');

const JVM_ARGS = '-Xmx4g -XX:MaxMetaspaceSize=1g -Dfile.encoding=UTF-8';

module.exports = function withGradleJvmMemory(config) {
  return withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'org.gradle.jvmargs')
    );
    config.modResults.push({
      type: 'property',
      key: 'org.gradle.jvmargs',
      value: JVM_ARGS,
    });
    return config;
  });
};
