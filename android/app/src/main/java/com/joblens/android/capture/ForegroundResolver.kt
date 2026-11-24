package com.joblens.android.capture

/** 一个 TYPE_APPLICATION 无障碍窗口的判定所需信息；packageName 为 null 表示根节点暂时读不到 */
data class AppWindow(val id: Int, val packageName: String?, val focused: Boolean, val layer: Int)

/**
 * 判断当前前台应用窗口。
 *
 * - 有输入焦点的应用窗口优先；JobLens 详情面板获得焦点时没有应用窗口有焦点，退而取层级最高的。
 * - 输入法的候选/剪贴板弹窗是挂在输入法上的子窗口，无障碍同样报告为 TYPE_APPLICATION 且层级最高，
 *   必须排除，否则在面板里一点输入框就会被误判为离开了 BOSS。
 * - 根节点读不到的窗口不参与判断；全部读不到时返回 null，调用方应保持现状而不是隐藏悬浮窗。
 */
object ForegroundResolver {
    fun resolve(windows: List<AppWindow>, ignoredPackages: Set<String>): AppWindow? {
        val candidates = windows.filter { it.packageName != null && it.packageName !in ignoredPackages }
        return candidates.firstOrNull { it.focused } ?: candidates.maxByOrNull { it.layer }
    }
}
