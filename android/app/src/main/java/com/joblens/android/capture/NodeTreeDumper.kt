package com.joblens.android.capture

import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject

/** 把无障碍节点树序列化为 JSON；字段约定见 adapters/boss-app/parse.ts 的 AppNode。 */
object NodeTreeDumper {
    private const val MAX_NODES = 6000
    private const val MAX_DEPTH = 80

    fun dump(root: AccessibilityNodeInfo): JSONObject {
        var count = 0
        val rect = Rect()
        fun node(n: AccessibilityNodeInfo, depth: Int): JSONObject {
            count += 1
            val o = JSONObject()
            n.className?.let { o.put("cls", it.toString()) }
            n.viewIdResourceName?.let { o.put("id", it) }
            n.text?.let { o.put("text", it.toString()) }
            n.contentDescription?.let { o.put("desc", it.toString()) }
            n.getBoundsInScreen(rect)
            o.put("b", "${rect.left},${rect.top},${rect.right},${rect.bottom}")
            if (!n.isVisibleToUser) o.put("offscreen", true)
            if (n.childCount > 0 && depth < MAX_DEPTH) {
                val children = JSONArray()
                for (i in 0 until n.childCount) {
                    if (count >= MAX_NODES) break
                    n.getChild(i)?.let { children.put(node(it, depth + 1)) }
                }
                o.put("children", children)
            }
            return o
        }
        return node(root, 0)
    }
}
