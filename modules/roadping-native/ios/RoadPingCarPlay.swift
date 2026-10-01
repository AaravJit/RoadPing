import Foundation
import UIKit
#if canImport(CarPlay)
import CarPlay
#endif

// Phase 3.5 CarPlay APP scaffold. NOT active in any shipping build.
//
// These classes are compiled into the app but referenced only by the scene
// manifest that plugins/withRoadPingNative.js writes when
// ROADPING_CARPLAY_ENTITLEMENT is set at prebuild. Without that manifest (every
// normal build) iOS never instantiates them and the app keeps its existing
// app-delegate window.
//
// What works WITHOUT any CarPlay entitlement (Apple CarPlay Developer Guide):
//   • The Live Activity appears in CarPlay automatically.
//   • While a PushToTalk channel is active, the car's play/pause control maps
//     to begin/end transmission (PushToTalk framework).
// What this scaffold adds once Apple grants an entitlement: a template screen
// showing live status and a Talk / Stop toggle. Untested: needs a Mac with the
// CarPlay Simulator and an entitlement-bearing provisioning profile.

/// Phone scene: moves the React Native window, which the app delegate created
/// at launch, onto the phone window scene (needed once the app declares a
/// scene manifest).
@objc(RoadPingPhoneSceneDelegate)
public final class RoadPingPhoneSceneDelegate: UIResponder, UIWindowSceneDelegate {
  public var window: UIWindow?

  public func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
      let appWindow = UIApplication.shared.delegate?.window ?? nil
    else { return }
    appWindow.windowScene = windowScene
    window = appWindow
    appWindow.makeKeyAndVisible()
  }
}

#if canImport(CarPlay)
@objc(RoadPingCarPlaySceneDelegate)
public final class RoadPingCarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  private var interfaceController: CPInterfaceController?
  private var timer: Timer?

  public func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    self.interfaceController = interfaceController
    interfaceController.setRootTemplate(makeTemplate(), animated: false, completion: nil)
    // Driving-task apps must not refresh more often than every 10 seconds.
    timer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
      guard let self = self else { return }
      self.interfaceController?.setRootTemplate(self.makeTemplate(), animated: false, completion: nil)
    }
  }

  public func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnectInterfaceController interfaceController: CPInterfaceController
  ) {
    timer?.invalidate()
    timer = nil
    self.interfaceController = nil
  }

  private func makeTemplate() -> CPListTemplate {
    let state = RoadPingPTT.shared.state()
    let joined = (state["joined"] as? Bool) ?? false
    let transmitting = (state["transmitting"] as? Bool) ?? false

    let status = CPListItem(
      text: joined ? "Live" : "Not live",
      detailText: joined ? "Use the car's play/pause or Talk below" : "Go Live on your iPhone first"
    )
    var items: [CPListItem] = [status]
    if joined {
      let talk = CPListItem(text: transmitting ? "Stop talking" : "Talk", detailText: nil)
      talk.handler = { [weak self] _, completion in
        if transmitting {
          RoadPingPTT.shared.stopTransmitting()
        } else {
          try? RoadPingPTT.shared.beginTransmitting()
        }
        completion()
        if let self = self {
          self.interfaceController?.setRootTemplate(self.makeTemplate(), animated: false, completion: nil)
        }
      }
      items.append(talk)
    }
    return CPListTemplate(title: "RoadPing", sections: [CPListSection(items: items)])
  }
}
#endif
