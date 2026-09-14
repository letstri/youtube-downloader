import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

export const Route = createFileRoute('/')({ component: Home })

type Status = {
  id: string
  status: 'running' | 'done' | 'error'
  stage: string
  percent: number | null
  filename: string | null
  size: number | null
  error: string | null
}

const MODES = [
  { value: 'max', label: 'Max quality (mkv, up to 4K+)' },
  { value: 'compatible', label: 'Compatible (mp4 H.264, up to 1080p)' },
  { value: 'audio', label: 'Audio only (mp3)' },
]

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function Home() {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState('max')
  const [job, setJob] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

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
      timer.current = setTimeout(() => void poll(id), 800)
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

  const running = job?.status === 'running'
  const done = job?.status === 'done'

  return (
    <main>
      <h1>YouTube Downloader</h1>
      <p className="sub">Paste a link, pick a quality, get the file.</p>

      <form onSubmit={start}>
        <input
          type="url"
          required
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="row">
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy}>
            {busy ? 'Working…' : 'Download'}
          </button>
        </div>
      </form>

      {(job || error) && (
        <div className="card">
          {running && (
            <>
              <div className={`bar${job.percent === null ? ' indet' : ''}`}>
                <i style={{ width: job.percent === null ? undefined : `${job.percent}%` }} />
              </div>
              <div className="meta">
                <span>{job.stage}</span>
                <span>{job.percent === null ? '' : `${job.percent}%`}</span>
              </div>
            </>
          )}

          {done && (
            <>
              <div className="meta">
                <span style={{ wordBreak: 'break-all' }}>{job.filename}</span>
                <span>{job.size ? mb(job.size) : ''}</span>
              </div>
              <a className="dl" href={`/api/download?id=${job.id}`}>
                Save file
              </a>
              <p className="meta" style={{ marginBottom: 0 }}>
                The file is deleted from the server once you save it.
              </p>
            </>
          )}

          {error && <p className="err">{error}</p>}
        </div>
      )}
    </main>
  )
}
