plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.joblens.android"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.joblens.android"
        // 保留 OCR 兜底所需的 AccessibilityService.takeScreenshot（API 30）
        minSdk = 30
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
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
