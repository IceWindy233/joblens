package com.joblens.android.web

import android.content.Context
import java.io.File
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArraySet

/**
 * storage/index.ts 的 StorageBackend 在 Android 上的实现，进程内唯一。
 * local：应用私有目录下每个键一个 JSON 文件（与扩展的 chrome.storage.local 一样未加密）。
 * session：仅存于内存，进程结束即清空（对应 chrome.storage.session）。
 */
object NativeStorage {
    private lateinit var dir: File
    private val session = ConcurrentHashMap<String, String>()
    private val listeners = CopyOnWriteArraySet<() -> Unit>()

    @Synchronized
    fun init(context: Context) {
        if (!::dir.isInitialized) dir = File(context.applicationContext.filesDir, "store").apply { mkdirs() }
    }

    private fun file(key: String) = File(dir, URLEncoder.encode(key, "UTF-8") + ".json")

    @Synchronized
    fun get(area: String, key: String): String? = when (area) {
        "local" -> file(key).takeIf { it.exists() }?.readText()
        "session" -> session[key]
        else -> throw IllegalArgumentException("unknown storage area $area")
    }

    fun set(area: String, key: String, json: String) {
        synchronized(this) {
            when (area) {
                "local" -> {
                    val tmp = File(dir, file(key).name + ".tmp")
                    tmp.writeText(json)
                    if (!tmp.renameTo(file(key))) throw IllegalStateException("写入失败：$key")
                }
                "session" -> session[key] = json
                else -> throw IllegalArgumentException("unknown storage area $area")
            }
        }
        notifyChanged()
    }

    fun remove(area: String, key: String) {
        synchronized(this) {
            when (area) {
                "local" -> file(key).delete()
                "session" -> session.remove(key)
                else -> throw IllegalArgumentException("unknown storage area $area")
            }
        }
        notifyChanged()
    }

    fun clear(area: String) {
        synchronized(this) {
            when (area) {
                "local" -> dir.listFiles()?.forEach { it.delete() }
                "session" -> session.clear()
                else -> throw IllegalArgumentException("unknown storage area $area")
            }
        }
        notifyChanged()
    }

    fun addListener(listener: () -> Unit) {
        listeners.add(listener)
    }

    fun removeListener(listener: () -> Unit) {
        listeners.remove(listener)
    }

    private fun notifyChanged() {
        for (l in listeners) l()
    }
}
