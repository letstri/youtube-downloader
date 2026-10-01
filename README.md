<img src="public/logo.svg" alt="" width="72">

# youtube-downloader

Paste a YouTube link, pick a quality, optionally cut a part, get the file.
Built on `yt-dlp` and `ffmpeg`.

Quality options:
- **Max:** mkv, up to 4K. Plays in VLC or IINA, not QuickTime.
- **Compatible:** mp4, up to 1080p. Plays anywhere.
- **Audio:** mp3.

## Mac app (recommended)

```sh
npm run mac   # -> mac/build/youtube-downloader.dmg
```

Native SwiftUI app for Apple Silicon, macOS 26+. Everything it needs is bundled.
Files are saved to `~/Downloads`.

It downloads from your own connection, so YouTube's "confirm you're not a bot"
check rarely shows up. On another Mac, allow it once in System Settings →
Privacy & Security → Open Anyway.

## Web app

```sh
brew install yt-dlp ffmpeg
npm install
npm run dev   # http://localhost:3000
```

It also deploys to Railway as-is (`Dockerfile` + `railway.json`). But YouTube
blocks most datacenter IPs, so on Railway you will usually need
`YTDLP_COOKIES`: the contents of a Netscape cookie file from a throwaway
account. `MAX_CONCURRENT` (default `2`) limits simultaneous downloads.

The web app has no login: anyone with the URL can use it.

## Notes

- If downloads start failing with `HTTP Error 403`, yt-dlp is out of date.
  Rebuild the app or redeploy.
- Downloading videos you do not own may breach YouTube's Terms of Service.
