import ExpoModulesCore
import UIKit

/// Runs at launch, before JavaScript:
///  - creates the PushToTalk channel manager as early as possible, as Apple
///    requires for channel restoration and push delivery (any restored
///    channel is then left: a cold launch never resumes a live session);
///  - ends any RoadPing Live Activity a previous process left behind.
public class RoadPingAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let ended = RoadPingLiveActivity.shared.endAll()
    if ended > 0 {
      RoadPingEvents.shared.emit("liveActivityEndedAtLaunch", ["count": ended])
    }
    RoadPingPTT.shared.bootstrap()
    return true
  }
}
