import Foundation

/// Hands native events to the Expo module. Events raised before JavaScript
/// is listening (for example a PushToTalk callback during launch) are kept,
/// up to a small bound, and delivered when the module starts observing.
final class RoadPingEvents {
  static let shared = RoadPingEvents()

  private let lock = NSLock()
  private var sink: ((String, [String: Any]) -> Void)?
  private var pending: [(String, [String: Any])] = []

  func attach(_ newSink: @escaping (String, [String: Any]) -> Void) {
    lock.lock()
    sink = newSink
    let queued = pending
    pending = []
    lock.unlock()
    for (name, body) in queued {
      newSink(name, body)
    }
  }

  func detach() {
    lock.lock()
    sink = nil
    lock.unlock()
  }

  func emit(_ name: String, _ body: [String: Any] = [:]) {
    lock.lock()
    if let current = sink {
      lock.unlock()
      current(name, body)
      return
    }
    if pending.count < 64 {
      pending.append((name, body))
    }
    lock.unlock()
  }
}
