const { withAppBuildGradle } = require('@expo/config-plugins');

// Renames build outputs to: finla-v<versionName>-<versionCode>.<apk|aab>
// e.g. finla-v1.0.0-1.apk / finla-v1.0.0-1.aab
//
// APK: uses the official `output.outputFileName` API (robust).
// AAB: there is no equivalent API, so we rename the default `app-<variant>.aab`
//      after the `bundle<Variant>` task. This is version-dependent (AGP default
//      naming) and skips silently if the expected file is not found, so it never
//      breaks the build.
const RENAME_BLOCK = `
    // Injected by plugins/with-android-apk-name.js
    applicationVariants.all { variant ->
        variant.outputs.all { output ->
            if (output.outputFileName != null && output.outputFileName.toString().endsWith('.apk')) {
                outputFileName = "finla-v\${variant.versionName}-\${variant.versionCode}.apk"
            }
        }
        def capName = variant.name.capitalize()
        tasks.matching { it.name == "bundle\${capName}" }.all { bundleTask ->
            bundleTask.doLast {
                def bundleDir = new File("\${buildDir}/outputs/bundle/\${variant.name}")
                def defaultAab = new File(bundleDir, "app-\${variant.name}.aab")
                if (defaultAab.exists()) {
                    defaultAab.renameTo(new File(bundleDir, "finla-v\${variant.versionName}-\${variant.versionCode}.aab"))
                }
            }
        }
    }
`;

const MARKER = 'plugins/with-android-apk-name.js';

const withAndroidApkName = (config) => {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        `with-android-apk-name: expected groovy build.gradle, got ${cfg.modResults.language}`
      );
    }

    let contents = cfg.modResults.contents;

    // Idempotent: don't inject twice across repeated prebuilds.
    if (contents.includes(MARKER)) {
      return cfg;
    }

    // Insert right after the opening of the top-level `android {` block.
    const match = contents.match(/android\s*\{/);
    if (!match || match.index === undefined) {
      throw new Error('with-android-apk-name: could not find `android {` block in build.gradle');
    }

    const insertPos = match.index + match[0].length;
    contents = contents.slice(0, insertPos) + '\n' + RENAME_BLOCK + contents.slice(insertPos);

    cfg.modResults.contents = contents;
    return cfg;
  });
};

module.exports = withAndroidApkName;
