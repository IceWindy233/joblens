package com.joblens.android.setup

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import android.widget.Toast
import com.joblens.android.JobLensService
import org.json.JSONArray
import org.json.JSONObject

/** 一项检查的状态。MANUAL：系统不提供查询接口，只能由用户设置后手动确认。 */
enum class CheckState { OK, MISSING, MANUAL }

/** 跳转设置的按钮；intents 依次尝试，直到有一个能打开（不同 ROM 的设置页位置不同） */
class CheckAction(val label: String, val intents: List<Intent>)

class SetupCheck(
    val id: String,
    val title: String,
    val description: String,
    val state: CheckState,
    val required: Boolean,
    val actions: List<CheckAction>,
)

/**
 * 权限与运行环境检查，由设置页“权限与运行”分区通过 NativeBridge 读取。能检测的直接检测；
 * 小米/HyperOS 的自启动和多任务加锁没有公开接口，只能引导到对应设置页并由用户确认。
 * 模型与档案是否就绪由设置页自己判断。
 */
object SetupChecks {
    private const val PREFS = "setup"
    private const val KEY_FIRST_RUN_SHOWN = "firstRunShown"

    fun isXiaomi(): Boolean = Build.MANUFACTURER.equals("Xiaomi", ignoreCase = true)

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** 首次启动返回 true（之后都返回 false），设置页据此直接打开权限检查分区 */
    fun consumeFirstRun(context: Context): Boolean {
        val prefs = prefs(context)
        if (prefs.getBoolean(KEY_FIRST_RUN_SHOWN, false)) return false
        prefs.edit().putBoolean(KEY_FIRST_RUN_SHOWN, true).apply()
        return true
    }

    private fun isConfirmed(context: Context, id: String): Boolean = prefs(context).getBoolean("confirmed:$id", false)

    fun setConfirmed(context: Context, id: String, confirmed: Boolean) =
        prefs(context).edit().putBoolean("confirmed:$id", confirmed).apply()

    private fun appDetails(context: Context) =
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))

    private fun accessibilityEnabled(context: Context): Boolean =
        context.getSystemService(AccessibilityManager::class.java)
            .getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
            .any { it.resolveInfo.serviceInfo.packageName == context.packageName }

    private fun bossInstalled(context: Context): Boolean = try {
        context.packageManager.getPackageInfo(JobLensService.BOSS_PACKAGE, 0)
        true
    } catch (_: PackageManager.NameNotFoundException) {
        false
    }

    /** 契约见 platform/index.ts 的 SetupCheck */
    fun toJson(context: Context): String = JSONArray(
        collect(context).map { check ->
            JSONObject()
                .put("id", check.id)
                .put("title", check.title)
                .put("description", check.description)
                .put("state", check.state.name.lowercase())
                .put("required", check.required)
                .put("confirmed", check.state == CheckState.MANUAL && isConfirmed(context, check.id))
                .put("actions", JSONArray(check.actions.map { it.label }))
        },
    ).toString()

    /** 依次尝试该按钮的跳转目标；都打不开时提示用户手动前往 */
    fun runAction(context: Context, id: String, index: Int) {
        val action = collect(context).firstOrNull { it.id == id }?.actions?.getOrNull(index) ?: return
        for (intent in action.intents) {
            try {
                context.startActivity(if (context is Activity) intent else Intent(intent).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return
            } catch (_: ActivityNotFoundException) {
            } catch (_: SecurityException) {
            }
        }
        Toast.makeText(context, "无法打开该设置页，请在系统设置中手动查找", Toast.LENGTH_LONG).show()
    }

    private fun collect(context: Context): List<SetupCheck> {
        val checks = mutableListOf<SetupCheck>()
        val a11y = accessibilityEnabled(context)
        checks += SetupCheck(
            id = "accessibility",
            title = "无障碍服务",
            description = "开启「JobLens 职位助手」。它只在 BOSS 直聘位于前台时读取页面文字，不会点击、滑动或发送。" +
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    "\n若开关是灰色或提示“受限设置”：先到“应用信息”，点右上角菜单选择“允许受限设置”，再回来开启。"
                } else {
                    ""
                },
            state = if (a11y) CheckState.OK else CheckState.MISSING,
            required = true,
            actions = listOf(
                CheckAction("开启无障碍", listOf(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))),
                CheckAction("应用信息", listOf(appDetails(context))),
            ),
        )

        // 小米/HyperOS 的“省电策略：无限制”就是系统的忽略电池优化，同一个开关，只列一项
        val ignoringBattery = context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName)
        val xiaomi = isXiaomi()
        val requestIgnore = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}"))
        checks += SetupCheck(
            id = "battery",
            title = if (xiaomi) "省电策略：无限制" else "电池优化",
            description = if (xiaomi) {
                "小米/HyperOS 会冻结后台应用，表现为从桌面打开 BOSS 时悬浮按钮不出现。把 JobLens 的省电策略设为“无限制”。"
            } else {
                "关闭对 JobLens 的电池优化，减少系统在后台回收无障碍服务。"
            },
            state = if (ignoringBattery) CheckState.OK else CheckState.MISSING,
            required = false,
            actions = listOf(
                if (xiaomi) {
                    CheckAction(
                        "设为无限制",
                        listOf(
                            requestIgnore,
                            Intent()
                                .setComponent(ComponentName("com.miui.powerkeeper", "com.miui.powerkeeper.ui.HiddenAppsConfigActivity"))
                                .putExtra("package_name", context.packageName)
                                .putExtra("package_label", context.applicationInfo.loadLabel(context.packageManager)),
                            appDetails(context),
                        ),
                    )
                } else {
                    CheckAction("关闭电池优化", listOf(requestIgnore, Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)))
                },
            ),
        )

        if (xiaomi) {
            checks += SetupCheck(
                id = "miuiAutostart",
                title = "自启动",
                description = "允许 JobLens 自启动，手机重启或进程被清理后无障碍服务才能自动恢复。",
                state = CheckState.MANUAL,
                required = false,
                actions = listOf(
                    CheckAction(
                        "打开自启动管理",
                        listOf(
                            Intent().setComponent(
                                ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
                            ),
                            appDetails(context),
                        ),
                    ),
                ),
            )
            checks += SetupCheck(
                id = "miuiRecentsLock",
                title = "多任务界面加锁",
                description = "打开多任务界面，长按（或下拉）JobLens 的卡片并点锁形图标，避免一键清理时被关闭。",
                state = CheckState.MANUAL,
                required = false,
                actions = emptyList(),
            )
        }

        checks += SetupCheck(
            id = "boss",
            title = "BOSS 直聘",
            description = if (bossInstalled(context)) "已安装。" else "未检测到 BOSS 直聘 APP，请先安装。",
            state = if (bossInstalled(context)) CheckState.OK else CheckState.MISSING,
            required = true,
            actions = emptyList(),
        )
        return checks
    }
}
