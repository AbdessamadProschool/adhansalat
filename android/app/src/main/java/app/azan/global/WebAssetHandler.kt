package app.azan.global

import android.content.Context
import android.content.res.AssetManager
import android.net.Uri
import android.util.Log
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.IOException
import java.io.InputStream
import java.util.Locale

/**
 * Robust asset handler for WebView.
 *
 * Checks both `web/<relative>` and root assets fallback, ensuring the bundle
 * is reliably loaded regardless of whether files are in `assets/web/` or `assets/`.
 */
class WebAssetHandler(private val context: Context) : WebViewAssetLoader.PathHandler {

    override fun handle(path: String): WebResourceResponse? {
        val decoded = try {
            Uri.decode(path).trimStart('/')
        } catch (_: Exception) {
            return null
        }
        if (decoded.contains("..")) return null

        val relative = when {
            decoded.isEmpty() -> INDEX
            decoded.endsWith("/") -> "${decoded}${INDEX}"
            else -> decoded
        }

        // Try opening from "web/<relative>", then fallback to root "<relative>"
        val stream = open("web/$relative")
            ?: open(relative)
            ?: run {
                // If it's a SPA route or deep link without extension, fallback to index.html
                if (relative.substringAfterLast('/', "").contains('.')) return null
                open("web/$INDEX") ?: open(INDEX) ?: return null
            }

        val mime = mimeTypeOf(relative)
        val charset = if (mime.startsWith("text/") || mime == "application/javascript" ||
            mime == "application/json" || mime == "application/manifest+json"
        ) {
            "utf-8"
        } else {
            null
        }

        val headers = mapOf(
            "Access-Control-Allow-Origin" to "*",
            "Cache-Control" to "no-cache"
        )
        return WebResourceResponse(mime, charset, 200, "OK", headers, stream)
    }

    private fun open(assetPath: String): InputStream? = try {
        context.assets.open(assetPath, AssetManager.ACCESS_STREAMING)
    } catch (_: IOException) {
        null
    }

    private fun mimeTypeOf(name: String): String {
        val extension = name.substringAfterLast('.', "").lowercase(Locale.ROOT)
        return when (extension) {
            "html", "htm" -> "text/html"
            "js", "mjs" -> "application/javascript"
            "css" -> "text/css"
            "json" -> "application/json"
            "webmanifest" -> "application/manifest+json"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "webp" -> "image/webp"
            "svg" -> "image/svg+xml"
            "ico" -> "image/x-icon"
            "wav" -> "audio/wav"
            "mp3" -> "audio/mpeg"
            "ogg" -> "audio/ogg"
            "woff2" -> "font/woff2"
            "txt" -> "text/plain"
            else -> "application/octet-stream"
        }
    }

    companion object {
        const val ASSET_DOMAIN = "appassets.androidplatform.net"
        private const val INDEX = "index.html"
    }
}

fun buildAssetLoader(context: Context): WebViewAssetLoader =
    WebViewAssetLoader.Builder()
        .setDomain(WebAssetHandler.ASSET_DOMAIN)
        .addPathHandler("/", WebAssetHandler(context))
        .build()
