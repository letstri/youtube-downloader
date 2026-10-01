import AppKit
import SwiftUI

@main
struct DownloaderApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate

  var body: some Scene {
    Window("YouTube Downloader", id: "main") {
      ContentView(model: .shared)
    }
    .windowResizability(.contentSize)
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

  func applicationWillTerminate(_ note: Notification) {
    MainActor.assumeIsolated { Downloader.shared.cancel() }
  }
}

struct Info: Decodable, Equatable {
  var title: String?
  var duration: Double?
  var thumbnail: String?
  var uploader: String?
}

struct Running: Equatable {
  var stage = "Starting"
  var percent: Double?
  var speed: Double?
  var eta: Double?
  var step = 0
}

enum JobState: Equatable {
  case idle
  case running(Running)
  case done(URL)
  case failed(String)
}

@MainActor @Observable
final class Downloader {
  static let shared = Downloader()

  var url = ""
  var mode = Mode.max
  var cut = false
  var clipStart = ""
  var clipEnd = ""
  var info: Info?
  var infoLoading = false
  var state = JobState.idle

  var isRunning: Bool {
    if case .running = state { true } else { false }
  }

  @ObservationIgnored private var job: Process?
  @ObservationIgnored private var jobID = UUID()
  @ObservationIgnored private var lookup: Task<Void, Never>?
  @ObservationIgnored private var lookupProcess: Process?

  func lookUp() {
    lookup?.cancel()
    lookupProcess?.terminate()
    info = nil
    let link = url.trimmingCharacters(in: .whitespaces)
    guard let parsed = URL(string: link), ["http", "https"].contains(parsed.scheme), parsed.host != nil else {
      infoLoading = false
      return
    }
    infoLoading = true
    lookup = Task {
      try? await Task.sleep(for: .milliseconds(500))
      if Task.isCancelled { return }
      var lines: [String] = []
      _ = await runYtDlp(
        ["--no-playlist", "--skip-download", "--no-warnings", "--print", "%(.{title,duration,thumbnail,uploader})j", "--", link],
        onLine: { lines.append($0) },
        started: { self.lookupProcess = $0 })
      if Task.isCancelled { return }
      info = lines.first.flatMap { try? JSONDecoder().decode(Info.self, from: Data($0.utf8)) }
      infoLoading = false
    }
  }

  func start() {
    let clip: [String]
    do {
      clip = cut ? try clipArgs(parseTime(clipStart), parseTime(clipEnd)) : []
    } catch {
      state = .failed(error.localizedDescription)
      return
    }
    let id = UUID()
    jobID = id
    state = .running(Running())
    Task { await download(url.trimmingCharacters(in: .whitespaces), clip, id) }
  }

  func cancel() {
    jobID = UUID()
    state = .idle
    job?.terminate()
  }

  private func download(_ link: String, _ clip: [String], _ id: UUID) async {
    let fm = FileManager.default
    let dir = fm.temporaryDirectory.appendingPathComponent("dl-\(id.uuidString)")
    try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
    defer { try? fm.removeItem(at: dir) }

    let args =
      mode.args + clip + [
        "--no-playlist", "--newline", "--progress-template", progressTemplate,
        "-o", dir.path + "/%(title)s.%(ext)s", "--", link,
      ]
    let (code, stderr) = await runYtDlp(
      args,
      onLine: { line in if self.jobID == id { self.handle(line) } },
      started: { self.job = $0 })
    guard jobID == id else { return }
    job = nil

    guard code == 0 else {
      state = .failed(friendlyError(stderr))
      return
    }
    let produced = (try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil))?
      .first { !$0.lastPathComponent.hasPrefix(".") }
    guard let produced else {
      state = .failed("yt-dlp finished but produced no file.")
      return
    }
    do {
      let dest = uniqueDownload(produced.lastPathComponent)
      try fm.moveItem(at: produced, to: dest)
      state = .done(dest)
    } catch {
      state = .failed(error.localizedDescription)
    }
  }

  private func handle(_ line: String) {
    guard case .running(var r) = state else { return }
    if let p = parseProgress(line) {
      r.percent = p.percent
      r.speed = p.speed
      r.eta = p.eta
      r.stage = r.step > 1 ? "Downloading stream \(r.step)" : "Downloading"
    } else if line.contains("Destination:") {
      r.step += 1
    } else if line.contains("[Merger]") {
      r = Running(stage: "Merging video and audio", step: r.step)
    } else if line.contains("[ExtractAudio]") {
      r = Running(stage: "Extracting audio", step: r.step)
    } else {
      return
    }
    state = .running(r)
  }

  /// Runs the bundled yt-dlp, feeding each stdout line to `onLine`. Returns the exit code and the end of stderr.
  private func runYtDlp(
    _ args: [String], onLine: (String) -> Void, started: (Process) -> Void
  ) async -> (code: Int32, stderr: String) {
    let bin = Bundle.main.resourceURL!.appendingPathComponent("bin")
    let p = Process()
    p.executableURL = bin.appendingPathComponent("yt-dlp")
    p.arguments =
      ["--js-runtimes", "node", "--extractor-args", "youtube:player_client=default,tv_simply,android_vr,web_embedded"]
      + args
    var env = ProcessInfo.processInfo.environment
    env["PATH"] = bin.path + ":/usr/bin:/bin"
    // The bundled ffmpeg uses OpenSSL, which does not know where macOS keeps root certificates.
    env["SSL_CERT_FILE"] = "/etc/ssl/cert.pem"
    p.environment = env
    let out = Pipe()
    let err = Pipe()
    p.standardOutput = out
    p.standardError = err
    let exited = AsyncStream<Int32> { c in
      p.terminationHandler = {
        c.yield($0.terminationStatus)
        c.finish()
      }
    }

    do {
      try p.run()
    } catch {
      return (-1, error.localizedDescription)
    }
    started(p)

    let tail = Task.detached { () -> String in
      var lines: [String] = []
      do {
        for try await line in err.fileHandleForReading.bytes.lines {
          lines.append(line)
          if lines.count > 40 { lines.removeFirst() }
        }
      } catch {}
      return lines.joined(separator: "\n")
    }
    do {
      for try await line in out.fileHandleForReading.bytes.lines { onLine(line) }
    } catch {}

    var code: Int32 = -1
    for await c in exited { code = c }
    return (code, await tail.value)
  }

  private func uniqueDownload(_ filename: String) -> URL {
    let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
    let name = (filename as NSString).deletingPathExtension
    let ext = (filename as NSString).pathExtension
    var dest = dir.appendingPathComponent(filename)
    var n = 1
    while FileManager.default.fileExists(atPath: dest.path) {
      n += 1
      dest = dir.appendingPathComponent("\(name) \(n).\(ext)")
    }
    return dest
  }
}

