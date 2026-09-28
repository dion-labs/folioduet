#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${JAVA_HOME:=/opt/homebrew/opt/openjdk@21}"
: "${ANDROID_HOME:=$HOME/Library/Android/sdk}"
export JAVA_HOME ANDROID_HOME
signing_dir="${FOLIODUET_SIGNING_DIR:-$HOME/.local/share/folioduet/signing}"
mkdir -p "$signing_dir"
chmod 700 "$signing_dir"
export FOLIODUET_ANDROID_KEYSTORE="$signing_dir/release.jks"
password_file="$signing_dir/password"
if [[ ! -f "$FOLIODUET_ANDROID_KEYSTORE" ]]; then
  [[ ! -e "$password_file" ]] || { echo 'Existing signing password without key; restore the key before continuing.' >&2; exit 1; }
  (umask 077; /usr/bin/openssl rand -hex 32 > "$password_file")
  "$JAVA_HOME/bin/keytool" -genkeypair -keystore "$FOLIODUET_ANDROID_KEYSTORE" -storepass:file "$password_file" -keypass:file "$password_file" -alias folioduet -keyalg RSA -keysize 4096 -validity 10000 -dname 'CN=FolioDuet, O=Dion Labs' >/dev/null 2>&1
  chmod 600 "$FOLIODUET_ANDROID_KEYSTORE"
fi
export FOLIODUET_ANDROID_KEYSTORE_PASSWORD="$(cat "$password_file")"
./gradlew --no-daemon :app:assembleRelease :app:bundleRelease :app:lintRelease
unset FOLIODUET_ANDROID_KEYSTORE_PASSWORD
