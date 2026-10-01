import CoreLocation
import Foundation

/// Core Location while the user is manually live, including in the
/// background, with When In Use authorization only (never Always).
///
/// Apple sources (docs/PHASE3_VOICE_PTT.md → Sources):
///  - allowsBackgroundLocationUpdates lets an app with When In Use
///    authorization keep receiving updates after it moves to the background,
///    if updates were started in the foreground and UIBackgroundModes
///    contains "location"; the system shows the location indicator.
///    Setting it without that background mode is a programmer error, so it is
///    checked first.
///  - pausesLocationUpdatesAutomatically is false: for a When In Use app, a
///    paused session does not resume until the app is foregrounded again.
///  - iOS 17+: a CLBackgroundActivitySession is held while live, Apple's
///    explicit way for a When In Use app to continue a session in the
///    background.
///
/// Expo's expo-location background API is not used: it requires a TaskManager
/// task, and TaskManager re-registers tasks when iOS relaunches the app,
/// which would resume location on a cold launch. RoadPing never does that.
///
/// Nothing here stores coordinates. The last fix is kept in memory only and
/// handed to JavaScript, which sends it with the heartbeat.
final class RoadPingLiveLocation: NSObject, CLLocationManagerDelegate {
  static let shared = RoadPingLiveLocation()

  private var manager: CLLocationManager?
  private var running = false
  private var lastFix: CLLocation?
  private var timer: DispatchSourceTimer?
  private var backgroundSession: AnyObject?
  private var intervalSeconds: Double = 12
  /// A fix older than this is not sent; the heartbeat goes without a position.
  private let maxFixAge: Double = 120

  static func hasBackgroundMode() -> Bool {
    let modes = Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String] ?? []
    return modes.contains("location")
  }

  func authorization() -> String {
    let status: CLAuthorizationStatus
    if #available(iOS 14.0, *) {
      status = (manager ?? CLLocationManager()).authorizationStatus
    } else {
      status = CLLocationManager.authorizationStatus()
    }
    switch status {
    case .authorizedWhenInUse: return "when_in_use"
    case .authorizedAlways: return "always"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "not_determined"
    @unknown default: return "unknown"
    }
  }

  /// Must be called on the main thread while the app is in the foreground
  /// (the user just tapped Go Live). Returns "started", "background_unavailable"
  /// (started, but only foreground updates are possible), or a denial.
  func start(intervalSeconds: Double) -> String {
    let auth = authorization()
    guard auth == "when_in_use" || auth == "always" else { return auth }

    self.intervalSeconds = max(5, min(60, intervalSeconds))
    let m = manager ?? CLLocationManager()
    manager = m
    m.delegate = self
    m.activityType = .automotiveNavigation
    m.desiredAccuracy = kCLLocationAccuracyHundredMeters
    m.distanceFilter = 50
    m.pausesLocationUpdatesAutomatically = false

    let background = RoadPingLiveLocation.hasBackgroundMode()
    if background {
      m.allowsBackgroundLocationUpdates = true
      m.showsBackgroundLocationIndicator = true
      if #available(iOS 17.0, *) {
        if backgroundSession == nil {
          backgroundSession = CLBackgroundActivitySession()
        }
      }
    }

    running = true
    m.startUpdatingLocation()
    startTimer()
    return background ? "started" : "background_unavailable"
  }

  func stop() {
    running = false
    timer?.cancel()
    timer = nil
    if let m = manager {
      m.stopUpdatingLocation()
      if RoadPingLiveLocation.hasBackgroundMode() {
        m.allowsBackgroundLocationUpdates = false
      }
    }
    if #available(iOS 17.0, *) {
      (backgroundSession as? CLBackgroundActivitySession)?.invalidate()
    }
    backgroundSession = nil
    lastFix = nil
  }

  func isRunning() -> Bool {
    return running
  }

  private func startTimer() {
    timer?.cancel()
    let t = DispatchSource.makeTimerSource(queue: DispatchQueue.main)
    t.schedule(deadline: .now() + intervalSeconds, repeating: intervalSeconds, leeway: .seconds(1))
    t.setEventHandler { [weak self] in self?.tick() }
    t.resume()
    timer = t
  }

  /// One heartbeat opportunity. JavaScript posts the heartbeat; native only
  /// guarantees the cadence keeps going while the app is in the background.
  private func tick() {
    guard running else { return }
    var body: [String: Any] = ["at": Date().timeIntervalSince1970 * 1000]
    if let fix = lastFix, -fix.timestamp.timeIntervalSinceNow <= maxFixAge {
      body["lat"] = fix.coordinate.latitude
      body["lng"] = fix.coordinate.longitude
      body["accuracy"] = fix.horizontalAccuracy
      body["ageMs"] = -fix.timestamp.timeIntervalSinceNow * 1000
      if fix.course >= 0 { body["heading"] = fix.course }
      if fix.speed >= 0 { body["speed"] = fix.speed }
    }
    RoadPingEvents.shared.emit("liveLocationTick", body)
  }

  // MARK: CLLocationManagerDelegate

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard running, let fix = locations.last, fix.horizontalAccuracy >= 0 else { return }
    let first = lastFix == nil
    lastFix = fix
    if first { tick() }
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    if let clError = error as? CLError, clError.code == .denied {
      RoadPingEvents.shared.emit("liveLocationError", ["code": "denied"])
    }
  }

  @available(iOS 14.0, *)
  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    guard running else { return }
    let auth = authorization()
    if auth != "when_in_use" && auth != "always" {
      RoadPingEvents.shared.emit("liveLocationError", ["code": auth])
    }
  }
}
