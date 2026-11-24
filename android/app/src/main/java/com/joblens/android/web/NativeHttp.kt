package com.joblens.android.web

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * 代替 WebView 的 fetch 发出模型请求（第三方 API 通常不允许 WebView 来源跨域）。
 * 超时与取消由 JS 侧 AbortController 控制，这里只设兜底超时。
 */
object NativeHttp {
    private const val MAX_RESPONSE_BYTES = 2_000_000
    private const val BACKSTOP_TIMEOUT_MS = 180_000

    private val executor = Executors.newCachedThreadPool()
    private val inflight = ConcurrentHashMap<String, HttpURLConnection>()

    /** 与 llm/client.ts 的 validateBaseURL 一致：HTTPS，或本机 HTTP。 */
    private fun allowed(url: URL): Boolean =
        url.protocol == "https" || (url.protocol == "http" && (url.host == "localhost" || url.host == "127.0.0.1"))

    fun request(id: String, requestJson: String, done: (String) -> Unit, fail: (String) -> Unit) {
        executor.execute {
            try {
                val req = JSONObject(requestJson)
                val url = URL(req.getString("url"))
                if (!allowed(url)) throw IOException("只允许 HTTPS 或本机 HTTP 地址")
                val conn = url.openConnection() as HttpURLConnection
                inflight[id] = conn
                conn.requestMethod = req.getString("method")
                conn.connectTimeout = BACKSTOP_TIMEOUT_MS
                conn.readTimeout = BACKSTOP_TIMEOUT_MS
                val headers = req.optJSONObject("headers")
                headers?.keys()?.forEach { conn.setRequestProperty(it, headers.getString(it)) }
                val body = if (req.isNull("body")) null else req.getString("body")
                if (body != null) {
                    conn.doOutput = true
                    conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                }
                val status = conn.responseCode
                val stream = if (status >= 400) conn.errorStream else conn.inputStream
                val bytes = stream?.use { input ->
                    val out = java.io.ByteArrayOutputStream()
                    val chunk = ByteArray(16 * 1024)
                    while (true) {
                        val n = input.read(chunk)
                        if (n < 0) break
                        out.write(chunk, 0, n)
                        if (out.size() > MAX_RESPONSE_BYTES) throw IOException("响应过大")
                    }
                    out.toByteArray()
                } ?: ByteArray(0)
                val responseHeaders = JSONObject()
                conn.headerFields.forEach { (k, v) -> if (k != null) responseHeaders.put(k, v.joinToString(", ")) }
                done(
                    JSONObject()
                        .put("status", status)
                        .put("headers", responseHeaders)
                        .put("body", String(bytes, Charsets.UTF_8))
                        .toString(),
                )
            } catch (e: Exception) {
                fail("网络请求失败：${e.message ?: e.javaClass.simpleName}")
            } finally {
                inflight.remove(id)?.disconnect()
            }
        }
    }

    fun abort(id: String) {
        inflight.remove(id)?.disconnect()
    }
}
