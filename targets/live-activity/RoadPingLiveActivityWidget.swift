import ActivityKit
import SwiftUI
import WidgetKit

/// RoadPing's only Live Activity: shows that you are live, whether you are
/// talking or hearing someone, and how long you have been live.
///
///  - No buttons or toggles: they would not act in CarPlay, and stopping live
///    stays a deliberate in-app action. Tapping opens the Drive screen.
///  - No location, distance or nearby list is ever shown here.
///  - When the app stops refreshing it (staleDate passed), it says so instead
///    of claiming you are live.
///  - CarPlay and the Smart Stack use the .small family.
struct RoadPingLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RoadPingActivityAttributes.self) { context in
      RoadPingActivityView(state: context.state, startedAt: context.attributes.startedAt, isStale: context.isStale)
        .widgetURL(URL(string: "roadping://drive"))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label {
            Text(RoadPingCopy.badge(context.state, isStale: context.isStale))
          } icon: {
            Image(systemName: RoadPingCopy.symbol(context.state, isStale: context.isStale))
          }
          .font(.headline)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(context.attributes.startedAt, style: .timer)
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
            .frame(maxWidth: 72)
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text(RoadPingCopy.detail(context.state, isStale: context.isStale))
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      } compactLeading: {
        Image(systemName: RoadPingCopy.symbol(context.state, isStale: context.isStale))
      } compactTrailing: {
        Text(context.attributes.startedAt, style: .timer)
          .monospacedDigit()
          .frame(maxWidth: 48)
      } minimal: {
        Image(systemName: RoadPingCopy.symbol(context.state, isStale: context.isStale))
      }
      .widgetURL(URL(string: "roadping://drive"))
    }
    .supplementalActivityFamilies([.small])
  }
}

struct RoadPingActivityView: View {
  let state: RoadPingActivityAttributes.ContentState
  let startedAt: Date
  let isStale: Bool
  @Environment(\.activityFamily) private var family

  var body: some View {
    switch family {
    case .small:
      // CarPlay and Apple Watch Smart Stack.
      HStack(spacing: 8) {
        Image(systemName: RoadPingCopy.symbol(state, isStale: isStale))
        VStack(alignment: .leading, spacing: 2) {
          Text(RoadPingCopy.badge(state, isStale: isStale)).font(.headline).lineLimit(1)
          Text(RoadPingCopy.detail(state, isStale: isStale)).font(.caption).lineLimit(1)
        }
      }
      .padding(8)
    default:
      HStack(spacing: 12) {
        Image(systemName: RoadPingCopy.symbol(state, isStale: isStale))
          .font(.title2)
        VStack(alignment: .leading, spacing: 2) {
          Text(RoadPingCopy.badge(state, isStale: isStale)).font(.headline)
          Text(RoadPingCopy.detail(state, isStale: isStale))
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        Spacer()
        Text(startedAt, style: .timer)
          .monospacedDigit()
          .multilineTextAlignment(.trailing)
          .frame(maxWidth: 80)
      }
      .padding()
    }
  }
}

enum RoadPingCopy {
  static func symbol(_ s: RoadPingActivityAttributes.ContentState, isStale: Bool) -> String {
    if isStale { return "exclamationmark.circle" }
    switch s.status {
    case "talking": return "mic.fill"
    case "receiving": return "speaker.wave.2.fill"
    case "reconnecting": return "arrow.triangle.2.circlepath"
    case "voice_off": return "speaker.slash"
    default: return "dot.radiowaves.left.and.right"
    }
  }

  static func badge(_ s: RoadPingActivityAttributes.ContentState, isStale: Bool) -> String {
    if isStale { return "RoadPing" }
    switch s.status {
    case "talking": return "Talking"
    case "receiving": return s.speakerName ?? "Incoming"
    case "reconnecting": return "Reconnecting"
    default: return "Live"
    }
  }

  static func detail(_ s: RoadPingActivityAttributes.ContentState, isStale: Bool) -> String {
    if isStale { return "Not updating. Open RoadPing." }
    switch s.status {
    case "talking": return "On \(s.contextName)"
    case "receiving": return "On \(s.contextName)"
    case "reconnecting": return "Voice paused while reconnecting"
    case "voice_off": return "\(s.contextName) · voice off"
    default: return s.doNotDisturb ? "\(s.contextName) · Do Not Disturb" : s.contextName
    }
  }
}
