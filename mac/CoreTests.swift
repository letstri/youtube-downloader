// Run by mac/build.sh before building the app.

@main
enum CoreTests {
  static func main() {
    precondition(parseProgress("PROG|500|1000|250000|12") == Progress(percent: 50, speed: 250000, eta: 12))
    precondition(parseProgress("PROG|2000|1000|1|1")?.percent == 100)
    precondition(parseProgress("PROG|0|NA|NA|NA") == Progress())
    precondition(parseProgress("[download] Destination: foo.mp4") == nil)

    precondition(try! parseTime("") == nil)
    precondition(try! parseTime("40") == 40)
    precondition(try! parseTime("1:10") == 70)
    precondition(try! parseTime("1:02:03.5") == 3723.5)
    for bad in ["abc", "-5", "1:2:3:4", "10-40", "*10"] {
      precondition((try? parseTime(bad)) == nil, "should have rejected \(bad)")
    }

    precondition(try! clipArgs(nil, nil) == [])
    precondition(try! clipArgs(10, 40).prefix(2) == ["--download-sections", "*10-40"])
    precondition(try! clipArgs(nil, 40)[1] == "*0-40")
    precondition(try! clipArgs(10, nil)[1] == "*10-inf")
    precondition(try! clipArgs(10.5, 20)[1] == "*10.5-20")
    precondition((try? clipArgs(40, 10)) == nil)
    precondition((try? clipArgs(10, 10)) == nil)

    precondition(friendlyError("ERROR: [youtube] x: Sign in to confirm you’re not a bot").contains("bot"))
    precondition(friendlyError("ERROR: [youtube] x: Private video") == "That video is private.")
    precondition(friendlyError("noise\nERROR: something new\nmore noise") == "ERROR: something new")
    precondition(friendlyError("") == "yt-dlp failed without saying why.")

    precondition(clock(70) == "1:10" && clock(3723) == "1:02:03")

    precondition(isNewer("v1.1", than: "1.0"))
    precondition(isNewer("v1.0.1", than: "1.0"))
    precondition(isNewer("v1.10", than: "1.9"))
    precondition(!isNewer("v1.0.0", than: "1.0"))
    precondition(!isNewer("v0.9", than: "1.0"))
    print("core tests passed")
  }
}
