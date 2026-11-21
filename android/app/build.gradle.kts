import groovy.json.JsonSlurper

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

val specDir = rootProject.file("../spec")
fun prop(name: String, env: String): String = (findProperty(name) as String?) ?: System.getenv(env) ?: ""

// توليد رموز التصميم من spec/design-tokens.json (مصدر واحد مع الويب)
val generateTokens by tasks.registering {
    val input = File(specDir, "design-tokens.json")
    val outDir = layout.buildDirectory.dir("generated/tokens/kotlin")
    inputs.file(input)
    outputs.dir(outDir)
    doLast {
        @Suppress("UNCHECKED_CAST")
        val json = JsonSlurper().parse(input) as Map<String, Any>
        @Suppress("UNCHECKED_CAST")
        val colors = json["color"] as Map<String, List<String>>
        val body = colors.entries.joinToString("\n") { (k, v) -> "    val $k = \"${v[0]}\" to \"${v[1]}\"" }
        val dir = outDir.get().asFile.resolve("com/mawred/app/ui/theme").apply { mkdirs() }
        dir.resolve("DesignTokens.kt").writeText("package com.mawred.app.ui.theme\n\n/** مولّد من spec/design-tokens.json — لا تعدّله يدوياً. (فاتح، داكن) بصيغة OKLCH */\nobject DesignTokens {\n$body\n}\n")
    }
}

android {
    namespace = "com.mawred.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.mawred.app"
        minSdk = 26
        targetSdk = 36
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = providers.gradleProperty("VERSION_NAME").get()
        buildConfigField("String", "API_URL", "\"${prop("mawred.apiUrl", "MAWRED_API_URL")}\"")
        buildConfigField("String", "FIREBASE_API_KEY", "\"${prop("mawred.firebaseApiKey", "MAWRED_FIREBASE_API_KEY")}\"")
        buildConfigField("String", "UPDATE_REPO", "\"Dev-saged/Morud\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    val storeFile = System.getenv("SIGNING_STORE_FILE")
    signingConfigs {
        if (storeFile != null) create("release") {
            this.storeFile = file(storeFile)
            storePassword = System.getenv("SIGNING_STORE_PASSWORD")
            keyAlias = System.getenv("SIGNING_KEY_ALIAS")
            keyPassword = System.getenv("SIGNING_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (storeFile != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true; buildConfig = true }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/specAssets"))
    sourceSets["main"].java.srcDir(layout.buildDirectory.dir("generated/tokens/kotlin"))
    testOptions { unitTests.isReturnDefaultValues = true }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    androidResources { localeFilters += "ar" }
}

// نسخ ملفات spec المطلوبة إلى assets
val copySpec by tasks.registering(Copy::class) {
    from(specDir) { include("order-states.json", "roles.json", "permissions.json") }
    into(layout.buildDirectory.dir("generated/specAssets/spec"))
}

tasks.named("preBuild") { dependsOn(generateTokens, copySpec) }

ksp { arg("room.schemaLocation", "$projectDir/schemas") }

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.foundation)
    implementation(libs.compose.animation)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.okhttp)
    implementation(libs.datastore.preferences)
    implementation(libs.work.runtime)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
}
