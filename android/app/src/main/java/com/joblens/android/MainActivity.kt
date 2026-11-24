package com.joblens.android

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.view.View
import android.view.WindowInsets
import android.widget.LinearLayout
import com.joblens.android.web.JobLensWebView

/**
 * 主界面：整页复用扩展的设置页（模型、档案、规则、样例），Android 额外提供“权限与运行”分区，
 * 首次启动时直接打开该分区。
 */
class MainActivity : Activity() {
    companion object {
        private const val REQUEST_FILE = 1
    }

    private lateinit var web: JobLensWebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val chooser = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                startActivityForResult(params.createIntent(), REQUEST_FILE)
                return true
            }
        }
        web = JobLensWebView(this, "settings", panel = null, chromeClient = chooser, onRendererGone = ::recreate)

        // 统一采用全面屏布局：状态栏下垫一条与顶部常驻栏同色的色块，底部垫导航栏 / 键盘高度
        window.setDecorFitsSystemWindows(false)
        val statusBar = View(this).apply { setBackgroundColor(getColor(R.color.top_bar)) }
        val bottomBar = View(this).apply { setBackgroundColor(getColor(R.color.canvas)) }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(statusBar, LinearLayout.LayoutParams(-1, 0))
            addView(web.view, LinearLayout.LayoutParams(-1, 0, 1f))
            addView(bottomBar, LinearLayout.LayoutParams(-1, 0))
        }
        root.setOnApplyWindowInsetsListener { _, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars())
            val ime = insets.getInsets(WindowInsets.Type.ime())
            statusBar.layoutParams.height = bars.top
            bottomBar.layoutParams.height = maxOf(bars.bottom, ime.bottom)
            root.setPadding(bars.left, 0, bars.right, 0)
            root.requestLayout()
            WindowInsets.CONSUMED
        }
        setContentView(root)
    }

    override fun onResume() {
        super.onResume()
        // 用户可能刚从系统设置返回，通知“权限与运行”分区重新检测
        web.bridge.emit("setupChanged")
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    @Deprecated("Activity result API is not available on platform Activity")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQUEST_FILE) {
            fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            fileCallback = null
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }
}
