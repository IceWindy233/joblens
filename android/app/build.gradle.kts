plugins {
    alias(libs.plugins.android.application)
}

// 版本号只维护一处：取根目录 package.json 的 version（与扩展一致）。
// versionCode = 主版本 × 10000 + 次版本 × 100 + 修订号，例如 0.3.0 → 300。
val appVersion: String = Regex("\"version\"\\s*:\\s*\"([^\"]+)\"")
    .find(rootProject.file("../package.json").readText())
    ?.groupValues?.get(1)
    ?: error("package.json 中没有 version")
val appVersionCode: Int = appVersion.substringBefore('-').split('.').map(String::toInt)
    .let { (major, minor, patch) -> major * 10000 + minor * 100 + patch }

// 正式签名：由 Release 工作流（或本地）通过环境变量提供；未提供时 release 构建产出未签名 APK
val releaseKeystore: String? = System.getenv("ANDROID_KEYSTORE_PATH")

android {
    namespace = "com.joblens.android"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.joblens.android"
        // 保留 OCR 兜底所需的 AccessibilityService.takeScreenshot（API 30）
        minSdk = 30
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersion
    }

    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = file(releaseKeystore)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    jvmToolchain(17)
}

// 悬浮面板与设置页复用仓库根目录的 TS/React 代码，构建前先产出网页资源到 assets/web
val buildWebAssets by tasks.registering(Exec::class) {
    workingDir = rootProject.projectDir.parentFile
    commandLine("pnpm", "run", "build:android-web")
}

tasks.named("preBuild") {
    dependsOn(buildWebAssets)
}

dependencies {
    implementation(libs.androidx.core)
    implementation(libs.androidx.webkit)
    testImplementation(libs.junit)
}
