import { createFileRoute } from '@tanstack/react-router'
import { checkAuth, json } from '../../server/auth'
import { assertYoutubeUrl, createJob, getJob, isMode } from '../../server/jobs'

export const Route = createFileRoute('/api/jobs')({
  server: {
    handlers: {
      // Start a download. Body: { url, mode }
      POST: async ({ request }) => {
        const denied = checkAuth(request)
        if (denied) return denied

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json({ error: 'body must be JSON' }, 400)
        }

        const { url, mode } = (body ?? {}) as { url?: unknown; mode?: unknown }
        if (!isMode(mode)) return json({ error: 'mode must be max, compatible or audio' }, 400)

        let safeUrl: string
        try {
          safeUrl = assertYoutubeUrl(url)
        } catch (err) {
          return json({ error: (err as Error).message }, 400)
        }

        try {
          const job = await createJob(safeUrl, mode)
          return json({ id: job.id }, 202)
        } catch (err) {
          return json({ error: (err as Error).message }, 429)
        }
      },

      // Poll a download. Query: ?id=<job id>
      GET: async ({ request }) => {
        const denied = checkAuth(request)
        if (denied) return denied

        const id = new URL(request.url).searchParams.get('id')
        const job = id ? getJob(id) : undefined
        if (!job) return json({ error: 'job not found' }, 404)

        return json({
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
