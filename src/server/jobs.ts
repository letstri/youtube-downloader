import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
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

/**
 * Only https YouTube URLs are accepted. yt-dlp is happy to fetch arbitrary
 * hosts (including private network addresses), so this is the SSRF boundary,
 * not a convenience check. Never relax it to "any URL yt-dlp supports".
 */
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
  /** Max quality, any codec (AV1/VP9, 4K+). mkv because it muxes anything. */
  max: [
    '-f',
    'bv*+ba/b',
    '--merge-output-format',
    'mkv',
  ],
  /** H.264 + AAC, capped at 1080p by YouTube, but opens in QuickTime/iOS/anything. */
  compatible: [
    '-f',
    'bv*[vcodec^=avc1]+ba[acodec^=mp4a]/b[ext=mp4]/b',
    '--merge-output-format',
    'mp4',
  ],
  /** Audio only, mp3. */
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
  status: 'running' | 'done' | 'error'
  /** 0-100 for the file currently downloading, null before the first progress line. */
  percent: number | null
  stage: string
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

/**
 * yt-dlp writes one of these per progress tick because of --progress-template.
 * Format: `PROG|<downloaded bytes>|<total bytes or NA>`
 */
export function parseProgress(line: string): number | null {
  if (!line.startsWith('PROG|')) return null
  const [, doneRaw, totalRaw] = line.split('|')
  const done = Number(doneRaw)
  const total = Number(totalRaw)
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return null
  return Math.min(100, Math.round((done / total) * 100))
}

async function cookiesFile(dir: string): Promise<string[]> {
  const cookies = process.env.YTDLP_COOKIES
  if (!cookies) return []
  const path = join(dir, 'cookies.txt')
  await writeFile(path, cookies, 'utf8')
  return ['--cookies', path]
}

export async function createJob(url: string, mode: Mode): Promise<Job> {
  if (runningCount() >= MAX_CONCURRENT) {
    throw new Error(`Too many downloads running (limit ${MAX_CONCURRENT}). Try again shortly.`)
  }

  const id = randomUUID()
  const dir = await mkdtemp(join(tmpdir(), 'dl-'))

  const job: Job = {
    id,
    url,
    mode,
    status: 'running',
    percent: null,
    stage: 'starting',
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
    ...(await cookiesFile(dir)),
    '--no-playlist',
    '--newline',
    '--progress-template',
    'download:PROG|%(progress.downloaded_bytes)s|%(progress.total_bytes,progress.total_bytes_estimate)s',
    '--restrict-filenames',
    '-o',
    join(dir, '%(title)s.%(ext)s'),
    '--',
    url,
  ]

  // spawn with an argv array, never a shell string: the URL is user input.
  const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  job.proc = proc

  let stderrTail = ''

  proc.stdout.setEncoding('utf8')
  proc.stdout.on('data', (chunk: string) => {
    for (const line of chunk.split('\n')) {
      const percent = parseProgress(line)
      if (percent !== null) {
        job.percent = percent
        job.stage = 'downloading'
      } else if (line.includes('[Merger]')) {
        job.stage = 'merging'
        job.percent = null
      } else if (line.includes('[ExtractAudio]')) {
        job.stage = 'extracting audio'
        job.percent = null
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
  })

  proc.on('close', async (code) => {
    job.proc = null
    if (job.status === 'error') return
    if (code !== 0) {
      job.status = 'error'
      job.error = stderrTail.trim() || `yt-dlp exited with code ${code}`
      return
    }
    const files = (await readdir(dir, { withFileTypes: true }))
      .filter((f) => f.isFile() && f.name !== 'cookies.txt')
      .map((f) => f.name)
    const produced = files[0]
    if (!produced) {
      job.status = 'error'
      job.error = 'yt-dlp finished but produced no file'
      return
    }
    const { size } = await import('node:fs/promises').then((fs) => fs.stat(join(dir, produced)))
    job.filename = produced
    job.size = size
    job.stage = 'ready'
    job.percent = 100
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

// ponytail: in-memory job map + interval sweep. Single Railway instance only.
// If this ever scales past one replica, jobs need Redis and files need S3.
const sweep = setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS
  for (const job of jobs.values()) {
    if (job.createdAt < cutoff) void discardJob(job.id)
  }
}, 5 * 60 * 1000)
sweep.unref?.()
