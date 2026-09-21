import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
])

const DIR_PREFIX = 'dl-'

export function assertYoutubeUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 2048) {
    throw new Error('url must be a string')
  }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('url is not a valid URL')
  }
  if (parsed.protocol !== 'https:') throw new Error('url must be https')
  if (!YOUTUBE_HOSTS.has(parsed.hostname)) {
    throw new Error(`host "${parsed.hostname}" is not a YouTube host`)
  }
  return parsed.toString()
}

export const MODES = {
  max: ['-f', 'bv*+ba/b', '--merge-output-format', 'mkv'],
  compatible: [
    '-f',
    'bv*[vcodec^=avc1]+ba[acodec^=mp4a]/b[ext=mp4]/b',
    '--merge-output-format',
    'mp4',
  ],
  audio: ['-f', 'ba/b', '-x', '--audio-format', 'mp3'],
} as const

export type Mode = keyof typeof MODES

export function isMode(value: unknown): value is Mode {
  return typeof value === 'string' && value in MODES
}

export type Job = {
  id: string
  url: string
  mode: Mode
  status: 'running' | 'done' | 'error' | 'cancelled'
  percent: number | null
  speed: number | null
  eta: number | null
  stage: string
  step: number
  filename: string | null
  size: number | null
  error: string | null
  dir: string
  createdAt: number
  proc: ChildProcess | null
}

const jobs = new Map<string, Job>()

const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT ?? 2)
const JOB_TTL_MS = 30 * 60 * 1000

export function getJob(id: string): Job | undefined {
  return jobs.get(id)
}

export function runningCount(): number {
  let n = 0
  for (const job of jobs.values()) if (job.status === 'running') n++
  return n
}

export type Progress = {
  percent: number | null
  speed: number | null
  eta: number | null
}

export function parseProgress(line: string): Progress | null {
  if (!line.startsWith('PROG|')) return null
  const [, doneRaw, totalRaw, speedRaw, etaRaw] = line.split('|')

  const num = (raw: string | undefined) => {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }

  const done = num(doneRaw)
  const total = num(totalRaw)
  const percent =
    done !== null && total !== null && total > 0
      ? Math.min(100, Math.round((done / total) * 100))
      : null

  return { percent, speed: num(speedRaw), eta: num(etaRaw) }
}

export function friendlyError(stderr: string): string {
  const text = stderr.trim()
  if (/confirm you(')?re not a bot|Sign in to confirm/i.test(text)) {
    return 'YouTube is asking this server to prove it is not a bot. Set YTDLP_COOKIES to get past it.'
  }
  if (/private video|video is private/i.test(text)) return 'That video is private.'
  if (/members-only|join this channel/i.test(text)) return 'That video is members-only.'
  if (/video (is )?unavailable/i.test(text)) return 'That video is unavailable.'
  if (/age|confirm your age/i.test(text) && /restrict/i.test(text)) {
    return 'That video is age-restricted. Set YTDLP_COOKIES to get past it.'
  }
  if (/HTTP Error 403/i.test(text)) {
    return 'YouTube refused the download part-way through. This usually means yt-dlp is out of date — redeploy to rebuild it.'
  }
  if (/Unsupported URL|is not a valid URL/i.test(text)) return 'yt-dlp did not recognise that link.'
  return text || 'yt-dlp failed without saying why.'
}

const COMMON_ARGS = [
  '--js-runtimes',
  'node',
  '--extractor-args',
  'youtube:player_client=default,tv_simply,android_vr,web_embedded',
]

if (process.env.YTDLP_COOKIES) {
  const dir = mkdtempSync(join(tmpdir(), 'ytdlp-cookies-'))
  const path = join(dir, 'cookies.txt')
  writeFileSync(path, process.env.YTDLP_COOKIES, 'utf8')
  COMMON_ARGS.push('--cookies', path)
}

export async function fetchInfo(url: string): Promise<{
  title: string
  duration: number | null
  thumbnail: string | null
  uploader: string | null
}> {
  const args = [
    ...COMMON_ARGS,
    '--no-playlist',
    '--skip-download',
    '--no-warnings',
    '--print',
    '%(.{title,duration,thumbnail,uploader})j',
    '--',
    url,
  ]

  return await new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL')
      reject(new Error('Timed out reading video info.'))
    }, 20_000)

    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (c: string) => (out += c))
    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', (c: string) => (err = (err + c).slice(-2000)))

    proc.on('error', (e) => {
      clearTimeout(timeout)
      reject(
        new Error(
          e.message.includes('ENOENT')
            ? 'yt-dlp is not installed on the server'
            : e.message,
        ),
      )
    })

    proc.on('close', (code) => {
      clearTimeout(timeout)
      if (code !== 0) return reject(new Error(friendlyError(err)))
      try {
        const info = JSON.parse(out.trim().split('\n')[0] ?? '{}')
        resolve({
          title: info.title ?? 'Untitled',
          duration: typeof info.duration === 'number' ? info.duration : null,
          thumbnail: info.thumbnail ?? null,
          uploader: info.uploader ?? null,
        })
      } catch {
        reject(new Error('Could not read video info.'))
      }
    })
  })
}

