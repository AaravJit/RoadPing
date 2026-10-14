import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// The single RoadPing Live Activity (Lock Screen, Dynamic Island, and
/// CarPlay through the widget's .small supplemental family).
///
/// Apple sources (docs/PHASE3_VOICE_PTT.md → Sources):
///  - Start only in the foreground with Activity.request; end it when the
///    live event ends, with final content.
///  - staleDate marks content outdated when the app stops updating it. RoadPing
///    refreshes it while live, so a Live Activity left by a killed process
///    turns stale within minutes instead of claiming "Live".
///  - Buttons and toggles do not act in CarPlay; this Live Activity has none.
///
/// Started only on iOS 18+, the widget extension's deployment target (the
/// CarPlay layout uses iOS 18's supplementalActivityFamilies).
final class RoadPingLiveActivity {
  static let shared = RoadPingLiveActivity()

  /// Content older than this shows as stale.
  static let staleAfter: TimeInterval = 180

  private var activityRef: AnyObject?

  static func isSupported() -> Bool {
    #if canImport(ActivityKit)
    if #available(iOS 18.0, *) {
      return ActivityAuthorizationInfo().areActivitiesEnabled
    }
    #endif
    return false
  }

  #if canImport(ActivityKit)
  @available(iOS 18.0, *)
  private static func state(_ s: [String: Any]) -> RoadPingActivityAttributes.ContentState {
    return RoadPingActivityAttributes.ContentState(
      status: (s["status"] as? String) ?? "live",
      speakerName: s["speakerName"] as? String,
      contextName: (s["contextName"] as? String) ?? "Nearby",
      doNotDisturb: (s["doNotDisturb"] as? Bool) ?? false
    )
  }
  #endif

  /// Returns false when Live Activities are unsupported or disabled.
  func start(startedAtMs: Double, state: [String: Any]) -> Bool {
    #if canImport(ActivityKit)
    guard #available(iOS 18.0, *), RoadPingLiveActivity.isSupported() else { return false }
    endAll()
    let attributes = RoadPingActivityAttributes(startedAt: Date(timeIntervalSince1970: startedAtMs / 1000))
    let content = ActivityContent(
      state: RoadPingLiveActivity.state(state),
      staleDate: Date().addingTimeInterval(RoadPingLiveActivity.staleAfter)
    )
    do {
      let activity = try Activity.request(attributes: attributes, content: content, pushType: nil)
      activityRef = activity
      return true
    } catch {
      RoadPingEvents.shared.emit("liveActivityError", ["error": String(describing: error)])
      return false
    }
    #else
    return false
    #endif
  }

  func update(state: [String: Any]) {
    #if canImport(ActivityKit)
    guard #available(iOS 18.0, *),
      let activity = activityRef as? Activity<RoadPingActivityAttributes>
    else { return }
    let content = ActivityContent(
      state: RoadPingLiveActivity.state(state),
      staleDate: Date().addingTimeInterval(RoadPingLiveActivity.staleAfter)
    )
    Task { await activity.update(content) }
    #endif
  }

  /// Ends RoadPing's Live Activity (stop, private zone, expiry, logout).
  func end(finalStatus: String) {
    #if canImport(ActivityKit)
    guard #available(iOS 18.0, *) else { return }
    let current = activityRef as? Activity<RoadPingActivityAttributes>
    activityRef = nil
    guard let activity = current else { return }
    let final = RoadPingActivityAttributes.ContentState(
      status: finalStatus, speakerName: nil, contextName: "", doNotDisturb: false)
    Task { await activity.end(ActivityContent(state: final, staleDate: nil), dismissalPolicy: .immediate) }
    #endif
  }

  /// Ends every RoadPing Live Activity, including ones a previous process
  /// left behind. Called at launch: a cold launch never resumes live.
  @discardableResult
  func endAll() -> Int {
    #if canImport(ActivityKit)
    guard #available(iOS 16.2, *) else { return 0 }
    activityRef = nil
    let all = Activity<RoadPingActivityAttributes>.activities
    for activity in all {
      Task { await activity.end(nil, dismissalPolicy: .immediate) }
    }
    return all.count
    #else
    return 0
    #endif
  }
}
