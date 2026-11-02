package app.azan.global

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.util.Log
import android.view.ViewGroup
import android.webkit.GeolocationPermissions
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader

/**
 * Hosts the production WebView build in a WebView and exposes [AzanBridge].
 *
 * The web layer is not a mock inside the app: it is the same `dist/` bundle that is
 * tested and served as a PWA. The native side adds the only thing a browser cannot
 * provide — alarms that survive the app being closed — and nothing else.
 */
class MainActivity : ComponentActivity(), SensorEventListener {

    private lateinit var webView: WebView
    private var mainFrameFailed = false

    private var sensorManager: SensorManager? = null
    private var rotationSensor: Sensor? = null
    @Volatile
    private var nativeAzimuth: Float = -1f
    private val rotationMatrix = FloatArray(9)
    private val orientationAngles = FloatArray(3)

    /** The audio file the user picked, kept so [AzanBridge.importSound] can copy it. */
    data class PickedSound(val uri: Uri, val name: String, val mime: String)

    @Volatile
    private var pickedSound: PickedSound? = null
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

    /**
     * The WebView file input needs a real `onShowFileChooser` implementation: the
     * default one does nothing, so "Import an Adhan" was inert inside the APK.
     * The picked URI is handed to the page (which stores the Blob in IndexedDB)
     * AND remembered for the bridge, which copies it into private storage.
     */
    private val pickSound = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val callback = fileChooserCallback
        fileChooserCallback = null
        if (uri == null) {
            callback?.onReceiveValue(null)
            return@registerForActivityResult
        }
        val (name, mime) = describe(uri)
        pickedSound = PickedSound(uri, name, mime)
        callback?.onReceiveValue(arrayOf(uri))
    }

    /**
     * Modern Activity Result API launcher for POST_NOTIFICATIONS (API 33+).
     * Eliminates legacy onRequestPermissionsResult and RequestCodes.
     */
    private val requestNotificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { _ ->
            refreshPermissions()
        }

    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null

    private val requestLocationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permissions ->
            val granted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
            pendingGeoCallback?.invoke(pendingGeoOrigin, granted, false)
            pendingGeoOrigin = null
            pendingGeoCallback = null
        }

    fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    /** Consumes the last picked file (one import per pick). */
    fun takePickedSound(): PickedSound? = pickedSound.also { pickedSound = null }

    private fun describe(uri: Uri): Pair<String, String> {
        var name = "imported-audio"
        val mime = contentResolver.getType(uri) ?: "application/octet-stream"
        try {
            contentResolver
                .query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (index >= 0) cursor.getString(index)?.let { name = it }
                    }
                }
        } catch (error: Exception) {
            Log.w(TAG, "cannot read file name: ${error.message}")
        }
        return name to mime
    }

    override fun attachBaseContext(newBase: Context) {
        // The web UI lets the user pick Arabic/French/English independently of the
        // system language; native notifications and this screen must follow it.
        super.attachBaseContext(LocaleHelper.wrap(newBase, ScheduleStore.readLocale(newBase)))
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.Theme_Azan)
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        Notifications.createChannels(LocaleHelper.wrap(this, ScheduleStore.readLocale(this)))

        sensorManager = getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        rotationSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
            ?: sensorManager?.getDefaultSensor(Sensor.TYPE_ORIENTATION)

        webView = WebView(this).apply {
            setBackgroundColor(ContextCompat.getColor(context, R.color.azan_ivory))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                // databaseEnabled (Web SQL) is deprecated and removed — domStorageEnabled
                // (IndexedDB / LocalStorage) is all we need for offline audio storage.
                allowFileAccess = false
                // The audio import relies on the file chooser handing a
                // `content://` URI back to the page, which the WebView must be able
                // to open. Only the bundled page runs (no INTERNET permission), and
                // a content URI cannot be enumerated, so this grants nothing else.
                allowContentAccess = true
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                cacheMode = WebSettings.LOAD_DEFAULT
                setGeolocationEnabled(true)
            }
            // Debuggable builds only: the release APK must not expose a remote
            // debugging socket on the device.
            if (isDebuggable()) WebView.setWebContentsDebuggingEnabled(true)

            addJavascriptInterface(AzanBridge(this@MainActivity), "AzanNative")

            webChromeClient = object : WebChromeClient() {
                override fun onGeolocationPermissionsShowPrompt(
                    origin: String?,
                    callback: GeolocationPermissions.Callback?
                ) {
                    if (ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.ACCESS_FINE_LOCATION
                        ) == PackageManager.PERMISSION_GRANTED
                    ) {
                        callback?.invoke(origin, true, false)
                    } else {
                        pendingGeoOrigin = origin
                        pendingGeoCallback = callback
                        requestLocationPermissionLauncher.launch(
                            arrayOf(
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                            )
                        )
                    }
                }

                override fun onShowFileChooser(
                    webView: WebView,
                    filePathCallback: ValueCallback<Array<Uri>>,
                    fileChooserParams: WebChromeClient.FileChooserParams,
                ): Boolean {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = filePathCallback
                    return try {
                        pickSound.launch("audio/*")
                        true
                    } catch (error: Exception) {
                        Log.e(TAG, "cannot open the audio picker: ${error.message}")
                        fileChooserCallback = null
                        false
                    }
                }
            }

            val loader = buildAssetLoader(this@MainActivity)
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? {
                    val response = loader.shouldInterceptRequest(request.url)
                    if (response != null) {
                        return response
                    }
                    return super.shouldInterceptRequest(view, request)
                }

                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest,
                ): Boolean {
                    val uri = request.url
                    if (uri.host != WebAssetHandler.ASSET_DOMAIN) {
                        if (uri.scheme == "http" || uri.scheme == "https") {
                            try {
                                val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                                    addCategory(Intent.CATEGORY_BROWSABLE)
                                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                                }
                                startActivity(intent)
                            } catch (_: Exception) {
                                // No external browser app found
                            }
                        }
                        return true
                    }
                    return false
                }

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: android.webkit.WebResourceError,
                ) {
                    if (!request.isForMainFrame || mainFrameFailed) return
                    // Ignore net::ERR_CACHE_MISS or sub-resources errors
                    if (error.errorCode == ERROR_CONNECT || error.errorCode == ERROR_HOST_LOOKUP) {
                        mainFrameFailed = true
                        Log.e(TAG, "main frame failed: ${error.description}")
                        showBundleMissingPage()
                    }
                }

                override fun onRenderProcessGone(
                    view: WebView,
                    detail: RenderProcessGoneDetail,
                ): Boolean {
                    Log.e(TAG, "renderer gone, crashed=${detail.didCrash()}")
                    // This WebView instance is unusable; rebuild the activity.
                    window.decorView.post { recreate() }
                    return true
                }
            }
        }

        val container = FrameLayout(this).apply {
            setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.azan_green))
        }
        container.addView(
            webView,
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        setContentView(container)

        ViewCompat.setOnApplyWindowInsetsListener(container) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
            )
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        // statusBarColor / navigationBarColor are deprecated on API 35+.
        // Edge-to-edge is enforced natively by WindowCompat and the insets listener above.

        onBackPressedDispatcher.addCallback(this, backCallback())

        if (savedInstanceState != null) {
            val restored = webView.restoreState(savedInstanceState)
            if (restored == null) loadApp()
        } else {
            loadApp()
        }
    }

    private fun buildAssetLoader(context: Context): WebViewAssetLoader =
        WebViewAssetLoader.Builder()
            .setDomain(WebAssetHandler.ASSET_DOMAIN)
            .addPathHandler("/", WebAssetHandler(context))
            .build()

    private fun loadApp() {
        webView.loadUrl("https://${WebAssetHandler.ASSET_DOMAIN}/")
    }

    /**
     * Shown only if the APK was packaged without `dist/`. Saying so plainly beats a
     * white screen that looks like a crash.
     */
    private fun showBundleMissingPage() {
        val html = buildString {
            append("<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\">")
            append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">")
            append("<style>")
            append("body{font-family:sans-serif;background:#F6F2E9;color:#14201B;padding:32px;line-height:1.5}")
            append("h1{color:#0C634B}")
            append("code{background:#E7E1D2;padding:2px 6px;border-radius:4px}")
            append("</style></head><body>")
            append("<h1>AdhanSalat \u00b7 \u0623\u0630\u0627\u0646 \u0635\u0644\u0627\u0629</h1>")
            append("<p><strong>Le bundle web est absent de l\u2019APK.</strong></p>")
            append("<p>Lancez <code>npm run build</code> avant <code>gradlew assembleDebug</code> : ")
            append("le build Gradle copie <code>dist/</code> dans les assets.</p>")
            append("<hr>")
            append("<p><strong>The web bundle is missing from the APK.</strong> Run ")
            append("<code>npm run build</code> before <code>gradlew assembleDebug</code>.</p>")
            append("</body></html>")
        }
        webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
    }

    private fun backCallback(): OnBackPressedCallback =
        object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        }

    override fun onResume() {
        super.onResume()
        // The user may have granted notifications, exact alarms or a battery
        // exemption in the system UI while the app was in the background.
        Notifications.createChannels(LocaleHelper.wrap(this, ScheduleStore.readLocale(this)))
        rotationSensor?.let {
            sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
        }
        refreshPermissions()
    }

    override fun onPause() {
        super.onPause()
        sensorManager?.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return
        if (event.sensor.type == Sensor.TYPE_ROTATION_VECTOR) {
            SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
            SensorManager.getOrientation(rotationMatrix, orientationAngles)
            val deg = Math.toDegrees(orientationAngles[0].toDouble()).toFloat()
            nativeAzimuth = (deg + 360f) % 360f
        } else if (event.sensor.type == Sensor.TYPE_ORIENTATION) {
            nativeAzimuth = (event.values[0] + 360f) % 360f
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    fun getNativeHeading(): Float = nativeAzimuth

    /** Tells the web diagnostics screen to re-read the native permission state. */
    private fun refreshPermissions() {
        webView.evaluateJavascript(
            "window.dispatchEvent(new Event('azan:permissions-changed'))",
            null,
        )
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        // An unanswered file chooser callback would leak the WebView's request.
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        webView.removeJavascriptInterface("AzanNative")
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    private fun isDebuggable(): Boolean =
        (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0

    companion object {
        private const val TAG = "AzanWebView"
    }
}
