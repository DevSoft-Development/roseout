package com.theposhaven.hardware

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class ThePosHavenHardwareModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val ioExecutor = Executors.newCachedThreadPool()
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun getName(): String = "ThePosHavenHardware"

  @ReactMethod
  fun scanLocalDevices(timeoutMs: Double, promise: Promise) {
    val timeout = timeoutMs.toLong().coerceIn(500L, 15_000L)
    val nsdManager = reactContext.getSystemService(Context.NSD_SERVICE) as NsdManager
    val wifiManager = reactContext.applicationContext
      .getSystemService(Context.WIFI_SERVICE) as WifiManager
    val multicastLock = wifiManager.createMulticastLock("ThePOSHavenNsd").apply {
      setReferenceCounted(false)
      acquire()
    }

    val completed = AtomicBoolean(false)
    val results = ConcurrentHashMap<String, NsdServiceInfo>()
    val listeners = mutableListOf<NsdManager.DiscoveryListener>()
    val serviceTypes = listOf(
      "_pdl-datastream._tcp.",
      "_printer._tcp.",
      "_ipp._tcp.",
    )

    fun finish() {
      if (!completed.compareAndSet(false, true)) return

      listeners.forEach { listener ->
        runCatching { nsdManager.stopServiceDiscovery(listener) }
      }
      if (multicastLock.isHeld) {
        runCatching { multicastLock.release() }
      }

      val array = Arguments.createArray()
      results.values
        .sortedBy { "${it.serviceName}:${it.serviceType}" }
        .forEach { service ->
          val host = service.host?.hostAddress ?: return@forEach
          val map = Arguments.createMap()
          map.putString("host", host)
          map.putInt("port", if (service.port > 0) service.port else 9100)
          map.putNull("vendor")
          map.putNull("model")
          map.putNull("serialNumber")
          map.putString("provider", "android_nsd")
          map.putString("providerDeviceId", service.serviceName)

          val identity = "nsd:${service.serviceName}:${service.serviceType.removeSuffix(".")}"
          val ids = Arguments.createArray()
          ids.pushString(identity)
          map.putArray("networkIdentifiers", ids)

          val types = Arguments.createArray()
          types.pushString(service.serviceType.removeSuffix("."))
          map.putArray("serviceTypes", types)

          array.pushMap(map)
        }

      promise.resolve(array)
    }

    for (serviceType in serviceTypes) {
      lateinit var listener: NsdManager.DiscoveryListener
      listener = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(regType: String) = Unit
        override fun onDiscoveryStopped(serviceType: String) = Unit

        override fun onServiceFound(service: NsdServiceInfo) {
          if (completed.get()) return

          nsdManager.resolveService(
            service,
            object : NsdManager.ResolveListener {
              override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) = Unit

              override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                if (completed.get()) return
                val key = "${serviceInfo.serviceName}:${serviceInfo.serviceType}"
                results[key] = serviceInfo
              }
            },
          )
        }

        override fun onServiceLost(service: NsdServiceInfo) {
          val key = "${service.serviceName}:${service.serviceType}"
          results.remove(key)
        }

        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
          runCatching { nsdManager.stopServiceDiscovery(this) }
        }

        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) = Unit
      }

      listeners += listener
      nsdManager.discoverServices(
        serviceType,
        NsdManager.PROTOCOL_DNS_SD,
        listener,
      )
    }

    mainHandler.postDelayed({ finish() }, timeout)
  }

  @ReactMethod
  fun sendTcp(host: String, port: Double, bytes: ReadableArray, promise: Promise) {
    val normalizedHost = host.trim()
    if (normalizedHost.isEmpty()) {
      promise.reject("missing_printer_host", "Printer host is required.")
      return
    }

    val normalizedPort = port.toInt()
    if (normalizedPort !in 1..65535) {
      promise.reject("invalid_printer_port", "Printer port is invalid.")
      return
    }

    val payload = ByteArray(bytes.size()) { index ->
      (bytes.getInt(index) and 0xFF).toByte()
    }

    ioExecutor.execute {
      runCatching {
        Socket().use { socket ->
          socket.connect(
            InetSocketAddress(normalizedHost, normalizedPort),
            5_000,
          )
          socket.getOutputStream().use { output ->
            output.write(payload)
            output.flush()
          }
        }
      }.onSuccess {
        promise.resolve(null)
      }.onFailure { error ->
        promise.reject(
          "pos_tcp_send_failed",
          error.message ?: "TCP send failed.",
          error,
        )
      }
    }
  }
}
