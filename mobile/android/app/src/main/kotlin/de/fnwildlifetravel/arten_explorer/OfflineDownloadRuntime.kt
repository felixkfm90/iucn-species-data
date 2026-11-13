package de.fnwildlifetravel.arten_explorer

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import io.flutter.FlutterInjector
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.engine.dart.DartExecutor
import io.flutter.plugin.common.MethodChannel

/** All entry points execute on Android's main thread; exactly one service owns one headless engine. */
internal object OfflineDownloadRuntime {
    private val handler = Handler(Looper.getMainLooper())
    private class Session(val context: Context, val jobId: String, val owner: Any,
        val changed: (OfflineDownloadState) -> Unit, val ended: (String) -> Unit) {
        var engine: FlutterEngine? = null
        var channel: MethodChannel? = null
        var networkCallback: ConnectivityManager.NetworkCallback? = null
        var stopping = false
        var progressObserved = false
        var watchdog: Runnable? = null
    }
    private var session: Session? = null
    fun active(id: String? = null): Boolean = session?.let { id == null || id == it.jobId } == true

    fun start(context: Context, id: String, owner: Any, changed: (OfflineDownloadState) -> Unit, ended: (String) -> Unit): Boolean {
        check(Looper.myLooper() == Looper.getMainLooper())
        if (session != null) return false
        val state = OfflineDownloads.read(context) ?: return false
        if (state.jobId != id || state.status in TERMINAL_DOWNLOAD_STATES || OfflineDownloads.stoppedByUser(context, state)) return false
        val current = Session(context.applicationContext, id, owner, changed, ended)
        session = current
        try {
            OfflineDownloads.requirePlan(context, id)
            if (!OfflineDownloads.networkAllowed(context, state)) {
                stop(id, "paused")
                return true
            }
            val running = state.copy(status = "running", completeFiles = 0, totalFiles = 0, receivedBytes = 0,
                message = "Vorhandene Dateien werden geprüft …")
            OfflineDownloads.save(context, running)
            changed(running)
            val loader = FlutterInjector.instance().flutterLoader()
            loader.startInitialization(context.applicationContext)
            loader.ensureInitializationComplete(context.applicationContext, null)
            val engine = FlutterEngine(context.applicationContext)
            current.engine = engine
            val channel = MethodChannel(engine.dartExecutor.binaryMessenger, OFFLINE_CHANNEL)
            current.channel = channel
            channel.setMethodCallHandler { call, result ->
                if (session !== current || current.stopping) {
                    if (call.method == "isCancelled") result.success(true)
                    else result.error("worker_stopped", "Der Download wurde beendet.", null)
                } else try {
                    val saved = OfflineDownloads.read(context)
                    if (saved?.jobId != id || saved.status in TERMINAL_DOWNLOAD_STATES) {
                        if (call.method == "isCancelled") result.success(true)
                        else result.error("worker_stopped", "Der Download wurde beendet.", null)
                        handler.post { stop(id, "cancelled") }
                    } else when (call.method) {
                        "context" -> {
                            touch(current)
                            result.success(mapOf("jobId" to id, "supportDirectory" to OfflineDownloads.supportDirectory(context)))
                        }
                        "network" -> result.success(OfflineDownloads.network(context))
                        "isCancelled" -> result.success(false)
                        "acquireWriter" -> {
                            val data = OfflineDownloads.arguments(call.arguments, setOf("storeKey"))
                            result.success(NativeStoreWriters.acquire(current, data["storeKey"]))
                        }
                        "releaseWriter" -> {
                            val data = OfflineDownloads.arguments(call.arguments, setOf("lease"))
                            NativeStoreWriters.release(current, data["lease"])
                            result.success(null)
                        }
                        "progress" -> {
                            val data = OfflineDownloads.arguments(call.arguments, setOf("completeFiles", "totalFiles", "receivedBytes", "message"))
                            val complete = OfflineDownloads.integer(data["completeFiles"])!!
                            val total = OfflineDownloads.integer(data["totalFiles"])!!
                            val received = OfflineDownloads.integer(data["receivedBytes"])!!
                            if (total < complete || total > 1_000_000 || saved.totalFiles > 0 && total != saved.totalFiles
                                || current.progressObserved && (complete < saved.completeFiles || received < saved.receivedBytes)) {
                                throw OfflineDownloadException("invalid_progress", "Der Downloadfortschritt ist nicht konsistent.")
                            }
                            val message = if (total == 0L) "Vorhandene Dateien werden geprüft …"
                                else "$complete von $total fehlenden Dateien heruntergeladen."
                            val next = saved.copy(completeFiles = complete, totalFiles = total, receivedBytes = received, message = message,
                                networkRetries = if (complete > saved.completeFiles) 0 else saved.networkRetries)
                            OfflineDownloads.save(context, next)
                            current.progressObserved = true
                            changed(next)
                            touch(current)
                            result.success(null)
                        }
                        "finish" -> {
                            val data = OfflineDownloads.arguments(call.arguments, setOf("status", "message"))
                            val status = data["status"] as? String
                            if (status !in TERMINAL_DOWNLOAD_STATES && status != "retry_network" ||
                                status == "completed" && saved.completeFiles != saved.totalFiles) {
                                throw OfflineDownloadException("invalid_finish", "Der Downloadabschluss ist nicht vollständig.")
                            }
                            result.success(null)
                            handler.post {
                                if (status == "retry_network") {
                                    val retries = saved.networkRetries
                                    if (retries < 3) {
                                        try {
                                            val latest = OfflineDownloads.read(context)
                                            if (latest?.jobId == id && latest.status !in TERMINAL_DOWNLOAD_STATES) {
                                                OfflineDownloads.save(context, latest.copy(networkRetries = retries + 1))
                                            }
                                            stop(id, "paused")
                                        } catch (_: Exception) { stop(id, "failed") }
                                    } else stop(id, "failed")
                                } else stop(id, status!!)
                            }
                        }
                        else -> result.notImplemented()
                    }
                } catch (error: OfflineDownloadException) {
                    result.error(error.reason, error.message, null)
                    if (call.method !in setOf("acquireWriter", "releaseWriter")) handler.post { stop(id, "failed") }
                } catch (_: Exception) {
                    result.error("worker_state_failed", "Der Downloadstatus konnte nicht sicher verarbeitet werden.", null)
                    handler.post { stop(id, "failed") }
                }
            }
            val callback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) = checkNetwork(current)
                override fun onLost(network: Network) = checkNetwork(current)
                override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) = checkNetwork(current)
            }
            context.getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(callback, handler)
            current.networkCallback = callback
            touch(current, 45_000L)
            engine.dartExecutor.executeDartEntrypoint(DartExecutor.DartEntrypoint(loader.findAppBundlePath(),
                "package:arten_explorer/data/offline_jobs.dart", "offlineDownloadEntrypoint"))
        } catch (_: Exception) { stop(id, "failed") }
        return true
    }

    private fun touch(current: Session, timeoutMs: Long = 300_000L) {
        current.watchdog?.let(handler::removeCallbacks)
        val timeout = Runnable { if (session === current) stop(current.jobId, "failed") }
        current.watchdog = timeout
        handler.postDelayed(timeout, timeoutMs)
    }

    private fun checkNetwork(current: Session) {
        if (session !== current || current.stopping) return
        val saved = OfflineDownloads.read(current.context) ?: return
        // Dart uses the default network. Never bind the whole process to JobParameters.network.
        if (!OfflineDownloads.networkAllowed(current.context, saved)) stop(current.jobId, "paused")
    }

    /** Destroy the owned engine before releasing the writer slot or permitting rescheduling. */
    fun stop(id: String, status: String, notifyOwner: Boolean = true): Boolean {
        val current = session ?: return true
        if (current.jobId != id || current.stopping) return false
        current.stopping = true
        current.watchdog?.let(handler::removeCallbacks)
        current.networkCallback?.let { callback ->
            try { current.context.getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(callback) } catch (_: Exception) { }
        }
        try { current.channel?.invokeMethod("cancel", mapOf("jobId" to id)) } catch (_: Exception) { }
        try {
            current.channel?.setMethodCallHandler(null)
            current.engine?.destroy()
            NativeStoreWriters.releaseOwner(current)
        } catch (_: Exception) {
            // Keep the writer slot occupied if native destruction was not confirmed.
            try { OfflineDownloads.read(current.context)?.let { OfflineDownloads.save(current.context,
                it.copy(status = "failed", message = "Download konnte nicht sicher beendet werden. App neu öffnen.")) } } catch (_: Exception) { }
            return false
        }
        session = null
        var finalStatus = status
        var savedSafely = true
        try {
            val saved = OfflineDownloads.read(current.context)
            if (saved?.jobId == id) {
                finalStatus = if (saved.status in TERMINAL_DOWNLOAD_STATES) saved.status else status
                val message = when (finalStatus) {
                    "completed" -> "Offline-Download abgeschlossen."
                    "cancelled" -> "Download abgebrochen. Vorhandene Dateien bleiben erhalten."
                    "paused" -> "Download pausiert. Sobald eine erlaubte Verbindung verfügbar ist, geht es weiter."
                    else -> "Download nicht abgeschlossen. Vorhandene Dateien bleiben erhalten."
                }
                OfflineDownloads.save(current.context, saved.copy(status = finalStatus, message = message))
            }
        } catch (_: Exception) { finalStatus = "failed"; savedSafely = false }
        if (notifyOwner) {
            val outcome = finalStatus
            handler.post { current.ended(outcome) }
        }
        return savedSafely
    }

    fun stopOwner(owner: Any, status: String): Boolean = session?.takeIf { it.owner === owner }?.let { stop(it.jobId, status, false) } ?: true
}
