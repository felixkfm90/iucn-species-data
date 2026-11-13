package de.fnwildlifetravel.arten_explorer

import android.app.Service
import android.app.job.JobParameters
import android.app.job.JobService
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

class OfflineDownloadJobService : JobService() {
    private var running: JobParameters? = null
    override fun onStartJob(params: JobParameters): Boolean {
        if (running != null) return false
        val id = params.extras.getString("jobId")?.takeIf(OFFLINE_ID::matches) ?: return false
        val saved = OfflineDownloads.read(this) ?: return false
        if (saved.jobId != id || saved.status in TERMINAL_DOWNLOAD_STATES) return false
        if (OfflineDownloads.stoppedByUser(this, saved)) {
            OfflineDownloads.save(this, saved.copy(status = "cancelled", message = "Download durch die Systembedienung beendet."))
            return false
        }
        running = params
        try {
            fun notifyTransfer(state: OfflineDownloadState) {
                // Every invocation of a user-initiated job requires its own notification.
                if (Build.VERSION.SDK_INT >= 34 && params.isUserInitiatedJob && running === params) {
                    setNotification(params, OFFLINE_NOTIFICATION_NUMBER,
                        OfflineDownloadNotifications.build(this, state), JOB_END_NOTIFICATION_POLICY_REMOVE)
                }
            }
            notifyTransfer(saved)
            val started = OfflineDownloadRuntime.start(this, id, this,
                changed = ::notifyTransfer,
                ended = { status -> if (running === params) { running = null; jobFinished(params, status == "paused") } })
            if (!started) { running = null; return false }
            return true
        } catch (_: Exception) {
            OfflineDownloadRuntime.stopOwner(this, "failed")
            running = null
            OfflineDownloads.save(this, saved.copy(status = "failed", message = "Der Hintergrunddownload konnte nicht gestartet werden."))
            return false
        }
    }

    override fun onStopJob(params: JobParameters): Boolean {
        val previous = running ?: return false
        if (previous.jobId != params.jobId || previous.extras.getString("jobId") != params.extras.getString("jobId")) return false
        running = null
        val userStop = Build.VERSION.SDK_INT >= 31 &&
            (params.stopReason == JobParameters.STOP_REASON_USER || params.stopReason == JobParameters.STOP_REASON_CANCELLED_BY_APP)
        val ended = OfflineDownloadRuntime.stopOwner(this, if (userStop) "cancelled" else "paused")
        return ended && !userStop && OfflineDownloads.read(this)?.status == "paused"
    }

    override fun onDestroy() {
        OfflineDownloadRuntime.stopOwner(this, "paused")
        running = null
        super.onDestroy()
    }
}

/** API 26–33 only. Not sticky, no reboot receiver and no background service resurrection. */
class OfflineDownloadLegacyService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var jobId: String? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val timeout = Runnable { jobId?.let { OfflineDownloadRuntime.stop(it, "paused") } ?: finish() }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (Build.VERSION.SDK_INT >= 34 || jobId != null || intent == null) { if (jobId == null) stopSelf(); return START_NOT_STICKY }
        val id = intent.getStringExtra("jobId")?.takeIf(OFFLINE_ID::matches)
        val state = OfflineDownloads.read(this)
        if (id == null || state?.jobId != id || state.status in TERMINAL_DOWNLOAD_STATES || OfflineDownloads.stoppedByUser(this, state)) {
            stopSelf(); return START_NOT_STICKY
        }
        jobId = id
        try {
            startForeground(OFFLINE_NOTIFICATION_NUMBER, OfflineDownloadNotifications.build(this, state))
            wakeLock = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ArtenExplorer:OfflineDownload")
                .apply { setReferenceCounted(false); acquire(6 * 60 * 60 * 1000L) }
            handler.postDelayed(timeout, 6 * 60 * 60 * 1000L)
            if (!OfflineDownloadRuntime.start(this, id, this,
                changed = { next -> getSystemService(android.app.NotificationManager::class.java)
                    .notify(OFFLINE_NOTIFICATION_NUMBER, OfflineDownloadNotifications.build(this, next)) },
                ended = { outcome ->
                    try {
                        val paused = OfflineDownloads.read(this)
                        if (outcome == "paused" && paused?.jobId == id && paused.status == "paused") {
                            OfflineDownloads.schedule(this, paused, false)
                        }
                    } catch (_: Exception) {
                        // The paused journal remains available for a manual retry.
                    } finally { finish() }
                })) finish()
        } catch (_: Exception) {
            OfflineDownloadRuntime.stopOwner(this, "failed")
            val failed = OfflineDownloads.read(this)
            if (failed?.jobId == id && failed.status !in TERMINAL_DOWNLOAD_STATES) {
                OfflineDownloads.save(this, failed.copy(status = "failed", message = "Der Hintergrunddownload konnte nicht gestartet werden."))
            }
            finish()
        }
        return START_NOT_STICKY
    }
    private fun releaseWakeLock() { wakeLock?.let { if (it.isHeld) it.release() }; wakeLock = null }
    private fun finish() { handler.removeCallbacks(timeout); releaseWakeLock(); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() }
    override fun onDestroy() {
        handler.removeCallbacks(timeout)
        releaseWakeLock()
        OfflineDownloadRuntime.stopOwner(this, "paused")
        jobId = null
        super.onDestroy()
    }
    override fun onTimeout(startId: Int, fgsType: Int) { OfflineDownloadRuntime.stopOwner(this, "paused"); finish() }
}
