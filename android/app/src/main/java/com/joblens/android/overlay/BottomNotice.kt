package com.joblens.android.overlay

import android.content.Context
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import com.joblens.android.ui.Palette

/**
 * 屏幕底部的短暂提示（约 2 秒）。不用 Toast：应用通知被关闭时系统会屏蔽后台应用的 Toast
 * （Android 13+ 未授予通知权限即属此类）。提示窗口不接收触摸，不影响 BOSS 操作。
 */
class BottomNotice(private val context: Context, private val wm: WindowManager) {
    companion object {
        private const val DURATION_MS = 2000L
    }

    private val density = context.resources.displayMetrics.density
    private fun dp(v: Int) = (v * density).toInt()

    private val main = Handler(Looper.getMainLooper())
    private val hideRunnable = Runnable { hide() }

    private val params = WindowManager.LayoutParams(
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
        PixelFormat.TRANSLUCENT,
    ).apply {
        gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
        // 留出导航栏与系统剪贴板预览的位置
        y = dp(120)
    }

    private val view = TextView(context).apply {
        textSize = 14f
        setPadding(dp(16), dp(10), dp(16), dp(10))
        elevation = dp(4).toFloat()
        accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
    }

    private var shown = false

    fun show(text: String) {
        val night = Palette.isNight(context)
        // 与系统 Toast 一致的反色样式：浅色主题用深底浅字
        view.setTextColor(if (night) 0xFF111827.toInt() else 0xFFFFFFFF.toInt())
        view.background = GradientDrawable().apply {
            cornerRadius = dp(999).toFloat()
            setColor(if (night) 0xFFE7E9EC.toInt() else 0xE6111827.toInt())
        }
        view.text = text
        if (!shown) {
            wm.addView(view, params)
            shown = true
        }
        main.removeCallbacks(hideRunnable)
        main.postDelayed(hideRunnable, DURATION_MS)
    }

    fun hide() {
        main.removeCallbacks(hideRunnable)
        if (!shown) return
        wm.removeView(view)
        shown = false
    }
}
