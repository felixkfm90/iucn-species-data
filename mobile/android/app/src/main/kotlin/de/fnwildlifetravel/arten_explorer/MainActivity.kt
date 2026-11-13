package de.fnwildlifetravel.arten_explorer

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.media.audiofx.AudioEffect
import android.media.audiofx.LoudnessEnhancer
import android.net.Uri
import android.os.Build
import com.journeyapps.barcodescanner.ScanIntentResult
import com.journeyapps.barcodescanner.ScanOptions
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.net.URI

class MainActivity : FlutterActivity() {
    private companion object {
        const val PAIRING_SCAN_REQUEST = 4318
        const val PLAYBACK_BOOST_MILLIBELS = 1000
    }
    private class PendingStart(val arguments: Any?, val result: MethodChannel.Result, var permissionGranted: Boolean = false)
    private var resumed = false
    private var pendingStart: PendingStart? = null
    private var pendingScan: MethodChannel.Result? = null
    private var playbackBoost: LoudnessEnhancer? = null
    override fun onResume() { super.onResume(); resumed = true; window.decorView.post { completePendingStart() } }
    override fun onPause() { resumed = false; super.onPause() }
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) window.decorView.post { completePendingStart() }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "de.fnwildlifetravel.arten_explorer/browser")
            .setMethodCallHandler { call, result ->
                if (call.method == "open") result.success(openWebsite(call.arguments as? String))
                else result.notImplemented()
            }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "de.fnwildlifetravel.arten_explorer/pairing")
            .setMethodCallHandler { call, result ->
                if (call.method == "scan") scanPairing(result) else result.notImplemented()
            }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "de.fnwildlifetravel.arten_explorer/audio")
            .setMethodCallHandler { call, result ->
                if (call.method == "boost") {
                    setPlaybackBoost(call.arguments as? Int)
                    result.success(null)
                } else result.notImplemented()
            }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, OFFLINE_CHANNEL).setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "start" -> {
                        requireVisible()
                        if (pendingStart != null) throw OfflineDownloadException("download_busy", "Eine Downloadfreigabe ist bereits geöffnet.")
                        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                            pendingStart = PendingStart(call.arguments, result)
                            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4317)
                        } else startDownload(call.arguments, result)
                    }
                    "status" -> result.success(OfflineDownloads.status(this))
                    "network" -> result.success(OfflineDownloads.network(this))
                    "acquireWriter" -> {
                        val data = OfflineDownloads.arguments(call.arguments, setOf("storeKey"))
                        result.success(NativeStoreWriters.acquire(this, data["storeKey"]))
                    }
                    "releaseWriter" -> {
                        val data = OfflineDownloads.arguments(call.arguments, setOf("lease"))
                        NativeStoreWriters.release(this, data["lease"])
                        result.success(null)
                    }
                    "cancel" -> {
                        val data = OfflineDownloads.arguments(call.arguments, setOf("jobId"))
                        OfflineDownloads.cancel(this, OfflineDownloads.requireId(data["jobId"]))
                        result.success(null)
                    }
                    "acknowledge" -> {
                        val data = OfflineDownloads.arguments(call.arguments, setOf("jobId"))
                        OfflineDownloads.acknowledge(this, OfflineDownloads.requireId(data["jobId"]))
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            } catch (error: OfflineDownloadException) {
                if (pendingStart?.result === result) pendingStart = null
                result.error(error.reason, error.message, null)
            } catch (_: Exception) {
                if (pendingStart?.result === result) pendingStart = null
                result.error("offline_unavailable", "Der Hintergrunddownload ist momentan nicht verfügbar.", null)
            }
        }
    }

    private fun setPlaybackBoost(sessionId: Int?) {
        val previous = playbackBoost
        playbackBoost = null
        try { previous?.release() } catch (_: RuntimeException) { }
        if (sessionId == null || sessionId <= 0 || isFinishing || isDestroyed) return
        try {
            val effect = LoudnessEnhancer(sessionId)
            playbackBoost = effect
            effect.setTargetGain(PLAYBACK_BOOST_MILLIBELS)
            if (effect.setEnabled(true) != AudioEffect.SUCCESS) setPlaybackBoost(null)
        } catch (_: RuntimeException) {
            setPlaybackBoost(null)
        }
    }

    @Suppress("DEPRECATION")
    private fun scanPairing(result: MethodChannel.Result) {
        if (!resumed || isFinishing || isDestroyed || !hasWindowFocus() || pendingScan != null) {
            result.error("scan_unavailable", "Den QR-Code bitte in der geöffneten App scannen.", null)
            return
        }
        pendingScan = result
        try {
            val options = ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                .setPrompt("QR-Code vom Arten-Explorer scannen").setBeepEnabled(false)
                .setOrientationLocked(false)
            startActivityForResult(options.createScanIntent(this), PAIRING_SCAN_REQUEST)
        } catch (_: Exception) {
            pendingScan = null
            result.error("scan_unavailable", "Der QR-Scanner ist gerade nicht verfügbar. Bitte erneut versuchen.", null)
        }
    }

    @Deprecated("FlutterActivity exposes the platform activity result callback")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != PAIRING_SCAN_REQUEST) return
        val pending = pendingScan ?: return
        pendingScan = null
        val value = if (resultCode == RESULT_OK && data != null) {
            ScanIntentResult.parseActivityResult(resultCode, data).contents
        } else null
        pending.success(value?.let { if (it.length <= 1024) it else "" })
    }

    private fun openWebsite(value: String?): Boolean {
        if (value.isNullOrEmpty() || value.length > 8192 || !resumed || isFinishing || isDestroyed) return false
        val target = try { URI(value) } catch (_: java.net.URISyntaxException) { return false }
        if (target.scheme != "https" || target.host !in setOf("fnwildlifetravel.de", "www.fnwildlifetravel.de") ||
            target.port != -1 || target.rawUserInfo != null || target.rawFragment != null ||
            target.rawQuery != null || target.normalize().rawPath != target.rawPath ||
            !Regex("^/wildlife/[a-zA-Z0-9-]+/[a-zA-Z0-9-]+/?$").matches(target.rawPath ?: "")) return false
        return try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(target.toASCIIString())).addCategory(Intent.CATEGORY_BROWSABLE))
            true
        } catch (_: ActivityNotFoundException) { false }
          catch (_: SecurityException) { false }
    }

    private fun requireVisible() {
        if (!resumed || isFinishing || isDestroyed || !window.decorView.isShown || !hasWindowFocus()) {
            throw OfflineDownloadException("visible_start_required", "Den Download bitte in der geöffneten App starten.")
        }
    }
    private fun startDownload(arguments: Any?, result: MethodChannel.Result) {
        requireVisible()
        if (!OfflineDownloadNotifications.enabled(this)) {
            throw OfflineDownloadException("notifications_required", "Für den sichtbaren Download bitte Benachrichtigungen dieser App zulassen.")
        }
        OfflineDownloads.start(this, arguments)
        result.success(null)
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != 4317) return
        val pending = pendingStart ?: return
        if (grantResults.firstOrNull() != PackageManager.PERMISSION_GRANTED) {
            pendingStart = null
            pending.result.error("notifications_required", "Ohne Benachrichtigungsfreigabe wurde kein Download gestartet.", null)
            return
        }
        pending.permissionGranted = true
        window.decorView.post { completePendingStart() }
    }
    private fun completePendingStart() {
        val pending = pendingStart ?: return
        if (!pending.permissionGranted || !resumed || isFinishing || isDestroyed || !window.decorView.isShown || !hasWindowFocus()) return
        pendingStart = null
        try { startDownload(pending.arguments, pending.result) }
        catch (error: OfflineDownloadException) { pending.result.error(error.reason, error.message, null) }
        catch (_: Exception) { pending.result.error("offline_unavailable", "Der Hintergrunddownload ist momentan nicht verfügbar.", null) }
    }
    override fun shouldDestroyEngineWithHost(): Boolean = true
    override fun onDestroy() {
        setPlaybackBoost(null)
        try { pendingScan?.error("activity_closed", "Der QR-Scan wurde unterbrochen.", null) } catch (_: Exception) { }
        pendingScan = null
        try { pendingStart?.result?.error("activity_closed", "Der Downloadstart wurde unterbrochen.", null) } catch (_: Exception) { }
        pendingStart = null
        // The running service and its separate FlutterEngine outlive the UI.
        // This Activity always destroys its own UI engine before releasing any of its writer leases.
        super.onDestroy()
        NativeStoreWriters.releaseOwner(this)
    }
}