struct ContentView: View {
  @Bindable var model: Downloader

  var body: some View {
    Form {
      Section {
        TextField("Link", text: $model.url, prompt: Text("https://www.youtube.com/watch?v=…"))
        if model.infoLoading || model.info != nil {
          Preview(info: model.info)
        }
      }

      Section {
        Picker("Quality", selection: $model.mode) {
          ForEach(Mode.allCases) { Text($0.label).tag($0) }
        }
      } footer: {
        Text(model.mode.hint).foregroundStyle(.secondary)
      }

      Section {
        Toggle("Cut a part of the video", isOn: $model.cut)
        if model.cut {
          TextField("From", text: $model.clipStart, prompt: Text("0:00"))
          TextField("To", text: $model.clipEnd, prompt: Text(model.info?.duration.map(clock) ?? "end"))
        }
      }
    }
    .formStyle(.grouped)
    .disabled(model.isRunning)
    .safeAreaInset(edge: .bottom) {
      BottomBar(model: model)
    }
    .frame(width: 480)
    .fixedSize(horizontal: false, vertical: true)
    .animation(.default, value: model.cut)
    .animation(.default, value: model.state)
    .onChange(of: model.url) { model.lookUp() }
  }
}

struct Preview: View {
  let info: Info?

  var body: some View {
    HStack(spacing: 12) {
      AsyncImage(url: info?.thumbnail.flatMap(URL.init(string:))) { image in
        image.resizable().scaledToFill()
      } placeholder: {
        Rectangle().fill(.quaternary)
      }
      .frame(width: 112, height: 63)
      .clipShape(.rect(cornerRadius: 8))

      VStack(alignment: .leading, spacing: 3) {
        Text(info?.title ?? "Looking up…")
          .fontWeight(.semibold)
          .lineLimit(2)
        Text([info?.uploader, info?.duration.map(clock)].compactMap { $0 }.joined(separator: " · "))
          .font(.callout)
          .foregroundStyle(.secondary)
      }
    }
    .opacity(info == nil ? 0.6 : 1)
  }
}

struct BottomBar: View {
  let model: Downloader

  var body: some View {
    VStack(spacing: 12) {
      switch model.state {
      case .idle:
        EmptyView()
      case .running(let r):
        VStack(alignment: .leading, spacing: 8) {
          if let percent = r.percent {
            ProgressView(value: percent, total: 100)
          } else {
            ProgressView().progressViewStyle(.linear)
          }
          HStack {
            Text(r.stage)
            Spacer()
            Text(details(r))
          }
          .font(.callout)
          .foregroundStyle(.secondary)
          .monospacedDigit()
        }
        .padding(14)
        .glassEffect(.regular, in: .rect(cornerRadius: 16))
      case .done(let file):
        HStack {
          Label(file.lastPathComponent, systemImage: "checkmark.circle.fill")
            .lineLimit(1)
            .truncationMode(.middle)
          Spacer()
          Button("Show in Finder") {
            NSWorkspace.shared.activateFileViewerSelecting([file])
          }
          .buttonStyle(.glass)
        }
        .padding(14)
        .glassEffect(.regular, in: .rect(cornerRadius: 16))
      case .failed(let message):
        Label(message, systemImage: "exclamationmark.triangle.fill")
          .foregroundStyle(.red)
          .textSelection(.enabled)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(14)
          .glassEffect(.regular, in: .rect(cornerRadius: 16))
      }

      if model.isRunning {
        Button(role: .cancel) {
          model.cancel()
        } label: {
          Text("Cancel").frame(maxWidth: .infinity)
        }
        .buttonStyle(.glass)
        .controlSize(.extraLarge)
      } else {
        Button {
          model.start()
        } label: {
          Text("Download").frame(maxWidth: .infinity)
        }
        .buttonStyle(.glassProminent)
        .controlSize(.extraLarge)
        .keyboardShortcut(.defaultAction)
        .disabled(model.url.trimmingCharacters(in: .whitespaces).isEmpty)
      }
    }
    .padding([.horizontal, .bottom], 20)
  }

  func details(_ r: Running) -> String {
    var parts: [String] = []
    if let percent = r.percent { parts.append("\(Int(percent))%") }
    if let speed = r.speed {
      parts.append(ByteCountFormatter.string(fromByteCount: Int64(speed), countStyle: .file) + "/s")
    }
    if let eta = r.eta { parts.append("\(clock(eta)) left") }
    return parts.joined(separator: " · ")
  }
}
