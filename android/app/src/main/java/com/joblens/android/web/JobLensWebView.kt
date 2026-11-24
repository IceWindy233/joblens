package com.joblens.android.web

import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.ApplicationInfo
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

/**
 * 加载 assets/web 下由 mobile/ 构建出的页面（panel / settings），注入原生桥，并转发存储变化。
 * 只允许加载应用内页面，其他导航一律拦截。
 */
class JobLensWebView(
    context: Context,
    page: String,
    panel: PanelHost?,
    chromeClient: WebChromeClient? = null,
    /** 渲染进程崩溃或被系统回收后调用；调用方须销毁本实例并按需重建 */
    onRendererGone: () -> Unit,
) {
    companion object {
        private const val ORIGIN = "https://${WebViewAssetLoader.DEFAULT_DOMAIN}"
    }

    val view = WebView(context)
    val bridge = NativeBridge(context, view, panel)
    private val onStorageChanged: () -> Unit = { bridge.emit("storageChanged") }

    init {
        NativeStorage.init(context)
        if (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
            .build()
        configure()
        view.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                !request.url.toString().startsWith("$ORIGIN/assets/web/")

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                onRendererGone()
                return true
            }
        }
        chromeClient?.let { view.webChromeClient = it }
        NativeStorage.addListener(onStorageChanged)
        view.loadUrl("$ORIGIN/assets/web/$page.html")
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun configure() {
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
        }
        view.addJavascriptInterface(bridge, "JobLensNative")
    }

    fun destroy() {
        NativeStorage.removeListener(onStorageChanged)
        view.destroy()
    }
}
