package com.joblens.android

import android.accessibilityservice.AccessibilityService
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import android.view.inputmethod.InputMethodManager
import androidx.core.content.ContextCompat
import com.joblens.android.capture.AppWindow
import com.joblens.android.capture.ForegroundResolver
import com.joblens.android.capture.NodeTreeDumper
import com.joblens.android.overlay.OverlayController
import org.json.JSONObject

/**
 * 只读：BOSS 直聘在前台时，在页面变化后（防抖）序列化当前 BOSS 窗口的节点树，交给悬浮面板里的
 * TS 解析器识别职位。不声明手势能力、不执行任何节点 action；非 BOSS 事件只用于判断前台应用。
 */
class JobLensService : AccessibilityService() {
    companion object {
        const val BOSS_PACKAGE = "com.hpbr.bosszhipin"
        private const val TREE_DEBOUNCE_MS = 400L
        /** 持续变化的页面（倒计时、动画）不能无限推迟读取 */
        private const val TREE_MAX_WAIT_MS = 1500L
    }

    private val main = Handler(Looper.getMainLooper())
    private val worker = HandlerThread("joblens-capture").apply { start() }
    private val workerHandler = Handler(worker.looper)
    private lateinit var overlay: OverlayController

    private var bossForeground = false
    /** 最近一次 BOSS 窗口状态变化的类名（通常是 Activity） */
    @Volatile private var bossWindowClass: String? = null
    private var treePendingSince = 0L

    private val checkForeground = Runnable { updateForeground() }
    private val pushTree = Runnable {
        treePendingSince = 0L
        workerHandler.post { dumpAndSend() }
    }

    /** 息屏立即收起；亮屏或解锁后重新判断（锁屏界面上不显示悬浮窗） */
    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == Intent.ACTION_SCREEN_OFF) setBossForeground(false) else updateForeground()
        }
    }

    override fun onServiceConnected() {
        overlay = OverlayController(this) { scheduleTree(immediate = true) }
        ContextCompat.registerReceiver(
            this,
            screenReceiver,
            IntentFilter().apply {
                addAction(Intent.ACTION_SCREEN_OFF)
                addAction(Intent.ACTION_SCREEN_ON)
                addAction(Intent.ACTION_USER_PRESENT)
            },
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        updateForeground()
    }

    override fun onInterrupt() = Unit

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if (::overlay.isInitialized) overlay.onConfigurationChanged()
    }

    override fun onUnbind(intent: Intent?): Boolean {
        main.removeCallbacksAndMessages(null)
        unregisterReceiver(screenReceiver)
        overlay.destroy()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        worker.quitSafely()
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        val type = event.eventType
        if (type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || type == AccessibilityEvent.TYPE_WINDOWS_CHANGED) {
            main.removeCallbacks(checkForeground)
            main.postDelayed(checkForeground, 250)
        }
        if (event.packageName?.toString() != BOSS_PACKAGE) return
        if (type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) bossWindowClass = event.className?.toString()
        if (bossForeground) {
            scheduleTree(immediate = false)
        } else if (!main.hasCallbacks(checkForeground)) {
            // 从桌面启动 BOSS 时，窗口切换那一刻可能仍读到桌面或启动动画的窗口；
            // 之后 BOSS 的任何事件都再判断一次（不重置计时，避免连续内容变化把判断一直推迟）
            main.postDelayed(checkForeground, 250)
        }
    }

    /** 前台应用窗口的根节点；判断规则见 ForegroundResolver。无法判断时返回 null。 */
    private fun foregroundApplicationRoot(): AccessibilityNodeInfo? {
        val roots = windows
            .filter { it.type == AccessibilityWindowInfo.TYPE_APPLICATION }
            .associate { it.id to (it to it.root) }
        val candidates = roots.values.map { (w, root) ->
            AppWindow(w.id, root?.packageName?.toString(), w.isFocused, w.layer)
        }
        val ignored = getSystemService(InputMethodManager::class.java)
            .enabledInputMethodList
            .mapTo(hashSetOf(packageName)) { it.packageName }
        val picked = ForegroundResolver.resolve(candidates, ignored) ?: return null
        return roots[picked.id]?.second
    }

    private fun updateForeground() {
        // 锁屏时一律不显示（锁屏界面上没有应用窗口，下面的“读不到时保持现状”会让悬浮窗留在锁屏上）
        if (getSystemService(KeyguardManager::class.java).isKeyguardLocked) {
            setBossForeground(false)
            return
        }
        // 读不到前台窗口时保持现状，避免悬浮窗在系统窗口切换的瞬间被误收起
        val root = foregroundApplicationRoot() ?: return
        setBossForeground(root.packageName?.toString() == BOSS_PACKAGE)
    }

    private fun setBossForeground(isBoss: Boolean) {
        if (isBoss == bossForeground) return
        bossForeground = isBoss
        if (isBoss) {
            overlay.show()
            scheduleTree(immediate = true)
        } else {
            overlay.hide()
        }
    }

    private fun scheduleTree(immediate: Boolean) {
        val now = SystemClock.uptimeMillis()
        if (treePendingSince == 0L) treePendingSince = now
        main.removeCallbacks(pushTree)
        val delay = if (immediate || now - treePendingSince >= TREE_MAX_WAIT_MS) 0L else TREE_DEBOUNCE_MS
        main.postDelayed(pushTree, delay)
    }

    /** worker 线程：读取前台 BOSS 窗口的节点树并推送给面板。 */
    private fun dumpAndSend() {
        val root = foregroundApplicationRoot() ?: return
        if (root.packageName?.toString() != BOSS_PACKAGE) return
        val json = JSONObject()
            .put("windowClass", bossWindowClass ?: JSONObject.NULL)
            .put("root", NodeTreeDumper.dump(root))
            .toString()
        main.post { overlay.sendTree(json) }
    }
}
