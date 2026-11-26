package club.misri.updateservice

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UpdateServiceModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("UpdateService")

    // Starts the service; only while Misri is on screen (Android's rule).
    // False when Android refused, so the download runs as before.
    Function("start") { title: String, text: String, percent: Int ->
      val intent = Intent(context, UpdateDownloadService::class.java)
        .putExtra(UpdateDownloadService.EXTRA_TITLE, title)
        .putExtra(UpdateDownloadService.EXTRA_TEXT, text)
        .putExtra(UpdateDownloadService.EXTRA_PERCENT, percent)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        true
      } catch (e: Exception) {
        false
      }
    }

    // Progress on the same notice, from the foreground or the background.
    Function("progress") { title: String, text: String, percent: Int ->
      context.getSystemService(NotificationManager::class.java).notify(
        UpdateDownloadService.NOTICE_ID,
        UpdateDownloadService.notification(context, title, text, percent),
      )
    }

    Function("stop") {
      context.stopService(Intent(context, UpdateDownloadService::class.java))
    }
  }
}
