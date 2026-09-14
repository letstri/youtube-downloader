import { createFileRoute } from '@tanstack/react-router'
import { assertYoutubeUrl, createJob, getJob, isMode } from '../../server/jobs'

export const Route = createFileRoute('/api/jobs')({
  server: {
    handlers: {
      // Start a download. Body: { url, mode }
      POST: async ({ request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'body must be JSON' }, { status: 400 })
        }

        const { url, mode } = (body ?? {}) as { url?: unknown; mode?: unknown }
        if (!isMode(mode)) {
          return Response.json(
            { error: 'mode must be max, compatible or audio' },
            { status: 400 },
          )
        }

        let safeUrl: string
        try {
          safeUrl = assertYoutubeUrl(url)
        } catch (err) {
          return Response.json({ error: (err as Error).message }, { status: 400 })
        }

        try {
          const job = await createJob(safeUrl, mode)
          return Response.json({ id: job.id }, { status: 202 })
        } catch (err) {
          return Response.json({ error: (err as Error).message }, { status: 429 })
        }
      },

      // Poll a download. Query: ?id=<job id>
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
        })
      },
    },
  },
})
