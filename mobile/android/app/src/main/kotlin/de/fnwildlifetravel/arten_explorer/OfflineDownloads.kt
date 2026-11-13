package de.fnwildlifetravel.arten_explorer

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.PersistableBundle
import android.system.Os
import android.system.OsConstants
import io.flutter.util.PathUtils
import org.json.JSONObject
import java.io.File

internal const val OFFLINE_CHANNEL = "de.fnwildlifetravel.arten_explorer/offline_download"
internal const val OFFLINE_JOB_NUMBER = 431701
internal const val OFFLINE_NOTIFICATION_NUMBER = 431702
internal const val OFFLINE_CANCEL = "de.fnwildlifetravel.arten_explorer.CANCEL_OFFLINE_DOWNLOAD"
internal val OFFLINE_ID = Regex("^[a-f0-9]{32}$")
internal val TERMINAL_DOWNLOAD_STATES = setOf("completed", "failed", "cancelled")

internal data class OfflineDownloadState(
    val jobId: String,
    val status: String,
    val allowMetered: Boolean,
    val estimatedBytes: Long?,
    val requestedAt: Long,
    val completeFiles: Long = 0,
    val totalFiles: Long = 0,
    val receivedBytes: Long = 0,
    val message: String = "Download wartet auf eine geeignete Verbindung.",
    val automatic: Boolean = false,
    val networkRetries: Int = 0,
) {
    fun publicStatus(): Map<String, Any> = mapOf("jobId" to jobId, "status" to status,
        "completeFiles" to completeFiles, "totalFiles" to totalFiles, "receivedBytes" to receivedBytes, "message" to message,
        "allowMetered" to allowMetered, "automatic" to automatic)
    fun json(): String = JSONObject(publicStatus()).put("networkRetries", networkRetries)
        .put("estimatedBytes", estimatedBytes ?: JSONObject.NULL).put("requestedAt", requestedAt).toString()
}

/** One persistent status record. Plans and file contents are exclusively owned by Dart. */
internal object OfflineDownloads {
    private const val PREFS = "fn_offline_download_v1"
    private const val KEY = "current"
    private val statuses = setOf("queued", "running", "paused", "completed", "failed", "cancelled")

    @Synchronized fun read(context: Context): OfflineDownloadState? {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return null
        try {
            val value = JSONObject(raw)
            val state = OfflineDownloadState(value.getString("jobId"), value.getString("status"), value.getBoolean("allowMetered"),
                if (value.isNull("estimatedBytes")) null else value.getLong("estimatedBytes"), value.getLong("requestedAt"),
                value.getLong("completeFiles"), value.getLong("totalFiles"), value.getLong("receivedBytes"), value.getString("message"),
                value.optBoolean("automatic"), value.optInt("networkRetries"))
            check(OFFLINE_ID.matches(state.jobId) && state.status in statuses && state.completeFiles >= 0 && state.totalFiles >= state.completeFiles
                && state.receivedBytes >= 0 && state.requestedAt > 0 && state.message.length <= 240 && state.networkRetries in 0..3)
            return state
        } catch (_: Exception) {
            throw OfflineDownloadException("invalid_native_status", "Der gespeicherte Downloadstatus muss geprüft werden.")
        }
    }

