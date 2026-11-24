package com.joblens.android.overlay

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.view.View
import android.view.ViewOutlineProvider
import android.view.animation.LinearInterpolator
import com.joblens.android.ui.Palette
import org.json.JSONObject

/**
 * 悬浮按钮：浅色/深色底的圆片 + 细环形“表盘”。
 * - 出分后环形按分数填充，中间显示分数；
 * - 分析中环形上有一段旋转的弧（系统关闭动画时静止）；
 * - 其他状态显示品牌星标或简短文字，环形颜色表示状态。
 * 契约见 mobile/panel.tsx 的 BubbleState。
 */
class BubbleView(context: Context) : View(context) {
    private val density = resources.displayMetrics.density
    private fun dp(v: Float) = v * density

    private var kind = "idle"
    private var score: Int? = null
    private var stale = false

    private val ringWidth = dp(3f)
    private val ring = RectF()
    private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = ringWidth
    }
    private val arcPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = ringWidth
        strokeCap = Paint.Cap.ROUND
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        fontFeatureSettings = "tnum"
    }
    private val starPath = Path()

    private var spinAngle = 0f
    private val spinner = ValueAnimator.ofFloat(0f, 360f).apply {
        duration = 1000
        repeatCount = ValueAnimator.INFINITE
        interpolator = LinearInterpolator()
        addUpdateListener {
            spinAngle = it.animatedValue as Float
            invalidate()
        }
    }

    init {
        elevation = dp(6f)
        outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(view: View, outline: Outline) = outline.setOval(0, 0, view.width, view.height)
        }
        isClickable = true
        isFocusable = true
    }

    fun render(json: String) {
        val o = JSONObject(json)
        kind = o.optString("kind", "idle")
        score = if (o.isNull("score")) null else o.getInt("score")
        stale = o.optBoolean("stale")
        contentDescription = "JobLens：${o.optString("description")}"
        // 系统关闭动画（无障碍“移除动画”）时不旋转，只显示静止的弧
        if (kind == "busy" && ValueAnimator.areAnimatorsEnabled()) {
            if (!spinner.isStarted) spinner.start()
        } else {
            spinner.cancel()
        }
        invalidate()
    }

    override fun onDetachedFromWindow() {
        spinner.cancel()
        super.onDetachedFromWindow()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (kind == "busy" && ValueAnimator.areAnimatorsEnabled()) spinner.start()
    }

    override fun setPressed(pressed: Boolean) {
        super.setPressed(pressed)
        animate().scaleX(if (pressed) 0.92f else 1f).scaleY(if (pressed) 0.92f else 1f).setDuration(90).start()
    }

    override fun onDraw(canvas: Canvas) {
        val p = Palette.of(context)
        val cx = width / 2f
        val cy = height / 2f
        val radius = minOf(width, height) / 2f

        fillPaint.color = p.surface
        canvas.drawCircle(cx, cy, radius, fillPaint)

        val inset = ringWidth / 2 + dp(3f)
        ring.set(inset, inset, width - inset, height - inset)
        trackPaint.color = p.border
        canvas.drawOval(ring, trackPaint)

        val tone = when (kind) {
            "ready", "busy" -> p.primary
            "score" -> if (stale) p.warn else p.primary
            "setup", "truncated" -> p.warn
            "error" -> p.danger
            else -> p.muted
        }
        arcPaint.color = tone
        when (kind) {
            "score" -> canvas.drawArc(ring, -90f, 360f * (score ?: 0).coerceIn(0, 100) / 100f, false, arcPaint)
            "busy" -> canvas.drawArc(ring, spinAngle - 90f, 100f, false, arcPaint)
            "idle" -> Unit
            else -> canvas.drawOval(ring, arcPaint)
        }

        textPaint.color = tone
        when (kind) {
            "score" -> drawText(canvas, (score ?: 0).toString(), dp(15f), cx, cy)
            "truncated" -> drawText(canvas, "JD", dp(13f), cx, cy)
            "error" -> drawText(canvas, "!", dp(18f), cx, cy)
            else -> drawStar(canvas, cx, cy, radius * 0.42f, tone)
        }
    }

    private fun drawText(canvas: Canvas, text: String, size: Float, cx: Float, cy: Float) {
        textPaint.textSize = size
        val m = textPaint.fontMetrics
        canvas.drawText(text, cx, cy - (m.ascent + m.descent) / 2, textPaint)
    }

    /** 品牌星标（与设置页图标同形的四角星） */
    private fun drawStar(canvas: Canvas, cx: Float, cy: Float, r: Float, color: Int) {
        val k = r * 0.22f
        starPath.reset()
        starPath.moveTo(cx, cy - r)
        starPath.quadTo(cx + k, cy - k, cx + r, cy)
        starPath.quadTo(cx + k, cy + k, cx, cy + r)
        starPath.quadTo(cx - k, cy + k, cx - r, cy)
        starPath.quadTo(cx - k, cy - k, cx, cy - r)
        starPath.close()
        fillPaint.color = color
        canvas.drawPath(starPath, fillPaint)
    }
}
