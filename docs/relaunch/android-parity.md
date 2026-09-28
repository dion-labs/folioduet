# Android acceptance ledger

Architecture candidate: Android Trusted Web Activity using the canonical HTTPS reader and Android Browser Helper 2.7.3. The browser renders the same reader, parser, Firebase flows, TTS, preferences and local originals as web. This avoids splitting parsing into a second implementation. The APK needs a compatible installed browser. First launch requires network; cached offline behavior is governed by the website service worker. This is not a bundled native/offline reader.

Official implementation references: https://developer.chrome.com/docs/android/trusted-web-activity/integration-guide and https://github.com/GoogleChrome/android-browser-helper.

| Capability | Implementation | Acceptance evidence |
| --- | --- | --- |
| Guest library, PDF/Markdown import | Shared web reader / system browser file picker | Pending Android run |
| PDF.js + AnyDoc / highlighting / navigation | Shared production implementation | Web baseline 249 passed, 1 skipped; Android pending |
| Google login, guest linking, sync | Browser Firebase flow with existing origin storage | Real-account gate pending |
| Fish/Inworld/system voice | Shared web playback and browser speech synthesis | Android audible gate pending |
| Themes, type scale, reading focus | Shared responsive design | Visual emulator gate pending |
| Original local retention/export | Browser IndexedDB/downloads | Android gate pending |
| Back, external links, deep links | Browser/TWA integration | Pending |
| Fullscreen verified origin | Digital Asset Links binds release certificate | Production association pending |
| Release APK and AAB | Gradle, durable external signing key | Pending |

Do not call the APK feature-parity certified until the Android rows are exercised. A release cannot conceal an unverified-origin browser toolbar; no validation bypass belongs in production.

## 2026-09-28 candidate evidence

- Gradle assembleRelease + bundleRelease + lintRelease: PASS (0 lint errors; toolchain-version / obsolete-resource warnings only).
- APK signature: v2 verified, RSA 4096, CN=FolioDuet/O=Dion Labs. Public SHA-256 fingerprint recorded in public/.well-known/assetlinks.json.
- Isolated API 36 emulator: install, cold launch, guest home, demo reading, automatic page progress and browser speech API presence observed. This is emulator behavior, not audible/physical certification.
- Host GPU caused Chromium native crashes; restarting the disposable emulator with software rendering and Vulkan disabled recovered rendering. No physical device was touched.
- Initial app launch failures (missing ManageDataLauncherActivity, incorrect splash provider path) were fixed and the signed artifact rebuilt before the successful run.
- Screenshot and runtime evidence are retained under ignored local-evals/relaunch-2026-09-28/android.
- Fullscreen association remains pending website deployment. Google account login/linking and cross-device sync remain unrun. The candidate must be described as an Android preview until these gates pass.
