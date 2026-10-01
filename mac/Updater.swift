import AppKit
import Foundation

/// Checks GitHub Releases on launch and, when asked, swaps in the newer app from the release's DMG.
@MainActor @Observable
final class Updater {
  static let shared = Updater()

  struct Release: Decodable {
    struct Asset: Decodable {
      let name: String
      let browser_download_url: URL
    }
    let tag_name: String
    let html_url: URL
    let assets: [Asset]
  }

  var available: Release?
  var installing = false
  var progress: Foundation.Progress?

  func check() async {
    let url = URL(string: "https://api.github.com/repos/letstri/youtube-downloader/releases/latest")!
    let current = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    guard let (data, _) = try? await URLSession.shared.data(from: url),
      let release = try? JSONDecoder().decode(Release.self, from: data),
      isNewer(release.tag_name, than: current)
    else { return }
    available = release
  }

  func install() async {
    guard let release = available else { return }
    let app = Bundle.main.bundlePath
    // A translocated app (run straight from a downloaded DMG) lives on a read-only path, so it cannot replace itself.
    guard let dmg = release.assets.first(where: { $0.name.hasSuffix(".dmg") }), !app.contains("/AppTranslocation/")
    else {
      NSWorkspace.shared.open(release.html_url)
      return
    }

    installing = true
    do {
      let file = FileManager.default.temporaryDirectory.appendingPathComponent("youtube-downloader-update.dmg")
      try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
        let task = URLSession.shared.downloadTask(with: dmg.browser_download_url) { downloaded, _, error in
          // The downloaded file is deleted when this handler returns, so move it now.
          do {
            guard let downloaded else { throw error ?? URLError(.unknown) }
            try? FileManager.default.removeItem(at: file)
            try FileManager.default.moveItem(at: downloaded, to: file)
            done.resume()
          } catch {
            done.resume(throwing: error)
          }
        }
        progress = task.progress
        task.resume()
      }

      // Runs after this app quits: mount the DMG, replace the app, relaunch.
      let script = """
        set -e
        while kill -0 "$1" 2>/dev/null; do sleep 0.2; done
        mnt=$(mktemp -d)
        hdiutil attach -nobrowse -readonly -noverify -mountpoint "$mnt" "$2" >/dev/null
        new=$(find "$mnt" -maxdepth 1 -name '*.app' | head -n 1)
        ditto "$new" "$3.new"
        hdiutil detach "$mnt" >/dev/null
        rm -rf "$3"
        mv "$3.new" "$3"
        rm -f "$2"
        open "$3"
        """
      let p = Process()
      p.executableURL = URL(fileURLWithPath: "/bin/sh")
      p.arguments = ["-c", script, "sh", String(ProcessInfo.processInfo.processIdentifier), file.path, app]
      try p.run()
      NSApp.terminate(nil)
    } catch {
      installing = false
      progress = nil
      NSWorkspace.shared.open(release.html_url)
    }
  }
}
