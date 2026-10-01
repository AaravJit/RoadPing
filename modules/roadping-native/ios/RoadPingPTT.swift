import AVFoundation
import Foundation
#if canImport(PushToTalk)
import PushToTalk
#endif

/// Apple PushToTalk channel for one live session.
///
/// Apple guidance this follows (docs/PHASE3_VOICE_PTT.md → Sources):
///  - Create the channel manager as early as possible at launch so the system
///    can restore channels and deliver pushes ("Creating a Push to Talk app").
///  - A channel can be joined only in the foreground with explicit user
///    interaction: RoadPing joins when the user taps Go Live.
///  - Wait for channelManager(_:didActivate:) before recording or playing;
///    the system owns audio session activation and plays the PTT sounds.
///  - Half-duplex (the default) is used deliberately: you cannot transmit
///    while receiving. If a push arrives while transmitting, the local
///    transmission is stopped before an active remote participant is
///    returned, as Apple requires. The server never pushes to someone who is
///    transmitting, so this only happens in the race where the other press
///    began first.
///  - Wired-headset and CarPlay play/pause toggles map to begin/end
///    transmission while a channel is active; accessory button events are
///    enabled on join.
///
/// Cold launch policy: RoadPing never resumes a live session in a new process.
/// A channel the system restores (didJoinChannel with .channelRestoration, or
/// any channel this process did not request) is left immediately.
final class RoadPingPTT: NSObject {
  static let shared = RoadPingPTT()

  private let lock = NSLock()
  private var managerRef: AnyObject?
  private var bootstrapping = false
  private var availability = "initializing"
  private var requestedChannel: UUID?
  private var joinedChannel: UUID?
  private var transmitting = false
  private var restoredAndLeft = false
  private var latestToken: String?
  /// Incoming transmissions shown in the system UI: tx id → (name, hard end).
  private var incoming: [String: (name: String, end: Date)] = [:]
  private var incomingOrder: [String] = []

