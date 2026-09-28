# FolioDuet for Android

An Android Trusted Web Activity for the canonical FolioDuet reader. It shares the browser's renderer, Google authentication, word highlighting, voices, PDF engines, IndexedDB originals, settings and Firebase library behavior. It needs a compatible browser and an internet connection for first launch. It is not a standalone Kotlin reader or a bundled offline copy.

## Build

Use Java 21, Android SDK 36, and the checked-in Gradle wrapper:

    export JAVA_HOME=/path/to/jdk21
    export ANDROID_HOME=/path/to/android-sdk
    ./gradlew :app:assembleDebug :app:lintDebug

Release APK and AAB:

    ./scripts/build-release.sh

The release script creates a durable RSA signing key only on the first run in ~/.local/share/folioduet/signing, mode 0700; key and password files remain outside Git. Back up that directory securely before distributing the first release: later updates must use the same key. Set FOLIODUET_SIGNING_DIR to use an existing dedicated directory. The script refuses to replace a missing key when a prior password remains.

The package is ai.dionlabs.folioduet, version 0.1.0, minimum Android 8, target Android 16. APK is suitable for direct install; AAB is prepared for a future Play submission. No Play submission has been performed.

## Origin association

public/.well-known/assetlinks.json contains this direct-install release certificate's public SHA-256 fingerprint. It must be served at the canonical HTTPS host with HTTP 200, JSON MIME, and no redirect. Until verified, the browser correctly displays its toolbar. Do not bypass verification for a release. If using Play App Signing later, add the Play application-signing certificate as well; the upload key is not the installed app certificate.

The Android package intentionally uses Custom Tabs as its fallback, preserving supported authentication and speech behavior. It does not embed Google login inside a WebView.

## Validation

See docs/relaunch/android-parity.md for exercised and pending acceptance. Build/lint/signature checks and isolated API 36 emulator guest/demo rendering have passed. Fullscreen association, physical audible output, fresh Google sign-in and independent-account/device sync are not yet certified.

Official library: https://github.com/GoogleChrome/android-browser-helper (2.7.3).
