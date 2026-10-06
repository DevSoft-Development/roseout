import Foundation
import Network
import React

@objc(ThePosHavenHardware)
final class ThePosHavenHardware: NSObject, RCTBridgeModule {
  static func moduleName() -> String! {
    "ThePosHavenHardware"
  }

  static func requiresMainQueueSetup() -> Bool {
    false
  }

  private var discoverySessions: [UUID: PosBonjourDiscoverySession] = [:]
  private var connections: [UUID: NWConnection] = [:]
  private let stateQueue = DispatchQueue(label: "com.theposhaven.hardware.state")

  @objc(scanLocalDevices:resolver:rejecter:)
  func scanLocalDevices(
    _ timeoutMs: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let timeout = max(0.5, timeoutMs.doubleValue / 1000.0)
    let sessionId = UUID()

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }

      let session = PosBonjourDiscoverySession(
        timeout: timeout,
        completion: { [weak self] devices in
          self?.stateQueue.async {
            self?.discoverySessions.removeValue(forKey: sessionId)
          }
          resolve(devices)
        }
      )

      self.stateQueue.async {
        self.discoverySessions[sessionId] = session
      }
      session.start()
    }
  }

  @objc(sendTcp:port:bytes:resolver:rejecter:)
  func sendTcp(
    _ host: String,
    port: NSNumber,
    bytes: [NSNumber],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let normalizedHost = host.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedHost.isEmpty else {
      reject("missing_printer_host", "Printer host is required.", nil)
      return
    }

    let rawPort = port.intValue
    guard rawPort > 0, rawPort <= 65535, let nwPort = NWEndpoint.Port(rawValue: UInt16(rawPort)) else {
      reject("invalid_printer_port", "Printer port is invalid.", nil)
      return
    }

    let payload = Data(bytes.map { UInt8(truncating: $0) })
    let connectionId = UUID()
    let connection = NWConnection(
      host: NWEndpoint.Host(normalizedHost),
      port: nwPort,
      using: .tcp
    )

    stateQueue.async {
      self.connections[connectionId] = connection
    }

    var completed = false
    let finish: (Error?) -> Void = { [weak self] error in
      guard !completed else { return }
      completed = true
      connection.cancel()

      self?.stateQueue.async {
        self?.connections.removeValue(forKey: connectionId)
      }

      if let error {
        reject("pos_tcp_send_failed", error.localizedDescription, error)
      } else {
        resolve(nil)
      }
    }

    connection.stateUpdateHandler = { state in
      switch state {
      case .ready:
        connection.send(
          content: payload,
          completion: .contentProcessed { error in
            finish(error)
          }
        )
      case .failed(let error):
        finish(error)
      case .cancelled:
        if !completed {
          finish(NSError(
            domain: "ThePosHavenHardware",
            code: -1,
            userInfo: [NSLocalizedDescriptionKey: "TCP connection cancelled before send completed."]
          ))
        }
      default:
        break
      }
    }

    connection.start(queue: DispatchQueue(label: "com.theposhaven.hardware.tcp"))
  }
}

private final class PosBonjourDiscoverySession: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
  private let timeout: TimeInterval
  private let completion: ([[String: Any]]) -> Void
  private var browsers: [NetServiceBrowser] = []
  private var services: [NetService] = []
  private var results: [String: [String: Any]] = [:]
  private var completed = false

  private let serviceTypes = [
    "_pdl-datastream._tcp.",
    "_printer._tcp.",
    "_ipp._tcp."
  ]

  init(timeout: TimeInterval, completion: @escaping ([[String: Any]]) -> Void) {
    self.timeout = timeout
    self.completion = completion
    super.init()
  }

  func start() {
    for type in serviceTypes {
      let browser = NetServiceBrowser()
      browser.delegate = self
      browsers.append(browser)
      browser.searchForServices(ofType: type, inDomain: "local.")
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { [weak self] in
      self?.finish()
    }
  }

  private func finish() {
    guard !completed else { return }
    completed = true

    browsers.forEach { $0.stop() }
    services.forEach { $0.stop() }

    let ordered = results.values.sorted {
      String(describing: $0["networkIdentifiers"] ?? "") <
      String(describing: $1["networkIdentifiers"] ?? "")
    }
    completion(ordered)
  }

  func netServiceBrowser(
    _ browser: NetServiceBrowser,
    didFind service: NetService,
    moreComing: Bool
  ) {
    guard !completed else { return }

    service.delegate = self
    services.append(service)
    service.resolve(withTimeout: min(timeout, 5.0))
  }

  func netServiceDidResolveAddress(_ sender: NetService) {
    guard !completed else { return }
    guard let host = firstNumericHost(from: sender.addresses) else { return }

    let serviceType = sender.type.hasSuffix(".")
      ? String(sender.type.dropLast())
      : sender.type
    let identity = "bonjour:\(sender.name):\(serviceType)"

    results[identity] = [
      "host": host,
      "port": sender.port > 0 ? sender.port : 9100,
      "vendor": NSNull(),
      "model": NSNull(),
      "serialNumber": NSNull(),
      "provider": "bonjour",
      "providerDeviceId": sender.name,
      "networkIdentifiers": [identity],
      "serviceTypes": [serviceType],
    ]
  }

  private func firstNumericHost(from addresses: [Data]?) -> String? {
    guard let addresses else { return nil }

    for addressData in addresses {
      let host = addressData.withUnsafeBytes { rawBuffer -> String? in
        guard let baseAddress = rawBuffer.baseAddress else { return nil }
        let sockaddrPointer = baseAddress.assumingMemoryBound(to: sockaddr.self)

        var hostBuffer = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        let result = getnameinfo(
          sockaddrPointer,
          socklen_t(addressData.count),
          &hostBuffer,
          socklen_t(hostBuffer.count),
          nil,
          0,
          NI_NUMERICHOST
        )

        guard result == 0 else { return nil }
        return String(cString: hostBuffer)
      }

      if let host, !host.isEmpty {
        return host
      }
    }

    return nil
  }
}
