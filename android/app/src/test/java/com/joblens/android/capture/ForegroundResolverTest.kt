package com.joblens.android.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ForegroundResolverTest {
    private val boss = "com.hpbr.bosszhipin"
    private val ime = "com.sohu.inputmethod.sogou.xiaomi"
    private val ignored = setOf(ime, "com.joblens.android")

    @Test
    fun keyboardPopupAboveBossDoesNotTakeForegroundWhilePanelHasFocus() {
        // 详情面板获得焦点：BOSS 窗口不再有焦点，输入法候选弹窗层级最高
        val windows = listOf(
            AppWindow(id = 1, packageName = boss, focused = false, layer = 10),
            AppWindow(id = 2, packageName = ime, focused = false, layer = 40),
        )
        assertEquals(boss, ForegroundResolver.resolve(windows, ignored)?.packageName)
    }

    @Test
    fun focusedAppWinsOverHigherLayer() {
        val windows = listOf(
            AppWindow(id = 1, packageName = boss, focused = false, layer = 30),
            AppWindow(id = 2, packageName = "com.miui.home", focused = true, layer = 10),
        )
        assertEquals("com.miui.home", ForegroundResolver.resolve(windows, ignored)?.packageName)
    }

    @Test
    fun unreadableRootsGiveNoAnswerInsteadOfAnotherApp() {
        val windows = listOf(AppWindow(id = 1, packageName = null, focused = true, layer = 10))
        assertNull(ForegroundResolver.resolve(windows, ignored))
    }
}
