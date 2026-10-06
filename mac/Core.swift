import Foundation

struct Failure: LocalizedError {
  let errorDescription: String?
  init(_ message: String) { errorDescription = message }
}

enum Mode: String, CaseIterable, Identifiable {
  case compatible, max, audio

  var id: Self { self }

  var label: String {
    switch self {
    case .max: "Max quality"
    case .compatible: "Compatible"
    case .audio: "Audio only"
    }
  }

  var hint: String {
    switch self {
    case .max: "mkv · up to 4K+ · plays in VLC or IINA"
    case .compatible: "mp4 H.264 · up to 1080p · plays anywhere"
    case .audio: "mp3"
    }
  }

  var args: [String] {
    switch self {
    case .max: ["-f", "bv*+ba/b", "--merge-output-format", "mkv"]
    case .compatible:
      ["-f", "bv*[vcodec^=avc1]+ba[acodec^=mp4a]/b[ext=mp4]/b", "--merge-output-format", "mp4"]
    case .audio: ["-f", "ba/b", "-x", "--audio-format", "mp3"]
    }
  }
}

let progressTemplate =
  "download:PROG|%(progress.downloaded_bytes)s|%(progress.total_bytes,progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s"

struct Progress: Equatable {
  var percent: Double?
  var speed: Double?
  var eta: Double?
}

func parseProgress(_ line: String) -> Progress? {
  guard line.hasPrefix("PROG|") else { return nil }
  let parts = line.split(separator: "|", omittingEmptySubsequences: false).dropFirst().map { Double($0) }
  func at(_ i: Int) -> Double? {
    guard i < parts.count, let n = parts[i], n.isFinite else { return nil }
    return n
  }
  var percent: Double?
  if let done = at(0), let total = at(1), total > 0 { percent = min(100, done / total * 100) }
  return Progress(percent: percent, speed: at(2), eta: at(3))
}

func parseTime(_ raw: String) throws -> Double? {
  let text = raw.trimmingCharacters(in: .whitespaces)
  if text.isEmpty { return nil }
  guard text.range(of: #"^\d+(:\d{1,2}){0,2}(\.\d+)?$"#, options: .regularExpression) != nil else {
    throw Failure("\"\(raw)\" is not a time like 1:30 or 90.")
  }
  return text.split(separator: ":").reduce(0) { $0 * 60 + Double($1)! }
}

func clipArgs(_ start: Double?, _ end: Double?) throws -> [String] {
  if start == nil && end == nil { return [] }
  let from = start ?? 0
  if let end, end <= from { throw Failure("Clip end must be after its start.") }
  let to = end.map { String(format: "%g", $0) } ?? "inf"
  // Cutting at exact times re-encodes the clip, which is slower than a plain download.
  return ["--download-sections", "*\(String(format: "%g", from))-\(to)", "--force-keyframes-at-cuts"]
}

func friendlyError(_ stderr: String) -> String {
  let text = stderr.trimmingCharacters(in: .whitespacesAndNewlines)
  func has(_ pattern: String) -> Bool {
    text.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
  }
  if has("confirm you('|’)?re not a bot|Sign in to confirm") {
    return "YouTube wants this Mac to prove it is not a bot. Wait a while and try again."
  }
  if has("private video|video is private") { return "That video is private." }
  if has("members-only|join this channel") { return "That video is members-only." }
  if has("video (is )?unavailable") { return "That video is unavailable." }
  if has("confirm your age|age-restricted") { return "That video is age-restricted." }
  if has("HTTP Error 403") {
    return "YouTube refused the download part-way through. yt-dlp may be out of date, so rebuild the app."
  }
  if has("Unsupported URL|is not a valid URL") { return "yt-dlp did not recognise that link." }
  let lines = text.split(separator: "\n")
  if let error = lines.last(where: { $0.contains("ERROR") }) { return String(error) }
  return lines.last.map(String.init) ?? "yt-dlp failed without saying why."
}

/// Drops leading dots so a title like ".Intro" does not become a hidden file.
func visibleName(_ filename: String) -> String {
  let ext = (filename as NSString).pathExtension
  let stem = (filename as NSString).deletingPathExtension.drop { $0 == "." }
  return (stem.isEmpty ? "video" : String(stem)) + (ext.isEmpty ? "" : "." + ext)
}

func clock(_ seconds: Double) -> String {
  let s = Int(seconds.rounded())
  let (h, m, rest) = (s / 3600, s % 3600 / 60, s % 60)
  return h > 0 ? String(format: "%d:%02d:%02d", h, m, rest) : String(format: "%d:%02d", m, rest)
}

/// Compares release tags like "v1.2.0" against the running version "1.1".
func isNewer(_ tag: String, than current: String) -> Bool {
  func parts(_ s: String) -> [Int] {
    s.trimmingCharacters(in: CharacterSet(charactersIn: "v")).split(separator: ".").map { Int($0) ?? 0 }
  }
  let (a, b) = (parts(tag), parts(current))
  for i in 0..<max(a.count, b.count) {
    let (x, y) = (i < a.count ? a[i] : 0, i < b.count ? b[i] : 0)
    if x != y { return x > y }
  }
  return false
}
