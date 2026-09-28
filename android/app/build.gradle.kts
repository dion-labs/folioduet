plugins { id("com.android.application") }
val keyPath = providers.environmentVariable("FOLIODUET_ANDROID_KEYSTORE").orNull
val releasePassword = providers.environmentVariable("FOLIODUET_ANDROID_KEYSTORE_PASSWORD").orNull
android {
    namespace = "ai.dionlabs.folioduet"
    compileSdk = 36
    defaultConfig {
        applicationId = "ai.dionlabs.folioduet"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }
    signingConfigs {
        if (keyPath != null && releasePassword != null) create("releaseKey") {
            storeFile = file(keyPath)
            storePassword = releasePassword
            keyAlias = "folioduet"
            this.keyPassword = releasePassword
        }
    }
    buildTypes {
        release { signingConfig = signingConfigs.findByName("releaseKey") }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
tasks.configureEach {
    if (name == "packageRelease" || name == "bundleRelease") doFirst {
        check(keyPath != null && releasePassword != null) { "Configure FolioDuet release signing outside Git." }
    }
}
dependencies { implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.3") }
