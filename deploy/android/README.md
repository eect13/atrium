# Atrium Android APK

Double-click `apk.bat` at the repo root (or this folder).

Needs:
- Node 22+
- Microsoft JDK 17 (`C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot`)
- Android SDK at `%LOCALAPPDATA%\Android\Sdk` + NDK
- Rust + the Android targets `aarch64-linux-android`, `armv7-linux-androideabi`, `i686-linux-android`, `x86_64-linux-android` (the packer adds missing ones)

Output (Card 246): `deploy/android/atrium-v*-universal-release.apk`, one release APK with all four ABIs,
signed (Gradle release `signingConfig` if one is set, else `~/.android/debug.keystore`).
If no signature could be applied, the file is named `atrium-v*-universal-release-unsigned.apk` (Card 250),
is not installable as-is, and is not copied to Vibe Installers.
Both build paths check every ABI's `.so` for JNI exports first and stop with exit 1 if one has none.
