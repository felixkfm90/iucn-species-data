plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Only the explicit local Play helper supplies these values to its child process.
// Ordinary debug builds neither read a password file nor require an upload key.
val playDistribution = System.getenv("ARTEN_PLAY_DISTRIBUTION")
val playStorePath = System.getenv("ARTEN_PLAY_STORE_FILE")
val playStorePassword = System.getenv("ARTEN_PLAY_STORE_PASSWORD")
val playKeyAlias = System.getenv("ARTEN_PLAY_KEY_ALIAS")
val playKeyPassword = System.getenv("ARTEN_PLAY_KEY_PASSWORD")
val privateSigningRoot = rootProject.projectDir.parentFile.parentFile
    .resolve("data/mobile-signing/runtime").canonicalFile
val playStore = playStorePath?.let { file(it) }
val playSigningComplete = playDistribution == "play" &&
    playKeyAlias == "arten-explorer-play-upload" &&
    !playStorePassword.isNullOrEmpty() && !playKeyPassword.isNullOrEmpty() &&
    playStore != null && playStore.isFile &&
    playStore.canonicalFile.parentFile == privateSigningRoot &&
    playStore.name.matches(Regex("upload-[0-9a-f]{32}\\.jks"))

// A release invocation must fail even when Gradle considers an old bundle up to date.
// There is intentionally no debug signing fallback and no key.properties reader.
gradle.taskGraph.whenReady {
    if (allTasks.any { it.project == project && it.name.contains("Release", ignoreCase = true) }) {
        check(playSigningComplete) {
            "ARTEN_PLAY_SIGNING_REQUIRED: use mobile/tool/build-play.ps1 -Build with the app's own upload signing."
        }
    }
}

android {
    namespace = "de.fnwildlifetravel.arten_explorer"
    compileSdk = 36
    buildToolsVersion = "36.0.0"
    ndkVersion = "28.2.13676358"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "de.fnwildlifetravel.arten_explorer"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = 26
        targetSdk = 36
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (playSigningComplete) {
            create("playUpload") {
                storeFile = playStore
                storePassword = playStorePassword
                keyAlias = playKeyAlias
                keyPassword = playKeyPassword
                storeType = "JKS"
            }
        }
    }

    buildTypes {
        release {
            if (playSigningComplete) {
                signingConfig = signingConfigs.getByName("playUpload")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

dependencies {
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
}

flutter {
    source = "../.."
}
