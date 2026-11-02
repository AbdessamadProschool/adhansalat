plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

/**
 * The web application is the single source of truth for prayer times, settings
 * and UI. This module wraps the production `dist/` build in a WebView and adds
 * the one thing a browser cannot do: real OS alarms.
 *
 * `syncWebAssets` and `syncRawAudio` copy files from the repository root at build
 * time, so the APK can never contain a stale copy of the web app or of the
 * bundled chimes.
 */
val repoRoot = rootProject.layout.projectDirectory.dir("..")
val webDist = repoRoot.dir("dist")
val audioSource = repoRoot.dir("public/audio")

val syncWebAssets by tasks.registering(Copy::class) {
    description = "Copies the Vite production build into the APK assets."
    val existingIndex = layout.projectDirectory.file("src/main/assets/web/index.html").asFile
    doFirst {
        if (!webDist.asFile.isDirectory) {
            if (existingIndex.exists()) {
                logger.lifecycle("syncWebAssets: using existing bundled web assets in src/main/assets/web/")
            } else {
                throw GradleException(
                    "dist/ is missing. Run `npm install && npm run build` at the repository root " +
                        "before building the APK.",
                )
            }
        }
    }
    onlyIf { webDist.asFile.isDirectory }
    from(webDist) { into("web") }
    into(layout.projectDirectory.dir("src/main/assets"))
}

val syncRawAudio by tasks.registering(Copy::class) {
    description = "Copies the bundled chimes and the verified CC0 Adhan into res/raw."
    val existingAdhan = layout.projectDirectory.file("src/main/res/raw/adhan_cc0.mp3").asFile
    doFirst {
        if (!audioSource.asFile.isDirectory) {
            if (existingAdhan.exists()) {
                logger.lifecycle("syncRawAudio: using existing audio in src/main/res/raw/")
            } else {
                throw GradleException(
                    "public/audio/ is missing: the APK would ship without any playable Adhan.",
                )
            }
        }
    }
    onlyIf { audioSource.asFile.isDirectory }
    from(audioSource) { include("*.wav") }
    from(audioSource.dir("adhan")) { include("adhan-cc0.mp3") }
    rename { it.replace('-', '_') }
    into(layout.projectDirectory.dir("src/main/res/raw"))
}

android {
    namespace = "app.azan.global"
    compileSdk = 36
    buildToolsVersion = "36.0.0"

    defaultConfig {
        applicationId = "app.azan.global"
        minSdk = 26
        targetSdk = 36
        versionCode = 3
        versionName = "1.2.0"

        // The web UI is already localized; keep the native shell to the same three
        // languages instead of shipping every Android translation.
        resourceConfigurations += listOf("fr", "en", "ar")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    androidResources {
        // MediaPlayer memory-maps its source. Keep WAV and the bundled MP3
        // uncompressed so a descriptor is always available at runtime.
        noCompress += listOf("wav", "mp3")
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}")
    }
}

tasks.named("preBuild") {
    dependsOn(syncWebAssets, syncRawAudio)
}

// `preBuild` is not guaranteed to run before resource/asset merging on every AGP
// version. A missing `R.raw.chime_*` would be a compile error and a missing
// `assets/web/index.html` would install as a blank app, so the merge tasks depend
// on the copies explicitly. The three WAV files are also committed under
// `res/raw/` so resource linking can never race the copy.
tasks.matching { it.name.startsWith("merge") && it.name.endsWith("Assets") }.configureEach {
    dependsOn(syncWebAssets)
}
tasks.matching { it.name.startsWith("merge") && it.name.endsWith("Resources") }.configureEach {
    dependsOn(syncRawAudio)
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.webkit:webkit:1.13.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
