package com.joblens.android.web

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.FileProvider
import com.joblens.android.MainActivity
import com.joblens.android.setup.SetupChecks
import org.json.JSONObject
import java.io.File

/** 悬浮面板专有的宿主能力 */
interface PanelHost {
    fun setBubble(json: String)
    fun setCard(json: String)
    fun showNotice(text: String)
    fun closePanel()
    fun requestTree()
}

/**
 * 注入为 window.JobLensNative，契约见 mobile/native.ts 的 NativeBridge。
 * 方法在 WebView 的 JavaBridge 线程上调用；回调统一切回主线程执行 JS。
 */
class NativeBridge(
    private val context: Context,
    private val webView: WebView,
    private val panel: PanelHost?,
) {
    private val main = Handler(Looper.getMainLooper())

    private fun callJs(function: String, vararg args: String) {
        val argList = args.joinToString(",") { JSONObject.quote(it) }
        main.post { webView.evaluateJavascript("window.__joblens&&window.__joblens.$function($argList)", null) }
    }

    @JavascriptInterface
    fun storageGet(area: String, key: String): String? = NativeStorage.get(area, key)

    @JavascriptInterface
    fun storageSet(area: String, key: String, json: String) = NativeStorage.set(area, key, json)

    @JavascriptInterface
    fun storageRemove(area: String, key: String) = NativeStorage.remove(area, key)

    @JavascriptInterface
    fun storageClear(area: String) = NativeStorage.clear(area)

    @JavascriptInterface
    fun httpRequest(id: String, requestJson: String) {
        NativeHttp.request(id, requestJson, { callJs("httpDone", id, it) }, { callJs("httpFail", id, it) })
    }

    @JavascriptInterface
    fun httpAbort(id: String) = NativeHttp.abort(id)

    @JavascriptInterface
    fun copyText(text: String) {
        main.post {
            context.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("JobLens", text))
        }
    }

    /** 把诊断文本写入缓存并打开系统分享。悬浮面板会先收起，否则会盖住分享面板。 */
    @JavascriptInterface
    fun shareText(filename: String, text: String) {
        val dir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(dir, File(filename).name).apply { writeText(text) }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        val send = Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        main.post {
            panel?.closePanel()
            context.startActivity(Intent.createChooser(send, "导出页面结构").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    @JavascriptInterface
    fun openSettings() {
        main.post {
            panel?.closePanel()
            context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    @JavascriptInterface
    fun setupChecks(): String = SetupChecks.toJson(context)

    @JavascriptInterface
    fun setupAction(id: String, index: Int) {
        main.post { SetupChecks.runAction(context, id, index) }
    }

    @JavascriptInterface
    fun setupConfirm(id: String, confirmed: Boolean) = SetupChecks.setConfirmed(context, id, confirmed)

    @JavascriptInterface
    fun consumeFirstRun(): Boolean = SetupChecks.consumeFirstRun(context)

    @JavascriptInterface
    fun setBubble(json: String) {
        main.post { panel?.setBubble(json) }
    }

    @JavascriptInterface
    fun setCard(json: String) {
        main.post { panel?.setCard(json) }
    }

    @JavascriptInterface
    fun showNotice(text: String) {
        main.post { panel?.showNotice(text) }
    }

    @JavascriptInterface
    fun closePanel() {
        main.post { panel?.closePanel() }
    }

    @JavascriptInterface
    fun requestTree() {
        main.post { panel?.requestTree() }
    }

    /** 由原生层主动推送事件（主线程调用） */
    fun emit(function: String, vararg args: String) = callJs(function, *args)
}