  private func locked<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }

  // MARK: - State for JavaScript

  func state() -> [String: Any] {
    return locked {
      var s: [String: Any] = [
        "availability": availability,
        "joined": joinedChannel != nil,
        "transmitting": transmitting,
        "restoredAndLeft": restoredAndLeft,
        "incoming": incomingOrder,
      ]
      if let token = latestToken { s["token"] = token }
      return s
    }
  }

  /// APNs environment of this build, from the embedded provisioning profile.
  /// App Store and TestFlight builds have no embedded profile: production.
  static func apnsEnvironment() -> String {
    guard
      let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
      let data = try? Data(contentsOf: url),
      let text = String(data: data, encoding: .isoLatin1),
      let keyRange = text.range(of: "<key>aps-environment</key>")
    else {
      return "production"
    }
    let after = text[keyRange.upperBound...].prefix(120)
    return after.contains("<string>development</string>") ? "development" : "production"
  }

  // MARK: - Lifecycle

  func bootstrap() {
    #if canImport(PushToTalk)
    guard #available(iOS 16.0, *) else {
      locked { availability = "unsupported" }
      return
    }
    let shouldStart: Bool = locked {
      if managerRef != nil || bootstrapping { return false }
      bootstrapping = true
      return true
    }
    guard shouldStart else { return }
    PTChannelManager.channelManager(delegate: self, restorationDelegate: self) { [weak self] manager, error in
      guard let self = self else { return }
      let status: String = self.locked {
        self.bootstrapping = false
        if let manager = manager {
          self.managerRef = manager
          self.availability = "ready"
        } else {
          self.availability = "unavailable"
        }
        return self.availability
      }
      var body: [String: Any] = ["availability": status]
      if let error = error { body["error"] = String(describing: error) }
      RoadPingEvents.shared.emit("pttAvailability", body)
    }
    #else
    locked { availability = "unsupported" }
    #endif
  }

  #if canImport(PushToTalk)
  @available(iOS 16.0, *)
  private var manager: PTChannelManager? {
    return locked { managerRef as? PTChannelManager }
  }
  #endif

  /// Joins a new channel for this live session. Foreground, user-initiated.
  func join(name: String) throws {
    #if canImport(PushToTalk)
    guard #available(iOS 16.0, *), let manager = manager else {
      throw NSError(domain: "RoadPingPTT", code: 1, userInfo: [NSLocalizedDescriptionKey: "unavailable"])
    }
    if let active = manager.activeChannelUUID, active != locked({ requestedChannel }) {
      manager.leaveChannel(channelUUID: active)
    }
    let id = UUID()
    locked { requestedChannel = id }
    configureAudioSession()
    manager.requestJoinChannel(channelUUID: id, descriptor: PTChannelDescriptor(name: name, image: nil))
    #else
    throw NSError(domain: "RoadPingPTT", code: 1, userInfo: [NSLocalizedDescriptionKey: "unsupported"])
    #endif
  }

  func leave() {
    #if canImport(PushToTalk)
    guard #available(iOS 16.0, *), let manager = manager else { return }
    let ids: [UUID] = locked {
      var all: [UUID] = []
      if let j = joinedChannel { all.append(j) }
      if let r = requestedChannel, r != joinedChannel { all.append(r) }
      requestedChannel = nil
      return all
    }
    var leaving = Set(ids)
    if let active = manager.activeChannelUUID { leaving.insert(active) }
    for id in leaving {
      manager.leaveChannel(channelUUID: id)
    }
    #endif
  }

  func setChannelName(_ name: String) {
    #if canImport(PushToTalk)
    guard #available(iOS 16.0, *), let manager = manager, let id = locked({ joinedChannel }) else { return }
    manager.setChannelDescriptor(PTChannelDescriptor(name: name, image: nil), channelUUID: id, completionHandler: nil)
    #endif
  }

  /// "ready" | "connecting" | "unavailable" shown by the system UI.
  func setServiceStatus(_ status: String) {
    #if canImport(PushToTalk)
    guard #available(iOS 16.0, *), let manager = manager, let id = locked({ joinedChannel }) else { return }
    let value: PTServiceStatus
    switch status {
    case "connecting": value = .connecting
    case "unavailable": value = .unavailable
    default: value = .ready
    }
    manager.setServiceStatus(value, channelUUID: id, completionHandler: nil)
    #endif
  }

  // MARK: - Transmission

  func beginTransmitting() throws {
    #if canImport(PushToTalk)
    guard #available(iOS 16.0, *), let manager = manager, let id = locked({ joinedChannel }) else {
      throw NSError(domain: "RoadPingPTT", code: 2, userInfo: [NSLocalizedDescriptionKey: "not_joined"])
    }
    manager.requestBeginTransmitting(channelUUID: id)
    #else
    throw NSError(domain: "RoadPingPTT", code: 2, userInfo: [NSLocalizedDescriptionKey: "unsupported"])
    #endif
  }

  func stopTransmitting() {
    #if canImport(PushToTalk)
    guard #available(iOS 16.0, *), let manager = manager, let id = locked({ joinedChannel }) else { return }
    manager.stopTransmitting(channelUUID: id)
    #endif
  }

  // MARK: - Incoming

  /// Shows (or refreshes) a remote speaker learned outside a push, such as
  /// the Realtime speaking state while the app is open.
  func showRemote(tx: String, name: String, hardEnd: Date) {
    let isNew: Bool = locked {
      let existed = incoming[tx] != nil
      incoming[tx] = (name, hardEnd)
      if !existed { incomingOrder.append(tx) }
      return !existed
    }
    if isNew { scheduleExpiry(tx: tx, at: hardEnd) }
    applyParticipant()
  }

  /// The remote press is over for this device (speaker left the Agora
  /// channel, the token was not renewed, or the hard end passed).
  func remoteEnded(tx: String) {
    let changed: Bool = locked {
      guard incoming.removeValue(forKey: tx) != nil else { return false }
      incomingOrder.removeAll { $0 == tx }
      return true
    }
    if changed { applyParticipant() }
  }

  func clearAllRemote() {
    locked {
      incoming.removeAll()
      incomingOrder.removeAll()
    }
    applyParticipant()
  }

  private func scheduleExpiry(tx: String, at end: Date) {
    let delay = max(0.5, end.timeIntervalSinceNow + 2)
    DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
      guard let self = self else { return }
      if self.locked({ self.incoming[tx] != nil }) {
        self.remoteEnded(tx: tx)
        RoadPingEvents.shared.emit("pttRemoteExpired", ["tx": tx])
      }
    }
  }

  private func applyParticipant() {
    #if canImport(PushToTalk)
    guard #available(iOS 16.0, *), let manager = manager, let id = locked({ joinedChannel }) else { return }
    let name: String? = locked {
      guard let last = incomingOrder.last else { return nil }
      return incoming[last]?.name
    }
    let participant = name.map { PTParticipant(name: $0, image: nil) }
    manager.setActiveRemoteParticipant(participant, channelUUID: id) { error in
      if let error = error {
        RoadPingEvents.shared.emit("pttError", ["op": "setActiveRemoteParticipant", "error": String(describing: error)])
      }
    }
    #endif
  }

  // MARK: - Audio session

  /// Category and mode for push-to-talk. The system activates and
  /// deactivates the session; RoadPing only configures it while inactive.
  /// .allowBluetooth routes the microphone and playback through a hands-free
  /// headset or the car's Bluetooth; CarPlay is the active route when
  /// connected; .defaultToSpeaker plays through the loudspeaker (not the
  /// earpiece) when nothing else is connected.
  func configureAudioSession() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker])
    } catch {
      RoadPingEvents.shared.emit("pttError", ["op": "setCategory", "error": String(describing: error)])
    }
  }

  static func routeDescription(_ session: AVAudioSession) -> String {
    let outputs = session.currentRoute.outputs.map { $0.portType }
    if outputs.contains(.carAudio) { return "carplay" }
    if outputs.contains(where: { [.bluetoothHFP, .bluetoothA2DP, .bluetoothLE].contains($0) }) { return "bluetooth" }
    if outputs.contains(where: { [.headphones, .usbAudio].contains($0) }) { return "wired" }
    if outputs.contains(.builtInSpeaker) { return "speaker" }
    if outputs.contains(.builtInReceiver) { return "receiver" }
    return "other"
  }
}

