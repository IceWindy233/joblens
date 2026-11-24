package com.joblens.android.overlay

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.SystemClock
import android.text.TextUtils
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import com.joblens.android.ui.Palette
import org.json.JSONObject

/**
 * 点按气泡后出现在气泡旁的速览卡：匹配分、结论、职位与一句状态（如“打招呼语已写入剪贴板”）。
 * 不获取焦点；点卡片以外任何位置即收起。颜色取自 DESIGN.md 的浅色/深色 token。
 */
class QuickCard(
    private val context: Context,
    private val wm: WindowManager,
    private val onDetails: () -> Unit,
) {
    private val density = context.resources.displayMetrics.density
    private fun dp(v: Int) = (v * density).toInt()

    val width = dp(264)

    private val params = WindowManager.LayoutParams(
        width,
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
        PixelFormat.TRANSLUCENT,
    ).apply { gravity = Gravity.TOP or Gravity.START }

    private val score = TextView(context).apply {
        textSize = 26f
        typeface = Typeface.DEFAULT_BOLD
    }
    private val outOf = TextView(context).apply {
        textSize = 13f
        text = " /100"
    }
    private val verdict = TextView(context).apply {
        textSize = 12f
        setPadding(dp(8), dp(2), dp(8), dp(2))
    }
    private val scoreRow = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        addView(score)
        addView(outOf)
        addView(View(context), LinearLayout.LayoutParams(0, 0, 1f))
        addView(verdict)
    }
    private val subtitle = TextView(context).apply {
        textSize = 13f
        maxLines = 1
        ellipsize = TextUtils.TruncateAt.END
    }
    private val message = TextView(context).apply {
        textSize = 12.5f
        setPadding(0, dp(4), 0, 0)
    }
    private val close = action("关闭") { hide() }
    private val details = action("查看详情") {
        hide()
        onDetails()
    }

    private val root = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(14), dp(12), dp(14), dp(8))
        elevation = dp(6).toFloat()
        addView(scoreRow)
        addView(subtitle)
        addView(message)
        addView(
            LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.END
                setPadding(0, dp(6), 0, 0)
                addView(close)
                addView(details)
            },
        )
    }

    var isShown = false
        private set

    /** 最近一次因点按卡片外部而收起的时间；用于区分“点气泡收起卡片”与“点气泡打开卡片” */
    var dismissedByOutsideAt = 0L
        private set

    private var lastJson = JSONObject().put("subtitle", "未识别到职位").put("message", "").toString()

    init {
        installOutsideDismiss()
        render(lastJson)
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun installOutsideDismiss() {
        root.setOnTouchListener { _, e ->
            if (e.actionMasked == MotionEvent.ACTION_OUTSIDE) {
                dismissedByOutsideAt = SystemClock.uptimeMillis()
                hide()
                true
            } else {
                false
            }
        }
    }

    private fun action(label: String, onClick: () -> Unit) = TextView(context).apply {
        text = label
        textSize = 13f
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        minHeight = dp(40)
        setPadding(dp(12), 0, dp(12), 0)
        isClickable = true
        isFocusable = true
        setOnClickListener { onClick() }
    }

    private fun toneColor(p: Palette, tone: String): Int = when (tone) {
        "ok" -> p.ok
        "warn" -> p.warn
        "danger" -> p.danger
        "primary" -> p.primary
        else -> p.muted
    }

    private fun toneSoft(p: Palette, tone: String): Int = when (tone) {
        "ok" -> p.okSoft
        "warn" -> p.warnSoft
        "danger" -> p.dangerSoft
        else -> p.surface
    }

    /** 系统切换深浅色后按最近一次内容重绘 */
    fun refreshTheme() = render(lastJson)

    /** 契约见 mobile/panel.tsx 的 CardState */
    fun render(json: String) {
        lastJson = json
        val o = JSONObject(json)
        val p = Palette.of(context)
        root.background = GradientDrawable().apply {
            cornerRadius = dp(12).toFloat()
            setColor(p.surface)
            setStroke(dp(1), p.border)
        }
        val hasScore = !o.isNull("score")
        scoreRow.visibility = if (hasScore) View.VISIBLE else View.GONE
        if (hasScore) {
            score.text = o.getInt("score").toString()
            score.setTextColor(p.primary)
            outOf.setTextColor(p.muted)
        }
        val verdictText = if (o.isNull("verdict")) "" else o.optString("verdict")
        verdict.visibility = if (verdictText.isEmpty()) View.GONE else View.VISIBLE
        verdict.text = verdictText
        val verdictTone = o.optString("verdictTone")
        verdict.setTextColor(toneColor(p, verdictTone))
        verdict.background = GradientDrawable().apply {
            cornerRadius = dp(999).toFloat()
            setColor(toneSoft(p, verdictTone))
        }
        subtitle.text = o.optString("subtitle")
        subtitle.setTextColor(p.fg)
        val messageText = o.optString("message")
        message.visibility = if (messageText.isEmpty()) View.GONE else View.VISIBLE
        message.text = messageText
        message.setTextColor(toneColor(p, o.optString("messageTone")))
        close.setTextColor(p.muted)
        details.setTextColor(p.onPrimary)
        details.background = GradientDrawable().apply {
            cornerRadius = dp(6).toFloat()
            setColor(p.primary)
        }
        root.contentDescription = listOfNotNull(
            if (hasScore) "匹配度 ${o.getInt("score")} 分" else null,
            verdictText.ifEmpty { null },
            subtitle.text.toString(),
            messageText.ifEmpty { null },
        ).joinToString("，")
    }

    /** 显示在气泡旁：气泡在屏幕左半边时放右侧，否则放左侧。 */
    fun show(bubble: WindowManager.LayoutParams, bubbleSize: Int) {
        val screenWidth = wm.currentWindowMetrics.bounds.width()
        val gap = dp(8)
        params.x = if (bubble.x + bubbleSize / 2 < screenWidth / 2) {
            bubble.x + bubbleSize + gap
        } else {
            (bubble.x - width - gap).coerceAtLeast(0)
        }
        params.y = bubble.y
        if (isShown) {
            wm.updateViewLayout(root, params)
        } else {
            wm.addView(root, params)
            isShown = true
        }
    }

    fun hide() {
        if (!isShown) return
        wm.removeView(root)
        isShown = false
    }
}
