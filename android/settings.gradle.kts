pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        // صورة أندرويد لـRobolectric (كبيرة) من مرآة Google لـMaven Central: أسرع ولا تُحدّ كالأصل
        maven("https://maven-central.storage-download.googleapis.com/maven2") { content { includeModule("org.robolectric", "android-all-instrumented") } }
        mavenCentral()
    }
}
rootProject.name = "mawred"
include(":app")