#if canImport(PushToTalk)
@available(iOS 16.0, *)
extension RoadPingPTT: PTChannelManagerDelegate, PTChannelRestorationDelegate {
  // Must return immediately with no network work.
  func channelDescriptor(restoredChannelUUID channelUUID: UUID) -> PTChannelDescriptor {
    return PTChannelDescriptor(name: "RoadPing", image: nil)
  }

  func channelManager(_ channelManager: PTChannelManager, didJoinChannel channelUUID: UUID, reason: PTChannelJoinReason) {
    let ours: Bool = locked { reason == .developerRequest && channelUUID == requestedChannel }
    if !ours {
      // Restored from an earlier process: never resume live on a cold launch.
      locked { restoredAndLeft = true }
      channelManager.leaveChannel(channelUUID: channelUUID)
      RoadPingEvents.shared.emit("pttRestoredAndLeft")
      return
    }
    locked { joinedChannel = channelUUID }
    channelManager.setTransmissionMode(.halfDuplex, channelUUID: channelUUID, completionHandler: nil)
    channelManager.setAccessoryButtonEventsEnabled(true, channelUUID: channelUUID, completionHandler: nil)
    channelManager.setServiceStatus(.ready, channelUUID: channelUUID, completionHandler: nil)
    RoadPingEvents.shared.emit("pttJoined")
  }

  func channelManager(_ channelManager: PTChannelManager, didLeaveChannel channelUUID: UUID, reason: PTChannelLeaveReason) {
    let wasOurs: Bool = locked {
      let ours = channelUUID == joinedChannel || channelUUID == requestedChannel
      if channelUUID == joinedChannel { joinedChannel = nil }
      if channelUUID == requestedChannel { requestedChannel = nil }
      transmitting = false
      incoming.removeAll()
      incomingOrder.removeAll()
      return ours
    }
    guard wasOurs else { return }
    let why: String
    switch reason {
    case .userRequest: why = "user"
    case .developerRequest: why = "app"
    case .systemPolicy: why = "system"
    default: why = "unknown"
    }
    RoadPingEvents.shared.emit("pttLeft", ["reason": why])
  }

