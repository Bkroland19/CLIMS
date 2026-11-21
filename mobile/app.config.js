// Expo reads app.json first and passes it here as `config`; app.json stays the source of truth (the
// release script updates its version). This only adds Android size settings when a build profile asks
// for them with CLIMS_SLIM_ANDROID=1, which eas.json sets for the "preview" profile.
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
  if (process.env.CLIMS_SLIM_ANDROID !== "1") return config;
  const plugins = (config.plugins ?? []).filter((p) => pluginName(p) !== "expo-build-properties");
  return {
    ...config,
    plugins: [...plugins, ["expo-build-properties", { android: SLIM_ANDROID }]],
  };
};
