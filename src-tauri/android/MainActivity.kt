// Card 199: tracked source of gen/android/app/src/main/java/app/atrium/desktop/MainActivity.kt.
// gen/ is generated and git-ignored; scripts/android-overlay.mjs copies this file in on every
// android build (tauri-before-build), so `tauri android init` can't lose it. Edit HERE, not in gen/.
package app.atrium.desktop

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  // Wry's default Back only uses WebView history (canGoBack), which exits with the drawer open.
  override val handleBackNavigation: Boolean = false

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        // The web layer closes the drawer, then a sheet, then a dialog; "true" = handled.
        webView.evaluateJavascript("(function(){try{return !!(window.__atriumBack&&window.__atriumBack())}catch(e){return false}})()") { handled ->
          if (handled != "true") {
            // Nothing to close: default Back (finish / move to background).
            isEnabled = false
            onBackPressedDispatcher.onBackPressed()
            isEnabled = true
          }
        }
      }
    })
  }
}
