// Versions pinned for a 2026 Play submission: targetSdk 36 is required for new
// apps after August 2026, and AGP 8.11.x is the first line that supports it.
// The project is still NOT compiled in this repository's environment (no JDK,
// Android SDK or Gradle distribution available).
plugins {
    id("com.android.application") version "8.11.1" apply false
    id("org.jetbrains.kotlin.android") version "2.1.20" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.20" apply false
}
