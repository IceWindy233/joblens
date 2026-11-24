package com.joblens.android.overlay

import android.accessibilityservice.AccessibilityService
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.SystemClock
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import com.joblens.android.ui.Palette
import com.joblens.android.web.JobLensWebView
import com.joblens.android.web.PanelHost
import org.json.JSONObject
import kotlin.math.abs

/**
 * 无障碍悬浮窗（TYPE_ACCESSIBILITY_OVERLAY，不需要“显示悬浮窗”权限）：
 * - 气泡：显示当前职位状态或匹配分数，可拖动；点按弹出速览卡并请求快速分析（出分后打招呼语写入剪贴板）。
 * - 速览卡：分数、结论与状态，“查看详情”展开面板。
 * - 面板：承载常驻的分析 WebView，收起时 WebView 脱离窗口但继续接收节点树。
 */
class OverlayController(
    private val service: AccessibilityService,
    private val onRequestTree: () -> Unit,
) : PanelHost {
    private val wm = service.getSystemService(WindowManager::class.java)
    private val density = service.resources.displayMetrics.density
    private fun dp(v: Int) = (v * density).toInt()

    /** 当前面板 WebView 创建时的深浅色 */
    private var webNight = Palette.isNight(service)
    private var web = createWeb()

    /**
     * 服务的 Context 没有主题，WebView 会一直按浅色报告 prefers-color-scheme；
     * 套上 DayNight 主题后网页面板才会跟随系统深色模式。
     */
    private fun createWeb() = JobLensWebView(
        ContextThemeWrapper(service, android.R.style.Theme_DeviceDefault_DayNight),
        "panel",
        this,
        onRendererGone = ::rebuildWeb,
    )

    /**
     * 重建面板 WebView：渲染进程被回收，或系统切换深浅色（WebView 只在创建时读取主题，
     * 之后不会更新 prefers-color-scheme）。分析结果缓存保存在原生内存，重建后点气泡可直接复用。
     */
    private fun rebuildWeb() {
        closePanel()
        web.destroy()
        webNight = Palette.isNight(service)
        web = createWeb()
    }

    private val bubbleParams = WindowManager.LayoutParams(
        dp(48),
        dp(48),
        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
        PixelFormat.TRANSLUCENT,
    ).apply {
        gravity = Gravity.TOP or Gravity.START
        x = dp(8)
        y = dp(220)
    }

    /** 面板占屏幕下部，可获取焦点以便编辑打招呼语；面板外的触摸仍交给 BOSS。 */
    private val panelParams = WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT,
        (service.resources.displayMetrics.heightPixels * 0.78).toInt(),
        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
        PixelFormat.TRANSLUCENT,
    ).apply {
        gravity = Gravity.BOTTOM
        softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
    }

    private val bubble = BubbleView(service)

    private val panel = object : FrameLayout(service) {
        override fun dispatchKeyEvent(event: KeyEvent): Boolean {
            if (event.keyCode == KeyEvent.KEYCODE_BACK) {
                if (event.action == KeyEvent.ACTION_UP) closePanel()
                return true
            }
            return super.dispatchKeyEvent(event)
        }
    }.apply {
        clipToOutline = true
    }

    /** 面板底色随系统深浅色（DESIGN.md 的 canvas） */
    private fun applyPanelTheme() {
        panel.background = GradientDrawable().apply {
            val r = dp(14).toFloat()
            cornerRadii = floatArrayOf(r, r, r, r, 0f, 0f, 0f, 0f)
            setColor(Palette.of(service).canvas)
        }
    }

    private var shown = false
    private var expanded = false
    private var collapsedBubbleY = 0

    private val card = QuickCard(service, wm) { openPanel() }
    private val notice = BottomNotice(service, wm)

    private var bubbleJson = JSONObject().put("kind", "idle").put("description", "未识别到职位").toString()

    init {
        applyPanelTheme()
        setBubble(bubbleJson)
        installDrag()
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun installDrag() {
        val slop = ViewConfiguration.get(service).scaledTouchSlop
        var downX = 0f
        var downY = 0f
        var startX = 0
        var startY = 0
        var dragging = false
        bubble.setOnTouchListener { v, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = e.rawX; downY = e.rawY
                    startX = bubbleParams.x; startY = bubbleParams.y
                    dragging = false
                    v.isPressed = true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX
                    val dy = e.rawY - downY
                    if (!dragging && (abs(dx) > slop || abs(dy) > slop)) {
                        dragging = true
                        v.isPressed = false
                    }
                    if (dragging) {
                        bubbleParams.x = startX + dx.toInt()
                        bubbleParams.y = startY + dy.toInt()
                        wm.updateViewLayout(bubble, bubbleParams)
                    }
                }
                MotionEvent.ACTION_UP -> {
                    v.isPressed = false
                    if (dragging) snapToEdge() else v.performClick()
                }
                MotionEvent.ACTION_CANCEL -> v.isPressed = false
            }
            true
        }
        bubble.setOnClickListener {
            when {
                expanded -> closePanel()
                card.isShown -> card.hide()
                // 这次点按的按下动作已经把卡片当作“点外部”收起了，不再重新打开
                SystemClock.uptimeMillis() - card.dismissedByOutsideAt < 500 -> Unit
                else -> {
                    card.show(bubbleParams, bubbleParams.width)
                    web.bridge.emit("bubbleTapped")
                }
            }
        }
    }

    /** 松手后吸附到最近的左右边缘，并限制在屏幕内 */
    private fun snapToEdge() {
        val bounds = wm.currentWindowMetrics.bounds
        val size = bubbleParams.width
        val margin = dp(8)
        val targetX = if (bubbleParams.x + size / 2 < bounds.width() / 2) margin else bounds.width() - size - margin
        bubbleParams.y = bubbleParams.y.coerceIn(0, bounds.height() - size * 2)
        ValueAnimator.ofInt(bubbleParams.x, targetX).apply {
            duration = 180
            interpolator = DecelerateInterpolator()
            addUpdateListener {
                bubbleParams.x = it.animatedValue as Int
                if (shown) wm.updateViewLayout(bubble, bubbleParams)
            }
        }.start()
    }

    /** BOSS 到前台时显示气泡 */
    fun show() {
        if (shown) return
        wm.addView(bubble, bubbleParams)
        shown = true
    }

    /** 离开 BOSS 时隐藏气泡、速览卡与面板 */
    fun hide() {
        if (!shown) return
        card.hide()
        notice.hide()
        closePanel()
        wm.removeView(bubble)
        shown = false
    }

    fun sendTree(json: String) = web.bridge.emit("onTree", json)

    private fun openPanel() {
        if (expanded) return
        card.hide()
        panel.addView(web.view, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        wm.addView(panel, panelParams)
        expanded = true
        // 气泡移到面板上沿之外并保持在最上层，不遮挡面板内容，便于再次点按收起
        collapsedBubbleY = bubbleParams.y
        // 两个窗口的坐标都不含系统栏：面板贴着导航栏之上，气泡 y 从状态栏之下算起
        val metrics = wm.currentWindowMetrics
        val bars = metrics.windowInsets.getInsets(WindowInsets.Type.systemBars())
        val panelTop = metrics.bounds.height() - bars.bottom - panelParams.height
        bubbleParams.y = (panelTop - bars.top - dp(56)).coerceAtLeast(0)
        wm.removeView(bubble)
        wm.addView(bubble, bubbleParams)
    }

    override fun closePanel() {
        if (!expanded) return
        wm.removeView(panel)
        panel.removeView(web.view)
        expanded = false
        bubbleParams.y = collapsedBubbleY
        if (shown) wm.updateViewLayout(bubble, bubbleParams)
    }

    override fun setBubble(json: String) {
        bubbleJson = json
        bubble.render(json)
    }

    /** 系统切换深浅色时重绘原生部分；网页面板需重建 WebView 才会切换 */
    fun onConfigurationChanged() {
        applyPanelTheme()
        setBubble(bubbleJson)
        card.refreshTheme()
        if (Palette.isNight(service) != webNight) rebuildWeb()
    }

    override fun setCard(json: String) = card.render(json)

    override fun showNotice(text: String) = notice.show(text)

    override fun requestTree() = onRequestTree()

    fun destroy() {
        hide()
        web.destroy()
    }
}