    @Synchronized fun save(context: Context, state: OfflineDownloadState) {
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, state.json()).commit()) {
            throw OfflineDownloadException("status_not_saved", "Der Downloadstatus konnte nicht sicher gespeichert werden.")
        }
    }

    fun requireId(value: Any?): String = (value as? String)?.takeIf(OFFLINE_ID::matches)
        ?: throw OfflineDownloadException("invalid_job", "Die Downloadkennung ist ungültig.")

    fun arguments(value: Any?, allowed: Set<String>): Map<*, *> {
        val data = value as? Map<*, *> ?: throw OfflineDownloadException("invalid_arguments", "Der Downloadauftrag ist ungültig.")
        if (data.keys.any { it !is String || it !in allowed }) throw OfflineDownloadException("invalid_arguments", "Der Downloadauftrag enthält unbekannte Angaben.")
        return data
    }

    fun integer(value: Any?, optional: Boolean = false): Long? {
        if (value == null && optional) return null
        val number = when (value) { is Int -> value.toLong(); is Long -> value; else -> -1L }
        if (number < 0 || number > 9_007_199_254_740_991L) throw OfflineDownloadException("invalid_progress", "Die Downloadgröße ist ungültig.")
        return number
    }

    fun supportDirectory(context: Context): String = PathUtils.getFilesDir(context)

    fun requirePlan(context: Context, jobId: String) {
        requireId(jobId)
        val support = File(supportDirectory(context))
        val directory = File(support, "offline-jobs")
        val plan = File(directory, "$jobId.json")
        try {
            // lstat checks the actual entry, not a symlink target. No alternate caller-supplied paths.
            // Android may expose the same sandbox through /data/data and /data/user/0 aliases.
            val canonicalSupport = support.canonicalFile
            if (!OsConstants.S_ISDIR(Os.lstat(support.path).st_mode) || !OsConstants.S_ISDIR(Os.lstat(directory.path).st_mode)
                || directory.canonicalFile != File(canonicalSupport, "offline-jobs")
                || !OsConstants.S_ISREG(Os.lstat(plan.path).st_mode)
                || plan.canonicalFile != File(directory.canonicalFile, "$jobId.json") || plan.length() <= 0) throw IllegalStateException()
        } catch (_: Exception) { throw OfflineDownloadException("plan_missing", "Der gespeicherte Downloadauftrag fehlt oder ist nicht sicher lesbar.") }
    }

    fun network(context: Context): Map<String, Boolean> {
        val manager = context.getSystemService(ConnectivityManager::class.java)
        val capabilities = manager.getNetworkCapabilities(manager.activeNetwork)
        return mapOf("metered" to (manager.isActiveNetworkMetered ||
            capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true),
            "connected" to (capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)))
    }

    fun networkAllowed(context: Context, state: OfflineDownloadState): Boolean {
        val network = network(context)
        return network["connected"] == true && (state.allowMetered || network["metered"] == false)
    }

    fun stoppedByUser(context: Context, state: OfflineDownloadState): Boolean {
        if (Build.VERSION.SDK_INT < 30) return false
        return context.getSystemService(ActivityManager::class.java).getHistoricalProcessExitReasons(context.packageName, 0, 5)
            .any { it.timestamp >= state.requestedAt && it.reason == ApplicationExitInfo.REASON_USER_REQUESTED }
    }

    @Synchronized fun status(context: Context): Map<String, Any>? {
        var state = read(context) ?: return null
        val scheduler = context.getSystemService(JobScheduler::class.java)
        var scheduled = scheduler.getPendingJob(OFFLINE_JOB_NUMBER)?.extras?.getString("jobId") == state.jobId
        if (state.status !in TERMINAL_DOWNLOAD_STATES && !OfflineDownloadRuntime.active(state.jobId)) {
            if (stoppedByUser(context, state)) {
                scheduler.cancel(OFFLINE_JOB_NUMBER)
                scheduled = false
                state = state.copy(status = "cancelled", message = "Download durch die Systembedienung beendet.")
                save(context, state)
            } else if (!scheduled && state.status == "running") {
                state = state.copy(status = "paused", message = "Download unterbrochen. In der App bewusst fortsetzen.")
                save(context, state)
            }
        }
        return state.publicStatus() + ("scheduled" to scheduled)
    }

    fun schedule(context: Context, state: OfflineDownloadState, userInitiated: Boolean) {
        val extras = PersistableBundle().apply { putString("jobId", state.jobId) }
        val builder = JobInfo.Builder(OFFLINE_JOB_NUMBER, ComponentName(context, OfflineDownloadJobService::class.java))
            .setExtras(extras)
        if (!state.allowMetered && Build.VERSION.SDK_INT >= 28) {
            builder.setRequiredNetwork(NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
                .build())
        } else {
            builder.setRequiredNetworkType(if (state.allowMetered) JobInfo.NETWORK_TYPE_ANY else JobInfo.NETWORK_TYPE_UNMETERED)
        }
        if (Build.VERSION.SDK_INT >= 34 && userInitiated) builder.setUserInitiated(true)
        if (Build.VERSION.SDK_INT >= 28) state.estimatedBytes?.let { builder.setEstimatedNetworkBytes(it, 0) }
        if (context.getSystemService(JobScheduler::class.java).schedule(builder.build()) != JobScheduler.RESULT_SUCCESS) {
            throw IllegalStateException("Could not schedule offline download")
        }
    }

    @Synchronized fun start(context: Context, values: Any?): Map<String, Any> {
        val data = arguments(values, setOf("jobId", "allowMetered", "estimatedBytes", "automatic"))
        val id = requireId(data["jobId"])
        val allowMetered = data["allowMetered"] as? Boolean
            ?: throw OfflineDownloadException("invalid_arguments", "Die Verbindungsfreigabe fehlt.")
        val estimate = integer(data["estimatedBytes"], optional = true)
        val automatic = data["automatic"] == true
        requirePlan(context, id)
        status(context)
        val previous = read(context)
        if (previous?.jobId == id && OfflineDownloadRuntime.active(id)) return previous.publicStatus()
        if (OfflineDownloadRuntime.active() || previous != null && (previous.jobId != id || previous.status !in setOf("paused", "queued"))) {
            throw OfflineDownloadException("download_busy", "Den vorhandenen Download zuerst beenden und seinen Abschluss bestätigen.")
        }
        val state = (previous ?: OfflineDownloadState(id, "queued", allowMetered, estimate, System.currentTimeMillis()))
            .copy(status = "queued", allowMetered = allowMetered, estimatedBytes = estimate ?: previous?.estimatedBytes,
                requestedAt = System.currentTimeMillis(), automatic = automatic, networkRetries = 0,
                message = "Download wartet auf eine geeignete Verbindung.")
        save(context, state)
        try {
            val allowed = networkAllowed(context, state)
            if (Build.VERSION.SDK_INT >= 34 || automatic || !allowed || previous != null) {
                schedule(context, state, !automatic && allowed)
            } else context.startForegroundService(Intent(context, OfflineDownloadLegacyService::class.java).putExtra("jobId", id))
        } catch (_: Exception) {
            save(context, state.copy(status = "failed", message = "Der Hintergrunddownload konnte nicht gestartet werden."))
            throw OfflineDownloadException("schedule_failed", "Der Hintergrunddownload konnte nicht gestartet werden.")
        }
        return state.publicStatus()
    }

    @Synchronized fun cancel(context: Context, id: String): Map<String, Any>? {
        val state = read(context) ?: return null
        if (state.jobId != id) throw OfflineDownloadException("job_changed", "Der Downloadauftrag hat sich geändert.")
        if (state.status !in TERMINAL_DOWNLOAD_STATES) save(context, state.copy(status = "cancelled", message = "Download abgebrochen. Vorhandene Dateien bleiben erhalten."))
        OfflineDownloadRuntime.stop(id, "cancelled")
        context.getSystemService(JobScheduler::class.java).cancel(OFFLINE_JOB_NUMBER)
        context.stopService(Intent(context, OfflineDownloadLegacyService::class.java))
        context.getSystemService(android.app.NotificationManager::class.java).cancel(OFFLINE_NOTIFICATION_NUMBER)
        return read(context)?.publicStatus()
    }

    @Synchronized fun acknowledge(context: Context, id: String) {
        val state = read(context) ?: return
        if (state.jobId != id || state.status !in TERMINAL_DOWNLOAD_STATES || OfflineDownloadRuntime.active()) {
            throw OfflineDownloadException("download_active", "Ein laufender oder anderer Download kann nicht entfernt werden.")
        }
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).commit()) {
            throw OfflineDownloadException("status_not_saved", "Der Downloadabschluss konnte nicht bestätigt werden.")
        }
    }
}