  func channelManager(_ channelManager: PTChannelManager, failedToJoinChannel channelUUID: UUID, error: Error) {
    locked { if channelUUID == requestedChannel { requestedChannel = nil } }
    RoadPingEvents.shared.emit("pttJoinFailed", ["error": String(describing: error), "code": (error as NSError).code])
  }

  func channelManager(_ channelManager: PTChannelManager, failedToLeaveChannel channelUUID: UUID, error: Error) {
    RoadPingEvents.shared.emit("pttError", ["op": "leave", "error": String(describing: error)])
  }

  func channelManager(_ channelManager: PTChannelManager, receivedEphemeralPushToken pushToken: Data) {
    let hex = pushToken.map { String(format: "%02x", $0) }.joined()
    locked { latestToken = hex }
    RoadPingEvents.shared.emit("pttToken", ["token": hex, "environment": RoadPingPTT.apnsEnvironment()])
  }

  func channelManager(_ channelManager: PTChannelManager, channelUUID: UUID, didBeginTransmittingFrom source: PTChannelTransmitRequestSource) {
    locked { transmitting = true }
    let from: String
    switch source {
    case .userRequest: from = "system_ui"
    case .developerRequest: from = "app"
    case .handsfreeButton: from = "handsfree"
    default: from = "unknown"
    }
    RoadPingEvents.shared.emit("pttTransmitBegan", ["source": from])
  }

  func channelManager(_ channelManager: PTChannelManager, channelUUID: UUID, didEndTransmittingFrom source: PTChannelTransmitRequestSource) {
    locked { transmitting = false }
    let from: String
    switch source {
    case .userRequest: from = "system_ui"
    case .developerRequest: from = "app"
    case .handsfreeButton: from = "handsfree"
    default: from = "unknown"
    }
    RoadPingEvents.shared.emit("pttTransmitEnded", ["source": from])
  }

  func channelManager(_ channelManager: PTChannelManager, failedToBeginTransmittingInChannel channelUUID: UUID, error: Error) {
    locked { transmitting = false }
    RoadPingEvents.shared.emit("pttTransmitFailed", ["error": String(describing: error), "code": (error as NSError).code])
  }

  func channelManager(_ channelManager: PTChannelManager, failedToStopTransmittingInChannel channelUUID: UUID, error: Error) {
    RoadPingEvents.shared.emit("pttError", ["op": "stopTransmitting", "error": String(describing: error)])
  }

  func channelManager(_ channelManager: PTChannelManager, didActivate audioSession: AVAudioSession) {
    RoadPingEvents.shared.emit("pttAudioActivated", ["route": RoadPingPTT.routeDescription(audioSession)])
  }

  func channelManager(_ channelManager: PTChannelManager, didDeactivate audioSession: AVAudioSession) {
    RoadPingEvents.shared.emit("pttAudioDeactivated")
  }

  func incomingPushResult(channelManager: PTChannelManager, channelUUID: UUID, pushPayload: [String: Any]) -> PTPushResult {
    let rp = pushPayload["rp"] as? [String: Any]
    let tx = rp?["tx"] as? String
    let rawName = (rp?["name"] as? String) ?? "Driver"
    let name = String(rawName.prefix(40))
    let endEpoch = (rp?["end"] as? NSNumber)?.doubleValue ?? (Date().timeIntervalSince1970 + 70)

    // Half-duplex: Apple requires stopping a local transmission before an
    // active remote participant is returned.
    if locked({ transmitting }) {
      channelManager.stopTransmitting(channelUUID: channelUUID)
    }

    if let tx = tx {
      let end = Date(timeIntervalSince1970: endEpoch)
      let isNew: Bool = locked {
        let existed = incoming[tx] != nil
        incoming[tx] = (name, end)
        if !existed { incomingOrder.append(tx) }
        return !existed
      }
      if isNew { scheduleExpiry(tx: tx, at: end) }
      if let rp = rp { RoadPingEvents.shared.emit("pttIncoming", rp) }
    }
    return .activeRemoteParticipant(PTParticipant(name: name, image: nil))
  }
}
#endif
