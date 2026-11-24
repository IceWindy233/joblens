package com.joblens.android.ui

import android.content.Context
import android.content.res.Configuration

/** DESIGN.md 的颜色 token（浅色 / 深色），供原生绘制的界面使用。 */
class Palette(
    val canvas: Int,
    val surface: Int,
    val border: Int,
    val fg: Int,
    val muted: Int,
    val primary: Int,
    val onPrimary: Int,
    val ok: Int,
    val okSoft: Int,
    val warn: Int,
    val warnSoft: Int,
    val danger: Int,
    val dangerSoft: Int,
) {
    companion object {
        private val light = Palette(
            0xFFF6F7F9.toInt(), 0xFFFFFFFF.toInt(), 0xFFE5E7EB.toInt(), 0xFF111827.toInt(), 0xFF5F6773.toInt(),
            0xFF0F766E.toInt(), 0xFFFFFFFF.toInt(), 0xFF15803D.toInt(), 0xFFF0FDF4.toInt(),
            0xFFB45309.toInt(), 0xFFFFFBEB.toInt(), 0xFFB91C1C.toInt(), 0xFFFEF2F2.toInt(),
        )
        private val dark = Palette(
            0xFF111418.toInt(), 0xFF181C21.toInt(), 0xFF2C333B.toInt(), 0xFFE7E9EC.toInt(), 0xFF9BA3AE.toInt(),
            0xFF2DD4BF.toInt(), 0xFF042F2E.toInt(), 0xFF4ADE80.toInt(), 0xFF0E2A1A.toInt(),
            0xFFFBBF24.toInt(), 0xFF2A2009.toInt(), 0xFFF87171.toInt(), 0xFF2C1517.toInt(),
        )

        fun isNight(context: Context): Boolean =
            context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES

        fun of(context: Context): Palette = if (isNight(context)) dark else light
    }
}
