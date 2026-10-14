/**
 * RoadPing Phase 3 native configuration (applied by `expo prebuild`; the
 * generated ios/ directory is never committed).
 *
 * Always:
 *   • UIBackgroundModes "location": keeps location updates that the user
 *     started by tapping Go Live running in the background. Authorization
 *     stays When In Use; RoadPing never requests Always.
 *   • NSSupportsLiveActivities: the Live Activity while live.
 *
 * When voice is enabled for this build: EXPO_PUBLIC_DISABLE_AGORA is not
 * "true" in the build environment, AND the build is not an EAS "production"
 * profile build unless ROADPING_PTT_IN_PRODUCTION is "true" (so the shipping
 * configuration cannot pick up PushToTalk by accident, e.g. if the production
 * kill-switch variable were ever missing):
 *   • UIBackgroundModes "push-to-talk"
 *   • com.apple.developer.push-to-talk entitlement
 *   • aps-environment (PushToTalk pushes come through APNs). "development"
 *     here, as expo-notifications does; App Store / TestFlight export signs
 *     with the distribution profile's production value.
 * A build with the Agora kill switch on, or a production build without the
 * explicit opt-in, declares neither, so it never claims a capability it does
 * not use.
 *
 * CarPlay app scaffold (Phase 3.5), OFF unless ROADPING_CARPLAY_ENTITLEMENT is
 * set at prebuild time. Refuses to run for an EAS "production" profile build:
 * RoadPing does not hold a CarPlay entitlement and must not ship one.
 *   ROADPING_CARPLAY_ENTITLEMENT=driving-task
 *     → com.apple.developer.carplay-driving-task entitlement
 *     → a scene manifest with the phone scene and the CarPlay scene
 * Live Activities appear in CarPlay without any of this.
 */

const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

const CARPLAY_ENTITLEMENTS = {
  'driving-task': 'com.apple.developer.carplay-driving-task',
};

function voiceEnabled() {
  if (process.env.EXPO_PUBLIC_DISABLE_AGORA === 'true') return false;
  if (process.env.EAS_BUILD_PROFILE === 'production') {
    return process.env.ROADPING_PTT_IN_PRODUCTION === 'true';
  }
  return true;
}

function carPlayEntitlement() {
  const raw = (process.env.ROADPING_CARPLAY_ENTITLEMENT || '').trim();
  if (!raw) return null;
  const key = CARPLAY_ENTITLEMENTS[raw];
  if (!key) {
    throw new Error(
      `ROADPING_CARPLAY_ENTITLEMENT="${raw}" is not supported. Use one of: ${Object.keys(CARPLAY_ENTITLEMENTS).join(', ')}`,
    );
  }
  if (process.env.EAS_BUILD_PROFILE === 'production') {
    throw new Error(
      'The CarPlay app scaffold is for entitlement development only and must not be in a production build.',
    );
  }
  return key;
}

function addBackgroundMode(plist, mode) {
  const modes = Array.isArray(plist.UIBackgroundModes) ? plist.UIBackgroundModes : [];
  if (!modes.includes(mode)) modes.push(mode);
  plist.UIBackgroundModes = modes;
}

const withRoadPingNative = (config) => {
  const voice = voiceEnabled();
  const carPlay = carPlayEntitlement();

  config = withInfoPlist(config, (cfg) => {
    const plist = cfg.modResults;
    addBackgroundMode(plist, 'location');
    if (voice) addBackgroundMode(plist, 'push-to-talk');
    plist.NSSupportsLiveActivities = true;

    if (carPlay) {
      plist.UIApplicationSceneManifest = {
        UIApplicationSupportsMultipleScenes: true,
        UISceneConfigurations: {
          UIWindowSceneSessionRoleApplication: [
            {
              UISceneClassName: 'UIWindowScene',
              UISceneConfigurationName: 'Phone',
              UISceneDelegateClassName: 'RoadPingPhoneSceneDelegate',
            },
          ],
          CPTemplateApplicationSceneSessionRoleApplication: [
            {
              UISceneClassName: 'CPTemplateApplicationScene',
              UISceneConfigurationName: 'CarPlay',
              UISceneDelegateClassName: 'RoadPingCarPlaySceneDelegate',
            },
          ],
        },
      };
    }
    return cfg;
  });

  config = withEntitlementsPlist(config, (cfg) => {
    const ent = cfg.modResults;
    if (voice) {
      ent['com.apple.developer.push-to-talk'] = true;
      if (!ent['aps-environment']) ent['aps-environment'] = 'development';
    }
    if (carPlay) ent[carPlay] = true;
    return cfg;
  });

  return config;
};

module.exports = withRoadPingNative;
module.exports.voiceEnabled = voiceEnabled;
module.exports.carPlayEntitlement = carPlayEntitlement;
