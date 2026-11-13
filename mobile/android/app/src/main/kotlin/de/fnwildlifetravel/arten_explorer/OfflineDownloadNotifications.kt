package de.fnwildlifetravel.arten_explorer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.net.Uri

internal object OfflineDownloadNotifications {
    private const val CHANNEL = "fn_offline_downloads_v1"
    fun enabled(context: Context): Boolean {
        val manager = context.getSystemService(NotificationManager::class.java)
        return manager.areNotificationsEnabled() && manager.getNotificationChannel(CHANNEL)?.importance != NotificationManager.IMPORTANCE_NONE
    }
    fun build(context: Context, state: OfflineDownloadState): Notification {
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "Offline-Downloads", NotificationManager.IMPORTANCE_LOW))
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP), flags)
        val cancel = PendingIntent.getBroadcast(context, 0, Intent(context, OfflineDownloadCancelReceiver::class.java)
            .setAction(OFFLINE_CANCEL).setData(Uri.parse("fn-offline://cancel/${state.jobId}")).putExtra("jobId", state.jobId), flags)
        return Notification.Builder(context, CHANNEL).setContentTitle("Arten-Explorer · Offline-Download")
            .setContentText(state.message).setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).setLocalOnly(true)
            .setVisibility(Notification.VISIBILITY_PRIVATE).setCategory(Notification.CATEGORY_PROGRESS)
            .setProgress(state.totalFiles.coerceAtMost(Int.MAX_VALUE.toLong()).toInt(), state.completeFiles.coerceAtMost(Int.MAX_VALUE.toLong()).toInt(), state.totalFiles == 0L)
            .addAction(Notification.Action.Builder(Icon.createWithResource(context, android.R.drawable.ic_menu_close_clear_cancel), "Abbrechen", cancel).build()).build()
    }
}

class OfflineDownloadCancelReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != OFFLINE_CANCEL) return
        val id = intent.getStringExtra("jobId")?.takeIf(OFFLINE_ID::matches) ?: return
        try { OfflineDownloads.cancel(context, id) } catch (_: Exception) { /* No free-form data reaches logs or notifications. */ }
    }
}
