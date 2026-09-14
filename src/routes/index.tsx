import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

export const Route = createFileRoute('/')({ component: Home })

type Status = {
  id: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  stage: string
  percent: number | null
  speed: number | null
  eta: number | null
  step: number
  filename: string | null
  size: number | null
  error: string | null
}

type Info = {
  title: string
  duration: number | null
  thumbnail: string | null
  uploader: string | null
}

const MODES = [
  { value: 'max', label: 'Max quality', hint: 'mkv · up to 4K+ · VLC/IINA' },
  { value: 'compatible', label: 'Compatible', hint: 'mp4 H.264 · up to 1080p · plays anywhere' },
  { value: 'audio', label: 'Audio only', hint: 'mp3' },
]

function size(bytes: number) {
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function clock(seconds: number) {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(rest)}` : `${m}:${pad(rest)}`
}

function Home() {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState('max')
  const [info, setInfo] = useState<Info | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [job, setJob] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const poller = useRef<ReturnType<typeof setTimeout>>(undefined)
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(
    () => () => {
      clearTimeout(poller.current)
      clearTimeout(debounce.current)
    },
    [],
  )

  // Look the video up as soon as the link looks plausible, so there is
  // something to confirm against before committing to a download.
  useEffect(() => {
    clearTimeout(debounce.current)
    setInfo(null)
    if (!/^https:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//.test(url)) {
      setInfoLoading(false)
      return
    }
    setInfoLoading(true)
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`)
        const data = await res.json()
        if (res.ok) setInfo(data)
      } catch {
        // A failed preview is not worth an error message; the download will say.
      } finally {
        setInfoLoading(false)
      }
    }, 500)
  }, [url])

  async function poll(id: string) {
    const res = await fetch(`/api/jobs?id=${id}`)
    const data = (await res.json()) as Status & { error?: string }
    if (!res.ok) {
      setError(data.error ?? 'lost track of the job')
      setBusy(false)
      return
    }
    setJob(data)
    if (data.status === 'running') {
      poller.current = setTimeout(() => void poll(id), 800)
    } else {
      setBusy(false)
      if (data.status === 'error') setError(data.error)
    }
  }

  async function start(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setJob(null)
    setBusy(true)

    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, mode }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? `request failed (${res.status})`)
      setBusy(false)
      return
    }
    void poll(data.id)
  }

  async function cancel() {
    if (!job) return
    clearTimeout(poller.current)
    await fetch(`/api/jobs?id=${job.id}`, { method: 'DELETE' })
    setJob(null)
    setBusy(false)
  }

  const running = job?.status === 'running'
  const done = job?.status === 'done'
  const selected = MODES.find((m) => m.value === mode)

  return (
    <main>
      <header>
        <h1>YouTube Downloader</h1>
        <p className="sub">Paste a link, pick a quality, get the file.</p>
      </header>

      <form onSubmit={start}>
        <input
          type="url"
          required
          autoFocus
          spellCheck={false}
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={running}
        />

        {(info || infoLoading) && (
          <div className={`preview${infoLoading ? ' loading' : ''}`}>
            {info?.thumbnail ? (
              <img src={info.thumbnail} alt="" width={112} height={63} />
            ) : (
              <div className="thumb-skeleton" />
            )}
            <div className="preview-text">
              <strong>{info ? info.title : 'Looking up…'}</strong>
              <span>
                {info?.uploader}
                {info?.uploader && info?.duration ? ' · ' : ''}
                {info?.duration ? clock(info.duration) : ''}
              </span>
            </div>
          </div>
        )}

        <fieldset disabled={running}>
          <legend>Quality</legend>
          {MODES.map((m) => (
            <label key={m.value} className={mode === m.value ? 'picked' : ''}>
              <input
                type="radio"
                name="mode"
                value={m.value}
                checked={mode === m.value}
                onChange={(e) => setMode(e.target.value)}
              />
              <span>{m.label}</span>
              <small>{m.hint}</small>
            </label>
          ))}
        </fieldset>

        <button type="submit" disabled={busy || !url}>
          {busy ? 'Working…' : `Download ${selected?.label.toLowerCase()}`}
        </button>
      </form>

      {(job || error) && (
        <div className="card">
          {running && (
            <>
              <div className={`bar${job.percent === null ? ' indet' : ''}`}>
                <i style={{ width: job.percent === null ? undefined : `${job.percent}%` }} />
              </div>
              <div className="meta">
                <span>
                  {job.stage}
                  {job.stage === 'downloading' && job.step > 1 ? ` · stream ${job.step}` : ''}
                </span>
                <span>{job.percent === null ? '' : `${job.percent}%`}</span>
              </div>
              <div className="meta">
                <span>{job.speed ? `${size(job.speed)}/s` : ''}</span>
                <span>{job.eta ? `${clock(job.eta)} left` : ''}</span>
              </div>
              <button type="button" className="ghost" onClick={cancel}>
                Cancel
              </button>
            </>
          )}

          {done && (
            <>
              <div className="meta">
                <span className="filename">{job.filename}</span>
                <span>{job.size ? size(job.size) : ''}</span>
              </div>
              <a className="dl" href={`/api/download?id=${job.id}`}>
                Save file
              </a>
              <p className="note">Saving it deletes it from the server.</p>
            </>
          )}

          {error && <p className="err">{error}</p>}
        </div>
      )}
    </main>
  )
}
