<img src="public/logo.svg" alt="" width="72">

# youtube-downloader

Small TanStack Start service that wraps `yt-dlp`. Paste a YouTube link, pick a
quality, get the file. Built to run as a single container on Railway.

## Quality modes

| Mode | Format | Ceiling | Notes |
|---|---|---|---|
| `max` | mkv | 4K+ | Best stream YouTube has, any codec (AV1/VP9 + Opus). Plays in VLC/IINA, **not** QuickTime. |
| `compatible` | mp4 | 1080p | H.264 + AAC. YouTube does not serve H.264 above 1080p. Opens anywhere. |
| `audio` | mp3 | — | Audio track only. |

`max` uses mkv on purpose: it is the only container that muxes every codec
YouTube serves without re-encoding. Forcing mp4 there would either transcode
(slow) or produce a file QuickTime refuses.

## Running locally

```sh
npm install
npm run dev          # http://localhost:3000
```

Needs `yt-dlp` and `ffmpeg` on PATH: `brew install yt-dlp ffmpeg`.

```sh
npm test             # URL validation + progress parsing
npm run typecheck
npm run build && npm start
```

## Mac app

```sh
npm run mac   # -> mac/build/youtube-downloader.dmg (Apple Silicon)
```

A native SwiftUI app (macOS 26+, Liquid Glass) in `mac/`. It runs a bundled
yt-dlp, ffmpeg and node directly, with no web server, so downloads come from
your own connection. YouTube rarely bot-checks home IPs the way it does
Railway's. Saved files go to `~/Downloads`. The app is ad-hoc signed only: on
another Mac, open it once via System Settings → Privacy & Security → Open
Anyway.

## Deploying to Railway

1. Push this folder to a Git repo.
2. Railway → New Project → Deploy from repo. It reads `railway.json` and builds
   the `Dockerfile` (which installs `ffmpeg` and `yt-dlp` — Nixpacks will not).
3. Railway injects `PORT` on its own; do not set it.

There is no authentication. The deployed URL is a public YouTube downloader for
anyone who has the link, and every download bills egress twice (YouTube → the
instance → the browser). `MAX_CONCURRENT` is the only brake.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `MAX_CONCURRENT` | no (default `2`) | Simultaneous downloads. Raise only if the instance has the CPU for parallel ffmpeg merges. |
| `YTDLP_COOKIES` | no | Netscape-format cookie file **contents** (not a path), for videos behind "sign in to confirm you're not a bot" or age gates. |

## API

```sh
GET    /api/info?url=   -> {title, duration, thumbnail, uploader}, no download
POST   /api/jobs        {"url": "...", "mode": "max"}  -> 202 {"id"}
GET    /api/jobs?id=    -> {status, stage, percent, speed, eta, step, filename, size, error}
DELETE /api/jobs?id=    -> cancels a running job and deletes its files
GET    /api/download?id= -> the file, then deletes it server-side
```

## How it works

Typing a link hits `/api/info`, which runs `yt-dlp --skip-download` and prints
just four fields, so the page can show the title and thumbnail before you commit
to anything.

`POST /api/jobs` spawns `yt-dlp` into a temp dir and returns a job id. The
browser polls status until `done`, then hits `/api/download`, which streams the
file and deletes it on stream close.

Downloading to disk first is deliberate: `yt-dlp` writing to stdout silently
falls back to MPEG-TS (ignoring `--merge-output-format`, ~69% muxing overhead),
so streaming the merge directly cannot produce a real mp4.

### Nothing outlives its job

Video files are big and the disk is shared, so every path off the happy road
deletes too:

| What happens | When the files go |
|---|---|
| You save the file | On stream close, success or aborted mid-transfer |
| You press Cancel | Immediately, and `yt-dlp` is killed |
| The download fails | Immediately, including partial `.part` files |
| You never collect it | Swept 30 minutes after the job started |
| Redeploy or restart | On `SIGTERM`/`SIGINT`, before the process exits |
| The process was killed outright | Startup sweep reclaims stray `dl-*` dirs |

## Notes and limits

- **State is in memory and files are on local disk**, so this runs as exactly
  one Railway replica. Scaling out needs Redis for jobs and S3 for files.
- **Railway's disk is ephemeral.** Fine here, since files are temporary by
  design, but a job does not survive a restart.
- **`/api/info` is uncapped.** Only `MAX_CONCURRENT` downloads are limited; the
  metadata lookup is a ~1s process with a 20s timeout. Worth a rate limit if the
  URL ever gets shared around.
- **yt-dlp goes stale.** YouTube breaks extraction every few weeks; the symptom
  is `HTTP Error 403` partway through a download. The Dockerfile pulls the
  latest release at build time, so redeploying is the fix.
- **The bot wall is about the IP, not the code.** YouTube scores datacenter
  ranges (every Railway/VPS instance) far below home connections, so "prove
  it is not a bot" can happen on a perfectly public video. Every spawn already
  asks for extra player clients and solves the JS challenge with `node`, which
  clears most of them; the rest need `YTDLP_COOKIES`, or running it somewhere
  residential. Cookies exported from a real account get burned fast from a
  datacenter IP — use a throwaway account, not your own.
- Only YouTube hosts are accepted. That check is the SSRF boundary, not a
  convenience — `yt-dlp` will happily fetch internal addresses otherwise. It is
  also the only input restriction left, so keep it.
- Downloading videos you do not own may breach YouTube's Terms of Service.
  Your call what you point it at.
