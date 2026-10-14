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
/// Freshness (src/services/live/locationFreshness.ts is the policy; the
/// constants below mirror it and a test checks they match):
///  - Every tick reports the real fix's timestamp, age and accuracy.
///    Coordinates are included only for a fix at most maxFixAge old and
///    within maxAccuracy; otherwise the tick says why ("stale") and the
///    heartbeat is skipped (fail closed).
///  - No new fix is NOT proof the phone is still: with a 50 m distance filter a
///    parked phone simply stops getting updates. Once the last fix is older
///    than refreshAfter (or there is none), the distance filter is dropped so
///    Core Location delivers a new fix, and restored as soon as a fresh,
///    accurate one arrives. requestLocation() is not used: Apple documents
///    that it does nothing while location services are already running.
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
  /// Normal distance filter (metres) while fixes are fresh.
  private let normalDistanceFilter: CLLocationDistance = 50
  /// A fix older than this (seconds) is never sent: FIX_MAX_AGE_MS.
  private let maxFixAge: TimeInterval = 45
  /// Past this age (seconds) a fresh fix is requested: FIX_REFRESH_AFTER_MS.
  private let refreshAfter: TimeInterval = 20
  /// Horizontal accuracy (metres) beyond which a fix is not sent: FIX_MAX_ACCURACY_M.
  private let maxAccuracy: CLLocationAccuracy = 300
  /// Tolerated fix timestamp in the future (seconds): FIX_MAX_FUTURE_MS.
  private let maxFuture: TimeInterval = 5
  /// True while the distance filter is lifted to obtain a fresh fix.
  private var refreshing = false

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
    m.distanceFilter = normalDistanceFilter
    refreshing = false
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
    refreshing = false
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
    let now = Date()
    var body: [String: Any] = ["at": now.timeIntervalSince1970 * 1000]
    guard let fix = lastFix else {
      body["stale"] = "no_fix"
      beginRefresh()
      RoadPingEvents.shared.emit("liveLocationTick", body)
      return
    }
    let age = now.timeIntervalSince(fix.timestamp)
    body["fixAt"] = fix.timestamp.timeIntervalSince1970 * 1000
    body["ageMs"] = age * 1000
    body["accuracy"] = fix.horizontalAccuracy
    if age < -maxFuture {
      body["stale"] = "future"
    } else if age > maxFixAge {
      body["stale"] = "too_old"
    } else if fix.horizontalAccuracy > maxAccuracy {
      body["stale"] = "inaccurate"
    } else {
      body["lat"] = fix.coordinate.latitude
      body["lng"] = fix.coordinate.longitude
      if fix.course >= 0 { body["heading"] = fix.course }
      if fix.speed >= 0 { body["speed"] = fix.speed }
    }
    if age > refreshAfter || fix.horizontalAccuracy > maxAccuracy {
      beginRefresh()
    }
    RoadPingEvents.shared.emit("liveLocationTick", body)
  }

  /// Lifts the distance filter so Core Location reports the current position
  /// even if the phone has not moved 50 m. Cheap: the location hardware is
  /// already running at the same desiredAccuracy; only delivery changes.
  private func beginRefresh() {
    guard running, !refreshing, let m = manager else { return }
    refreshing = true
    m.distanceFilter = kCLDistanceFilterNone
  }

  private func endRefresh() {
    guard refreshing else { return }
    refreshing = false
    manager?.distanceFilter = normalDistanceFilter
  }

  // MARK: CLLocationManagerDelegate

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard running, let fix = locations.last, fix.horizontalAccuracy >= 0 else { return }
    let first = lastFix == nil
    let wasRefreshing = refreshing
    lastFix = fix
    let age = Date().timeIntervalSince(fix.timestamp)
    let fresh = age <= refreshAfter && age >= -maxFuture && fix.horizontalAccuracy <= maxAccuracy
    if fresh { endRefresh() }
    // Report a recovered fix right away instead of waiting for the next tick.
    if first || (wasRefreshing && fresh) { tick() }
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    // locationUnknown is transient: Core Location keeps trying, and until a
    // fix arrives ticks carry no coordinates (fail closed). Denied ends live.
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
