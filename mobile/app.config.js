const { existsSync } = require("node:fs");
const { join } = require("node:path");

// Expo reads app.json first. The preview build profile enables the optional Android size settings.
//
// The slim preview APK:
// - targets 64-bit ARM phones only (arm64-v8a), instead of four CPU types in one universal APK;
// - shrinks and optimises Java/Kotlin code with R8 and drops unused Android resources;
// - stores native libraries compressed inside the APK (smaller download; Android unpacks them at
//   install, so the installed app takes a little more space).
// Production builds keep the defaults until the preview has been tested with these settings.
const SLIM_ANDROID = {
  buildArchs: ["arm64-v8a"],
  enableMinifyInReleaseBuilds: true,
  enableShrinkResourcesInReleaseBuilds: true,
  useLegacyPackaging: true,
};

const pluginName = (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin);

module.exports = ({ config }) => {
  const localGoogleServicesFile = join(__dirname, "../google-services.json");
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ||
    (existsSync(localGoogleServicesFile) ? localGoogleServicesFile : undefined);
  if (googleServicesFile) {
    config = { ...config, android: { ...config.android, googleServicesFile } };
  }
  if (process.env.CLIMS_SLIM_ANDROID !== "1") return config;
  const plugins = (config.plugins ?? []).filter((p) => pluginName(p) !== "expo-build-properties");
  return {
    ...config,
    plugins: [...plugins, ["expo-build-properties", { android: SLIM_ANDROID }]],
  };
};
