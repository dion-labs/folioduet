# FolioDuet Android 0.1.0 preview — prepared candidate

Android package with Folio launcher art, matching splash and system colors, canonical HTTPS deep links and the shared FolioDuet reading experience. Requires a compatible browser and network for first launch. APK and AAB are signed; private signing material stays outside Git.

The web candidate adds a parser comparison workbench and improves PDF.js single-column prose extraction using source geometry. Three independently typed manual spot references now retain the expected paragraphs/headings; private book content is excluded from source control and production assets. Experimental AnyDoc still has documented quality gaps.

Validation: current integrated checkout 257 tests passed, 1 optional fixture skipped; production web build passed; browser recovery 47 scenarios; Android release build/lint/signature and isolated guest/demo launch checked. Real Google sign-in, independent-account/device sync and physical audible playback are not certified.

Pending release steps: review this candidate, deploy the canonical-host certificate association with the web candidate, verify fullscreen on Android and run post-deployment live checks, then publish the appropriately labelled GitHub preview assets and update download links. No Instagram posting, Slack delivery, Play submission or production deployment has occurred.
