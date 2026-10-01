import { createFileRoute } from '@tanstack/react-router'
import {
  assertYoutubeUrl,
  cancelJob,
  clipArgs,
  createJob,
  getJob,
  isMode,
  parseTime,
} from '../../server/jobs'

export const Route = createFileRoute('/api/jobs')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'body must be JSON' }, { status: 400 })
        }

        const { url, mode, start, end } = (body ?? {}) as Record<string, unknown>
        if (!isMode(mode)) {
          return Response.json(
            { error: 'mode must be max, compatible or audio' },
            { status: 400 },
          )
        }

        let safeUrl: string
        let clip: string[]
        try {
          safeUrl = assertYoutubeUrl(url)
          clip = clipArgs(parseTime(start), parseTime(end))
        } catch (err) {
          return Response.json({ error: (err as Error).message }, { status: 400 })
        }

        try {
          const job = await createJob(safeUrl, mode, clip)
          return Response.json({ id: job.id }, { status: 202 })
        } catch (err) {
          return Response.json({ error: (err as Error).message }, { status: 429 })
        }
      },

      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get('id')
        const job = id ? getJob(id) : undefined
        if (!job) return Response.json({ error: 'job not found' }, { status: 404 })

        return Response.json({
          id: job.id,
          status: job.status,
          stage: job.stage,
          percent: job.percent,
          filename: job.filename,
          size: job.size,
          error: job.error,
          speed: job.speed,
          eta: job.eta,
          step: job.step,
        })
      },

      DELETE: async ({ request }) => {
        const id = new URL(request.url).searchParams.get('id')
        if (!id) return Response.json({ error: 'id is required' }, { status: 400 })
        const cancelled = await cancelJob(id)
        return Response.json({ cancelled })
      },
    },
  },
})
