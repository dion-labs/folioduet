# FolioDuet Android 0.1.0 preview

Android package with Folio launcher art, matching splash and system colors, canonical HTTPS deep links and the shared FolioDuet reading experience. Requires a compatible browser and network for first launch. APK and AAB are signed; private signing material stays outside Git.

The web candidate adds a parser comparison workbench and improves PDF.js single-column prose extraction using source geometry. Three independently typed manual spot references now retain the expected paragraphs/headings; private book content is excluded from source control and production assets. Experimental AnyDoc still has documented quality gaps.

Validation: current integrated checkout 257 tests passed, 1 optional fixture skipped; production web build passed; browser recovery 47 scenarios; Android release build/lint/signature and isolated guest/demo launch checked. Real Google sign-in, independent-account/device sync and physical audible playback are not certified.

Production web deployment and certificate association are verified, including fullscreen Android emulator launch and post-deployment live checks. GitHub preview assets are published separately under android-v0.1.0. Download links are in README.md and android/README.md. No Instagram posting, Slack delivery or Play submission has occurred.

Source isolation: the committed candidate alone passes 192 tests, 1 optional skip, and builds. The 257-test/47-browser results above include preserved earlier uncommitted reader improvements. Do not attribute that broader coverage to a deployment of the isolated commit.
