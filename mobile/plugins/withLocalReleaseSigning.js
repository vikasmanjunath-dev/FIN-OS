// Local, sideloadable Android release builds (APK handed out from the website; see docs/RELEASE_RUNBOOK.md).
//
// `expo prebuild` regenerates android/ from scratch, so anything edited there by hand is lost. This plugin re-applies:
//   1. release signing from ~/finos-release-signing/signing.properties (key and passwords stay OUT of the repo); skipped
//      when that file is absent, so EAS / CI builds are unaffected and keep their own signing;
//   2. --enable-native-access for Gradle, which JDK 24+ (Android Studio's bundled JDK) needs for the CMake step;
//   3. FINOS_ANDROID_VERSION_CODE (env) as the versionCode, because app.json must not hard-code one (EAS owns it).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const SIGNING = path.join(os.homedir(), 'finos-release-signing', 'signing.properties');

const SIGNING_BLOCK = `
        release {
            // Added by plugins/withLocalReleaseSigning.js
            def sp = new Properties()
            new File(System.getProperty('user.home'), 'finos-release-signing/signing.properties').withInputStream { sp.load(it) }
            storeFile file(sp['FINOS_STORE_FILE'])
            storePassword sp['FINOS_STORE_PASSWORD']
            keyAlias sp['FINOS_KEY_ALIAS']
            keyPassword sp['FINOS_KEY_PASSWORD']
        }`;

function withLocalReleaseSigning(config) {
  config = withAppBuildGradle(config, (c) => {
    let g = c.modResults.contents;
    if (fs.existsSync(SIGNING) && !g.includes('withLocalReleaseSigning')) {
      g = g.replace(/(signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\n\s*\})/, `$1${SIGNING_BLOCK}`);
      g = g.replace(/(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/, '$1signingConfig signingConfigs.release');
    }
    const code = parseInt(process.env.FINOS_ANDROID_VERSION_CODE || '', 10);
    if (code > 0) g = g.replace(/versionCode \d+/, `versionCode ${code}`);
    c.modResults.contents = g;
    return c;
  });
  return withGradleProperties(config, (c) => {
    const item = c.modResults.find((p) => p.type === 'property' && p.key === 'org.gradle.jvmargs');
    const value = '-Xmx3072m -XX:MaxMetaspaceSize=768m --enable-native-access=ALL-UNNAMED';
    if (item) item.value = value;
    else c.modResults.push({ type: 'property', key: 'org.gradle.jvmargs', value });
    return c;
  });
}

module.exports = withLocalReleaseSigning;
