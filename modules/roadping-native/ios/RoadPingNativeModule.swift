import ExpoModulesCore

/// JavaScript bridge: modules/roadping-native/index.ts.
public class RoadPingNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RoadPingNative")

    Events(
      "pttAvailability",
      "pttJoined",
      "pttJoinFailed",
      "pttLeft",
      "pttRestoredAndLeft",
      "pttToken",
      "pttTransmitBegan",
      "pttTransmitEnded",
      "pttTransmitFailed",
      "pttAudioActivated",
      "pttAudioDeactivated",
      "pttIncoming",
      "pttRemoteExpired",
      "pttError",
      "liveLocationTick",
      "liveLocationError",
      "liveActivityError",
      "liveActivityEndedAtLaunch"
    )

    OnStartObserving {
      RoadPingEvents.shared.attach { [weak self] name, body in
        self?.sendEvent(name, body)
      }
    }

    OnStopObserving {
      RoadPingEvents.shared.detach()
    }

    // MARK: PushToTalk

    Function("pttState") { () -> [String: Any] in
      RoadPingPTT.shared.bootstrap()
      return RoadPingPTT.shared.state()
    }

    Function("apnsEnvironment") { () -> String in
      RoadPingPTT.apnsEnvironment()
    }

    AsyncFunction("pttJoin") { (name: String) in
      try RoadPingPTT.shared.join(name: name)
    }.runOnQueue(.main)

    AsyncFunction("pttLeave") {
      RoadPingPTT.shared.leave()
    }.runOnQueue(.main)

    AsyncFunction("pttBeginTransmitting") {
      try RoadPingPTT.shared.beginTransmitting()
    }.runOnQueue(.main)

    AsyncFunction("pttStopTransmitting") {
      RoadPingPTT.shared.stopTransmitting()
    }.runOnQueue(.main)

    AsyncFunction("pttSetServiceStatus") { (status: String) in
      RoadPingPTT.shared.setServiceStatus(status)
    }

    AsyncFunction("pttSetChannelName") { (name: String) in
      RoadPingPTT.shared.setChannelName(name)
    }

    AsyncFunction("pttShowRemote") { (tx: String, name: String, hardEndEpochMs: Double) in
      RoadPingPTT.shared.showRemote(tx: tx, name: name, hardEnd: Date(timeIntervalSince1970: hardEndEpochMs / 1000))
    }

    AsyncFunction("pttRemoteEnded") { (tx: String) in
      RoadPingPTT.shared.remoteEnded(tx: tx)
    }

    AsyncFunction("pttClearAllRemote") {
      RoadPingPTT.shared.clearAllRemote()
    }

    // MARK: Live location

    AsyncFunction("locationAuthorization") { () -> String in
      RoadPingLiveLocation.shared.authorization()
    }.runOnQueue(.main)

    AsyncFunction("locationStart") { (intervalSeconds: Double) -> String in
      RoadPingLiveLocation.shared.start(intervalSeconds: intervalSeconds)
    }.runOnQueue(.main)

    AsyncFunction("locationStop") {
      RoadPingLiveLocation.shared.stop()
    }.runOnQueue(.main)

    Function("locationHasBackgroundMode") { () -> Bool in
      RoadPingLiveLocation.hasBackgroundMode()
    }

    // MARK: Live Activity

    Function("liveActivitySupported") { () -> Bool in
      RoadPingLiveActivity.isSupported()
    }

    AsyncFunction("liveActivityStart") { (startedAtMs: Double, state: [String: Any]) -> Bool in
      RoadPingLiveActivity.shared.start(startedAtMs: startedAtMs, state: state)
    }.runOnQueue(.main)

    AsyncFunction("liveActivityUpdate") { (state: [String: Any]) in
      RoadPingLiveActivity.shared.update(state: state)
    }.runOnQueue(.main)

    AsyncFunction("liveActivityEnd") { (finalStatus: String) in
      RoadPingLiveActivity.shared.end(finalStatus: finalStatus)
    }.runOnQueue(.main)

    AsyncFunction("liveActivityEndAll") { () -> Int in
      RoadPingLiveActivity.shared.endAll()
    }.runOnQueue(.main)
  }
}
