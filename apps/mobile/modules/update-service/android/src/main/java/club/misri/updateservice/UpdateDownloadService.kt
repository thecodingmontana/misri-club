package club.misri.updateservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Keeps Misri running while an update downloads, so the download carries on
 * in another app or with the screen off. Android requires an ongoing
 * notification for that; it shows the download's progress.
 */
class UpdateDownloadService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notice = notification(
      this,
      intent?.getStringExtra(EXTRA_TITLE) ?: "Downloading the update",
      intent?.getStringExtra(EXTRA_TEXT) ?: "",
      intent?.getIntExtra(EXTRA_PERCENT, -1) ?: -1,
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTICE_ID, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTICE_ID, notice)
    }
    return START_NOT_STICKY
  }

  // Android 15 limits how long a data-sync service may run: stop when told
  override fun onTimeout(startId: Int, fgsType: Int) {
    stopSelf()
  }

  companion object {
    const val NOTICE_ID = 7301
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    const val EXTRA_PERCENT = "percent"
    private const val CHANNEL = "update-download"

    /** The ongoing notice: title, a line of detail, and a progress bar. */
    fun notification(context: Context, title: String, text: String, percent: Int): Notification {
      val manager = context.getSystemService(NotificationManager::class.java)
      val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        manager.createNotificationChannel(
          NotificationChannel(CHANNEL, "Update download", NotificationManager.IMPORTANCE_LOW),
        )
        Notification.Builder(context, CHANNEL)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(context)
      }
      val open = context.packageManager.getLaunchIntentForPackage(context.packageName)
      if (open != null) {
        builder.setContentIntent(
          PendingIntent.getActivity(
            context,
            0,
            open,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
          ),
        )
      }
      return builder
        .setSmallIcon(android.R.drawable.stat_sys_download)
        .setContentTitle(title)
        .setContentText(text)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setProgress(100, percent.coerceIn(0, 100), percent < 0)
        .build()
    }
  }
}
