// KEEP IN SYNC with modules/roadping-native/ios/RoadPingActivityAttributes.swift.
// ActivityKit matches the app's and the widget's attributes by type, so both
// copies must be identical; scripts/client-test/liveActivity.test.mjs checks.
#if canImport(ActivityKit)
import ActivityKit
import Foundation

@available(iOS 16.1, *)
public struct RoadPingActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// live | talking | receiving | reconnecting | voice_off
    public var status: String
    /// Remote speaker's display name while receiving; nil otherwise.
    public var speakerName: String?
    /// "Nearby" or the room name.
    public var contextName: String
    /// Whether incoming voice is muted by Do Not Disturb.
    public var doNotDisturb: Bool

    public init(status: String, speakerName: String?, contextName: String, doNotDisturb: Bool) {
      self.status = status
      self.speakerName = speakerName
      self.contextName = contextName
      self.doNotDisturb = doNotDisturb
    }
  }

  /// When the live session started (drives the elapsed timer).
  public var startedAt: Date

  public init(startedAt: Date) {
    self.startedAt = startedAt
  }
}
#endif