export async function createJob(url: string, mode: Mode): Promise<Job> {
  if (runningCount() >= MAX_CONCURRENT) {
    throw new Error(`Too many downloads running (limit ${MAX_CONCURRENT}). Try again shortly.`)
  }

  const id = randomUUID()
  const dir = await mkdtemp(join(tmpdir(), DIR_PREFIX))

  const job: Job = {
    id,
    url,
    mode,
    status: 'running',
    percent: null,
    speed: null,
    eta: null,
    stage: 'starting',
    step: 0,
    filename: null,
    size: null,
    error: null,
    dir,
    createdAt: Date.now(),
    proc: null,
  }
  jobs.set(id, job)

  const args = [
    ...MODES[mode],
    ...COMMON_ARGS,
    '--no-playlist',
    '--newline',
    '--progress-template',
    'download:PROG|%(progress.downloaded_bytes)s|%(progress.total_bytes,progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s',
    '--restrict-filenames',
    '-o',
    join(dir, '%(title)s.%(ext)s'),
    '--',
    url,
  ]

  const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  job.proc = proc

  let stderrTail = ''

  proc.stdout.setEncoding('utf8')
  proc.stdout.on('data', (chunk: string) => {
    for (const line of chunk.split('\n')) {
      const progress = parseProgress(line)
      if (progress) {
        job.percent = progress.percent
        job.speed = progress.speed
        job.eta = progress.eta
        job.stage = 'downloading'
      } else if (line.includes('Destination:')) {
        job.step += 1
      } else if (line.includes('[Merger]')) {
        job.stage = 'merging video and audio'
        job.percent = null
        job.speed = null
        job.eta = null
      } else if (line.includes('[ExtractAudio]')) {
        job.stage = 'extracting audio'
        job.percent = null
        job.speed = null
        job.eta = null
      }
    }
  })

  proc.stderr.setEncoding('utf8')
  proc.stderr.on('data', (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-2000)
  })

  proc.on('error', (err) => {
    job.status = 'error'
    job.error =
      err.message.includes('ENOENT')
        ? 'yt-dlp is not installed on the server'
        : err.message
    void rm(job.dir, { recursive: true, force: true })
  })

  proc.on('close', async (code) => {
    job.proc = null
    if (job.status === 'error' || job.status === 'cancelled') return

    if (code !== 0) {
      job.status = 'error'
      job.error = friendlyError(stderrTail)
      void rm(job.dir, { recursive: true, force: true })
      return
    }

    const files = (await readdir(dir, { withFileTypes: true }))
      .filter((f) => f.isFile())
      .map((f) => f.name)
    const produced = files[0]

    if (!produced) {
      job.status = 'error'
      job.error = 'yt-dlp finished but produced no file'
      void rm(job.dir, { recursive: true, force: true })
      return
    }

    job.filename = produced
    job.size = (await stat(join(dir, produced))).size
    job.stage = 'ready'
    job.percent = 100
    job.speed = null
    job.eta = null
    job.status = 'done'
  })

  return job
}

export async function discardJob(id: string): Promise<void> {
  const job = jobs.get(id)
  if (!job) return
  jobs.delete(id)
  job.proc?.kill('SIGKILL')
  await rm(job.dir, { recursive: true, force: true })
}

export async function cancelJob(id: string): Promise<boolean> {
  const job = jobs.get(id)
  if (!job || job.status !== 'running') return false
  job.status = 'cancelled'
  await discardJob(id)
  return true
}

async function sweepOrphans(): Promise<void> {
  const live = new Set([...jobs.values()].map((j) => j.dir))
  const base = tmpdir()
  let entries: string[]
  try {
    entries = await readdir(base)
  } catch {
    return
  }
  for (const name of entries) {
    if (!name.startsWith(DIR_PREFIX)) continue
    const path = join(base, name)
    if (live.has(path)) continue
    await rm(path, { recursive: true, force: true }).catch(() => {})
  }
}

void sweepOrphans()

const sweep = setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS
  for (const job of jobs.values()) {
    if (job.createdAt < cutoff) void discardJob(job.id)
  }
  void sweepOrphans()
}, 5 * 60 * 1000)
sweep.unref?.()

let shuttingDown = false
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return
    shuttingDown = true
    for (const job of jobs.values()) {
      job.proc?.kill('SIGKILL')
      try {
        rmSync(job.dir, { recursive: true, force: true })
      } catch {}
    }
    process.exit(0)
  })
}
