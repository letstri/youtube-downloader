#!/bin/sh
# Builds mac/build/youtube-downloader.dmg for Apple Silicon Macs.
# Downloads are cached in mac/build/cache; delete it to pick up a newer yt-dlp or ffmpeg.
set -eu
cd "$(dirname "$0")/.."

NODE_VERSION=v26.10.0
OUT=mac/build
APP="$OUT/YouTube Downloader.app"
DMG=$OUT/youtube-downloader.dmg
RES=$APP/Contents/Resources
CACHE=$OUT/cache

mkdir -p "$OUT"
swiftc -swift-version 5 -parse-as-library mac/Core.swift mac/CoreTests.swift -o "$OUT/core-tests"
"$OUT/core-tests"

rm -rf "$APP" "$OUT/dmg" "$DMG" "$OUT/AppIcon.iconset"
mkdir -p "$APP/Contents/MacOS" "$RES/bin" "$CACHE"

fetch() { [ -f "$CACHE/$2" ] || curl -fL --retry 3 -o "$CACHE/$2" "$1"; }
fetch "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-darwin-arm64.tar.gz" node.tgz
fetch https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos yt-dlp
fetch https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip ffmpeg.zip
fetch https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffprobe.zip ffprobe.zip

tar -xzf "$CACHE/node.tgz" -C "$RES/bin" --strip-components=2 "node-$NODE_VERSION-darwin-arm64/bin/node"
cp "$CACHE/yt-dlp" "$RES/bin/yt-dlp"
unzip -oq "$CACHE/ffmpeg.zip" -d "$RES/bin"
unzip -oq "$CACHE/ffprobe.zip" -d "$RES/bin"
chmod +x "$RES/bin/"*

swiftc -O -swift-version 5 -parse-as-library -target arm64-apple-macos26.0 \
  mac/App.swift mac/Core.swift -o "$APP/Contents/MacOS/youtube-downloader"
cp mac/Info.plist "$APP/Contents/Info.plist"

mkdir "$OUT/AppIcon.iconset"
for size in 16 32 128 256 512; do
  sips -z $size $size mac/AppIcon.png --out "$OUT/AppIcon.iconset/icon_${size}x${size}.png" >/dev/null
  sips -z $((size * 2)) $((size * 2)) mac/AppIcon.png --out "$OUT/AppIcon.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$OUT/AppIcon.iconset" -o "$RES/AppIcon.icns"
rm -rf "$OUT/AppIcon.iconset"

# Apple Silicon refuses unsigned binaries; ad-hoc sign whatever is not signed yet.
for f in "$RES/bin/"*; do codesign -s - "$f" 2>/dev/null || true; done
codesign --force -s - "$APP"

mkdir "$OUT/dmg"
cp -R "$APP" "$OUT/dmg/"
ln -s /Applications "$OUT/dmg/Applications"
hdiutil create -volname "YouTube Downloader" -srcfolder "$OUT/dmg" -ov -format UDZO "$DMG"
rm -rf "$OUT/dmg"
echo "Built $DMG"
