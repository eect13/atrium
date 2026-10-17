# Atrium Android APK

Double-click `apk.bat` at the repo root (or this folder).

Needs:
- Node 22+
- Microsoft JDK 17 (`C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot`)
- Android SDK at `%LOCALAPPDATA%\Android\Sdk` + NDK
- Rust + the Android targets `aarch64-linux-android`, `armv7-linux-androideabi`, `i686-linux-android`, `x86_64-linux-android` (the packer adds missing ones)

Output (Card 246): `deploy/android/atrium-v*-universal-release.apk`, one release APK with all four ABIs
