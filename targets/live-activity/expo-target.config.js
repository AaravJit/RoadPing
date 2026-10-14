/**
 * RoadPing Live Activity widget extension (Lock Screen, Dynamic Island,
 * CarPlay). Generated into the Xcode project by @bacons/apple-targets during
 * `expo prebuild`; nothing under ios/ is committed.
 *
 * Deployment target iOS 18.0: the CarPlay layout uses iOS 18's
 * supplementalActivityFamilies / ActivityFamily. The app itself still
 * supports iOS 15.1 and starts the Live Activity only on iOS 18+.
 *
 * @type {import('@bacons/apple-targets/app.plugin').Config}
 */
module.exports = {
  type: 'widget',
  name: 'RoadPingLiveActivity',
  displayName: 'RoadPing',
  bundleIdentifier: '.liveactivity',
  deploymentTarget: '18.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
  colors: {
    $accent: { color: '#0A84FF', darkColor: '#0A84FF' },
  },
};
